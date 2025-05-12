/*
 Licensed to the Apache Software Foundation (ASF) under one
 or more contributor license agreements.  See the NOTICE file
 distributed with this work for additional information
 regarding copyright ownership.  The ASF licenses this file
 to you under the Apache License, Version 2.0 (the
 "License"); you may not use this file except in compliance
 with the License.  You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing,
 software distributed under the License is distributed on an
 "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 KIND, either express or implied.  See the License for the
 specific language governing permissions and limitations
 under the License.
*/

"use strict";

const express    = require('express');
const morgan     = require('morgan');
const session    = require('express-session');
const kcConnect  = require('keycloak-connect');
const cors       = require('cors');
const formidable = require('formidable');
const yaml       = require('js-yaml');
const bodyParser = require('body-parser');
const crypto     = require('crypto');
const db         = require('./db.js');
const siteTemplates = require('./site-templates.js');
const crdTemplates  = require('./crd-templates.js');
const kube       = require('./common/kube.js');
const Log        = require('./common/log.js').Log;
const sync       = require('./sync-management.js');
const adminApi   = require('./api-admin.js');
const userApi    = require('./api-user.js');
const util       = require('./common/util.js');
const common     = require('./common/common.js');
const path       = require('path');
const compose    = require('./compose.js');

const API_PREFIX = '/api/v1alpha1/';
const API_PORT   = 8085;
const app = express();
//const memoryStore = new session.MemoryStore();
//app.use(
//    session({
//      secret: 'mySecret',
//      resave: false,
//      saveUninitialized: true,
//      store: memoryStore,
//    })
//  );
//const keycloak    = new kcConnect({store: memoryStore});
const keycloak = {
    protect : function(arg) { return (req, res, next) => { next(); } }
};

const link_config_map_yaml = function(name, data) {
    let configMap = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
            name: name,
            annotations: {},
        },
        data: data,
    };

    configMap.metadata.annotations[common.META_ANNOTATION_STATE_HASH] = siteTemplates.HashOfConfigMap(configMap);
    return "---\n" + yaml.dump(configMap);
}

const claim_config_map_yaml = function(claimId, hostname, port, interactive, namePrefix) {
    let configMap = {
        apiVersion : 'v1',
        kind       : 'ConfigMap',
        metadata   : {
            name        : 'skupperx-claim',
            annotations : {
                [common.META_ANNOTATION_SKUPPERX_CONTROLLED] : 'true',
            },
        },
        data: {
            claimId     : claimId,
            host        : hostname,
            port        : port,
            interactive : interactive ? 'true' : 'false',
        }
    };

    if (namePrefix) {
        configMap.data.namePrefix = namePrefix;
    }

    return "---\n" + yaml.dump(configMap);
}

const fetchInvitationKube = async function (iid, res) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        const result = await client.query("SELECT MemberInvitations.*, TlsCertificates.ObjectName as secret_name, ApplicationNetworks.VanId, " +
                                          "BackboneAccessPoints.Id as accessid, BackboneAccessPoints.Hostname, BackboneAccessPoints.Port FROM MemberInvitations " +
                                          "JOIN TlsCertificates ON MemberInvitations.Certificate = TlsCertificates.Id " +
                                          "JOIN ApplicationNetworks ON MemberInvitations.MemberOf = ApplicationNetworks.Id " +
                                          "JOIN BackboneAccessPoints ON MemberInvitations.ClaimAccess = BackboneAccessPoints.Id " +
                                          "WHERE MemberInvitations.Id = $1 AND BackboneAccessPoints.Lifecycle = 'ready' AND MemberInvitations.Lifecycle = 'ready'", [iid]);
        if (result.rowCount == 1) {
            const row = result.rows[0];
            const secret = await kube.LoadSecret(row.secret_name);
            let text = '';

            text += siteTemplates.ServiceAccountYaml();
            text += siteTemplates.MemberRoleYaml();
            text += siteTemplates.RoleBindingYaml();
            text += siteTemplates.ConfigMapYaml('edge', null, row.vanid);
            text += siteTemplates.DeploymentYaml(iid, false);
            text += siteTemplates.SiteApiServiceYaml();
            text += siteTemplates.SecretYaml(secret, 'skupperx-claim', false);
            text += claim_config_map_yaml(row.id, row.hostname, row.port, row.interactiveclaim, row.membernameprefix);

            res.status(returnStatus).send(text);

            //
            // Bump the fetch-count for the invitation.
            //
            await client.query("UPDATE MemberInvitations SET FetchCount = FetchCount + 1 WHERE Id = $1", [row.id]);
        } else {
            throw(Error('Valid invitation not found'));
        }
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }

    return returnStatus;
}

const fetchBackboneSiteKube = async function (siteId, res) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            'SELECT InteriorSites.Name as sitename, InteriorSites.Certificate, InteriorSites.Lifecycle, InteriorSites.DeploymentState, TlsCertificates.ObjectName as secret_name FROM InteriorSites ' +
            'JOIN TlsCertificates ON InteriorSites.Certificate = TlsCertificates.Id WHERE Interiorsites.Id = $1', [siteId]);
        if (result.rowCount == 1) {
            if (result.rows[0].deploymentstate == 'deployed') {
                throw(Error("Not permitted, site already deployed"));
            }
            if (result.rows[0].deploymentstate == 'not-ready') {
                throw(Error("Not permitted, site not ready for deployment"));
            }
            let secret = await kube.LoadSecret(result.rows[0].secret_name);
            let text = '';
            text += siteTemplates.ServiceAccountYaml();
            text += siteTemplates.BackboneRoleYaml();
            text += siteTemplates.RoleBindingYaml();
            text += siteTemplates.ConfigMapYaml('interior', result.rows[0].sitename);
            text += siteTemplates.DeploymentYaml(siteId, true);
            text += siteTemplates.SecretYaml(secret, `skx-site-${siteId}`, common.INJECT_TYPE_SITE, `tls-site-${siteId}`);

            const links = await sync.GetBackboneLinks_TX(client, siteId);
            for (const [linkId, linkData] of Object.entries(links)) {
                text += siteTemplates.LinkConfigMapYaml(linkId, linkData);
            }

            const accessPoints = await sync.GetBackboneAccessPoints_TX(client, siteId, true);
            for (const [apId, apData] of Object.entries(accessPoints)) {
                text += siteTemplates.AccessPointConfigMapYaml(apId, apData);
            }

            res.status(returnStatus).send(text);
        } else {
            throw Error('Site secret not found');
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        returnStatus = 400;
        res.status(returnStatus).send(err.message);
    } finally {
        client.release();
    }

    return returnStatus;
}

const fetchBackboneSiteCrd = async function (siteId, res) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            "SELECT Name, DeploymentState, Certificate, TlsCertificates.ObjectName FROM InteriorSites " +
            "JOIN TlsCertificates ON Certificate = TlsCertificates.Id WHERE Interiorsites.Id = $1", [siteId]);
        if (result.rowCount == 1) {
            const site = result.rows[0];
            if (site.deploymentstate == 'deployed') {
                throw(Error("Not permitted, site already deployed"));
            }
            if (site.deploymentstate == 'not-ready') {
                throw(Error("Not permitted, site not ready for deployment"));
            }
            const secret = await kube.LoadSecret(site.objectname);
            let text = '';
            text += siteTemplates.SecretYaml(secret, `tls-client-${site.certificate}`, false);

            const links = await sync.GetBackboneLinks_TX(client, siteId);
            for (const [linkId, linkData] of Object.entries(links)) {
                text += siteTemplates.LinkConfigMapYaml(linkId, linkData);
            }

            const accessPoints = await sync.GetBackboneAccessPoints_TX(client, siteId, true);
            for (const [apId, apData] of Object.entries(accessPoints)) {
                text += siteTemplates.AccessPointConfigMapYaml(apId, apData);
            }

            text += "---\n" + yaml.dump(crdTemplates.BackboneSite(site.name, siteId));

            res.status(returnStatus).send(text);
        } else {
            throw Error('Site secret not found');
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        returnStatus = 400;
        res.status(returnStatus).send(err.message);
    } finally {
        client.release();
    }

    return returnStatus;
}

const fetchBackboneAccessPointsKube = async function (bsid, res) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            'SELECT DeploymentState FROM InteriorSites WHERE Id = $1', [bsid]);
        if (result.rowCount == 1) {
            let site = result.rows[0];

            if (site.deploymentstate != 'ready-bootstrap') {
                throw(Error('Not permitted, site not ready for bootstrap deployment'));
            }

            let text = '';
            const ap_result = await client.query("SELECT TlsCertificates.ObjectName, BackboneAccessPoints.Id as apid, Lifecycle, Kind FROM BackboneAccessPoints " +
                                                 "JOIN TlsCertificates ON TlsCertificates.Id = Certificate " +
                                                 "WHERE BackboneAccessPoints.InteriorSite = $1", [bsid]);
            for (const ap of ap_result.rows) {
                if (ap.lifecycle != 'ready') {
                    throw Error(`Certificate for access point of kind ${ap.kind} is not yet ready`);
                }
                let secret = await kube.LoadSecret(ap.objectname);
                text += siteTemplates.SecretYaml(secret, `skx-access-${ap.apid}`, common.INJECT_TYPE_ACCESS_POINT, `tls-server-${ap.apid}`);
            }

            res.status(returnStatus).send(text);
        } else {
            throw Error('Site not found');
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }

    return returnStatus;
}

const fetchBackboneLinksOutgoingKube = async function (bsid, res) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const outgoing = await sync.GetBackboneLinks_TX(client, bsid);
        res.status(returnStatus).send(link_config_map_yaml('skupperx-outgoing', outgoing));
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        returnStatus = 400;
        res.status(returnStatus).send(err.message);
    } finally {
        client.release();
    }

    return returnStatus;
}

exports.AddHostToAccessPoint = async function(siteId, apid, hostname, port) {
    let retval = 1;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query(`SELECT Id, Lifecycle, Hostname, Port, Kind FROM BackboneAccessPoints WHERE Id = $1 AND InteriorSite = $2`, [apid, siteId]);
        if (result.rowCount == 1) {
            let access = result.rows[0];
            if (access.hostname != hostname || access.port != port) {
                if (access.hostname) {
                    throw Error(`Referenced access (${access.access_ref}) already has a hostname`);
                }
                if (access.lifecycle != 'partial') {
                    throw Error(`Referenced access (${access.access_ref}) has lifecycle ${access.lifecycle}, expected partial`);
                }
                await client.query("UPDATE BackboneAccessPoints SET Hostname = $1, Port=$2, Lifecycle='new' WHERE Id = $3", [hostname, port, apid]);
            }
            await client.query("COMMIT");

            //
            // Alert the sync module that an access point has advanced from 'partial' state if this is a peer ingress
            //
            if (access.kind == 'peer') {
                await sync.NewIngressAvailable(siteId);
            }
        } else {
            throw Error(`Access point not found for site ${siteId} (${apid})`);
        }
    } catch (err) {
        await client.query('ROLLBACK');
        Log(`Host add to AccessPoint failed: ${err.message}`);
        retval = 0;
    } finally {
        client.release();
    }
    return retval;
}

const postBackboneIngress = async function (bsid, req, res) {
    var returnStatus = 201;
    const form = new formidable.IncomingForm();
    try {
        let count = 0;
        const [fields, files] = await form.parse(req);
        for (const [apid, apdata] of Object.entries(fields)) {
            if (!util.IsValidUuid(apid)) {
                throw new Error(`Invalid access-point identifier ${apid}`);
            }
            const norm = util.ValidateAndNormalizeFields(apdata, {
                'host' : {type: 'string', optional: false},
                'port' : {type: 'number', optional: false},
            });

            count += await exports.AddHostToAccessPoint(bsid, apid, norm.host, norm.port);
        }

        if (count == 0) {
            throw new Error('No valid ingress records posted');
        }

        res.status(returnStatus).json({ processed: count });
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    }

    return returnStatus;
}

const getTargetPlatforms = async function (req, res) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query("SELECT ShortName, LongName FROM TargetPlatforms");
        res.status(returnStatus).json(result.rows);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        returnStatus = 400;
        res.status(returnStatus).send(err.message);
    } finally {
        client.release();
    }

    return returnStatus;
}

exports.Start = async function() {
    Log('[API Server module started]');
    app.use(cors());
    //app.set('trust proxy', true );
    //app.use(keycloak.middleware());

    //app.get('/', keycloak.protect('realm:van-owner'));

    // Serve the frontend build from the './console' directory
    const consoleBuildPath = path.join(__dirname, 'console');
    app.use(express.static(consoleBuildPath));

    morgan.token('ts', (req, res) => {
        return new Date().toISOString();
    });

    app.use(morgan(':ts :remote-addr :remote-user :method :url :status :res[content-length] :response-time ms'));

    app.get(API_PREFIX + 'invitations/:iid/kube', async (req, res) => {
        await fetchInvitationKube(req.params.iid, res);
    });

    app.get(API_PREFIX + 'backbonesite/:bsid/:target', async (req, res) => {
        switch (req.params.target) {
            case 'sk2'  : await fetchBackboneSiteCrd(req.params.bsid, res);   break;
            case 'kube' : await fetchBackboneSiteKube(req.params.bsid, res);  break;
            default:
                res.status(400).send(`Unsupported target: ${req.params.target}`);
        }
    });

    app.get(API_PREFIX + 'backbonesite/:bsid/accesspoints/:target', async (req, res) => {
        switch (req.params.target) {
            case 'sk2'  :
            case 'kube' :
                await fetchBackboneAccessPointsKube(req.params.bsid, res);
                break;
            default:
                res.status(400).send(`Unsupported target: ${req.params.target}`);
        }
    });

    app.get(API_PREFIX + 'backbonesite/:bsid/links/outgoing/kube', async (req, res) => {
        await fetchBackboneLinksOutgoingKube(req.params.bsid, res);
    });

    app.post(API_PREFIX + 'backbonesite/:bsid/ingress', async (req, res) => {
        await postBackboneIngress(req.params.bsid, req, res);
    });

    app.get(API_PREFIX + 'targetplatforms', async (req, res) => {
        await getTargetPlatforms(req, res);
    });

    app.use(bodyParser.text({ type: ['application/yaml'] }));

    adminApi.Initialize(app, keycloak);
    userApi.Initialize(app, keycloak);
    compose.ApiInit(app);

    app.use((req, res) => {
        res.status(404).send('invalid path');
    });

    let server = app.listen(API_PORT, () => {
        let host = server.address().address;
        let port = server.address().port;
        if (host[0] == ':') {
            host = '[' + host + ']';
        }
        Log(`API Server listening on http://${host}:${port}`);
    });
}