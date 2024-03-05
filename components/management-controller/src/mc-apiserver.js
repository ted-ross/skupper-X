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
const cors       = require('cors');
const formidable = require('formidable');
const yaml       = require('js-yaml');
const crypto     = require('crypto');
const db         = require('./db.js');
const siteTemplates = require('./site-templates.js');
const kube       = require('./common/kube.js');
const { isObject } = require('util');
const Log        = require('./common/log.js').Log;
const sync       = require('./manage-sync.js');
const adminApi   = require('./api-admin.js');
const userApi    = require('./api-user.js');

const API_PREFIX = '/api/v1alpha1/';
const API_PORT   = 8085;
var api;

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

    configMap.metadata.annotations['skupper.io/skx-hash'] = sync.HashOfConfigMap(configMap);
    return yaml.dump(configMap);
}

const claim_config_map_yaml = function(claimId, hostname, port, interactive) {
    let configMap = {
        apiVersion : 'v1',
        kind       : 'ConfigMap',
        metadata   : {
            name        : 'skupperx-claim',
            annotations : {
                'skupper.io/skx-interactive' : interactive ? 'true' : 'false',
            },
        },
        data: {}
    };

    configMap.data[claimId] = JSON.stringify({
        host: hostname,
        port: port,
    });

    configMap.metadata.annotations['skupper.io/skx-hash'] = sync.HashOfConfigMap(configMap);
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
            text += siteTemplates.ConfigMapYaml('edge', row.vanid);
            text += siteTemplates.DeploymentYaml(iid, false);
            text += siteTemplates.SiteApiServiceYaml();
            text += siteTemplates.SecretYaml(secret, 'claim', false);
            text += claim_config_map_yaml(row.id, row.hostname, row.port, row.interactiveclaim);

            res.send(text);
            res.status(returnStatus).end();
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
            'SELECT InteriorSites.Certificate, InteriorSites.Lifecycle, InteriorSites.DeploymentState, TlsCertificates.ObjectName as secret_name FROM InteriorSites ' +
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
            text += siteTemplates.ConfigMapYaml('interior');
            text += siteTemplates.DeploymentYaml(siteId, true);
            text += siteTemplates.SecretYaml(secret, 'site-client', true);

            const outgoing = await sync.GetBackboneConnectors_TX(client, siteId);
            text += "---\n" + link_config_map_yaml('skupperx-links-outgoing', outgoing);

            const incoming = await sync.GetBackboneIngresses_TX(client, siteId, true);
            text += "---\n" + link_config_map_yaml('skupperx-links-incoming', incoming)

            res.send(text);
            res.status(returnStatus).end();
        } else {
            throw Error('Site secret not found');
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        returnStatus = 400;
        res.send(err.message);
        res.status(returnStatus).end();
    } finally {
        client.release();
    }

    return returnStatus;
}

const fetchBackboneLinksIncomingKube = async function (bsid, res) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            'SELECT ManageAccess, PeerAccess, DeploymentState FROM InteriorSites WHERE Id = $1', [bsid]);
        if (result.rowCount == 1) {
            let site = result.rows[0];

            if (site.deploymentstate != 'ready-bootstrap') {
                throw(Error('Not permitted, site not ready for bootstrap deployment'));
            }

            let text = '';
            let incoming = {};
            const worklist = [
                {ap_ref: site.manageaccess, profile: 'manage'},
                {ap_ref: site.peeraccess,   profile: 'peer'},
                {ap_ref: null,              profile: 'member'}, // Let member and claim get picked up later during reconciliation
                {ap_ref: null,              profile: 'claim'},
            ]

            for (const work of worklist) {
                if (work.ap_ref) {
                    const ap_result = await client.query("SELECT *, TlsCertificates.ObjectName FROM BackboneAccessPoints " +
                                                         "JOIN TlsCertificates ON TlsCertificates.Id = Certificate " +
                                                         "WHERE BackboneAccessPoints.Id = $1 AND Lifecycle = 'ready'", [work.ap_ref]);
                    if (ap_result.rowCount == 1) {
                        let ap = ap_result.rows[0];
                        let secret = await kube.LoadSecret(ap.objectname);
                        text += siteTemplates.SecretYaml(secret, `${work.profile}-server`, true);

                        incoming[work.profile] = 'true';
                    } else {
                        throw(Error(`Certificate for profile ${work.profile} not yet ready`));
                    }
                }
            }

            text += "---\n" + link_config_map_yaml('skupperx-incoming', incoming);

            res.send(text);
            res.status(returnStatus).end();
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
        const outgoing = await sync.GetBackboneConnectors_TX(client, bsid);
        res.send(link_config_map_yaml('skupperx-outgoing', outgoing));
        res.status(returnStatus).end();
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        resutnStatus = 400;
        res.send(err.message);
        res.status(returnStatus).end();
    } finally {
        client.release();
    }

    return returnStatus;
}

exports.AddHostToAccessPoint = async function(siteId, key, hostname, port) {
    let retval = 1;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        var ref;
        switch (key) {
            case 'ingress/manage' : ref = 'ManageAccess';  break;
            case 'ingress/member' : ref = 'MemberAccess';  break;
            case 'ingress/claim'  : ref = 'ClaimAccess';   break;
            case 'ingress/peer'   : ref = 'PeerAccess';    break;
            default: throw Error(`Invalid ingress key: ${key}`);
        }
        const result = await client.query(`SELECT ${ref} as access_ref, BackboneAccessPoints.* FROM InteriorSites JOIN BackboneAccessPoints ON ${ref} = BackboneAccessPoints.Id WHERE InteriorSites.Id = $1`, [siteId]);
        if (result.rowCount == 1) {
            let access = result.rows[0];
            if (access.hostname != hostname || access.port != port) {
                if (access.hostname) {
                    throw Error(`Referenced access (${access.access_ref}) already has a hostname`);
                }
                if (access.lifecycle != 'partial') {
                    throw Error(`Referenced access (${access.access_ref}) has lifecycle ${access.lifecycle}, expected partial`);
                }
                await client.query("UPDATE BackboneAccessPoints SET Hostname = $1, Port=$2, Lifecycle='new' WHERE Id = $3", [hostname, port, access.access_ref]);
            }
            await client.query("COMMIT");

            //
            // Alert the sync module that an access point has advanced from 'partial' state if this is a peer ingress
            //
            if (key == 'ingress/peer') {
                await sync.NewIngressAvailable(siteId);
            }
        } else {
            throw Error(`Access point not found for site ${siteId} (${ref})`);
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
        const [fields, files] = await form.parse(req);
        let count = 0;
        if (typeof fields.ingresses == 'object') {
            for (const [key, obj] of Object.entries(fields.ingresses)) {
                count += await exports.AddHostToAccessPoint(bsid, key, obj.host, obj.port);
            }
        }

        res.status(returnStatus).json({ processed: count });
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).send(err.message);
    }

    return returnStatus;
}

const apiLog = function(req, status) {
    Log(`OperAPI: ${req.ip} - (${status}) ${req.method} ${req.originalUrl}`);
}

exports.Start = async function() {
    Log('[API Server module started]');
    api = express();
    api.use(cors());

    api.get(API_PREFIX + 'invitation/:iid/kube', async (req, res) => {
        apiLog(req, await fetchInvitationKube(req.params.iid, res));
    });

    api.get(API_PREFIX + 'backbonesite/:bsid/kube', async (req, res) => {
        apiLog(req, await fetchBackboneSiteKube(req.params.bsid, res));
    });

    api.get(API_PREFIX + 'backbonesite/:bsid/links/incoming/kube', async (req, res) => {
        apiLog(req, await fetchBackboneLinksIncomingKube(req.params.bsid, res));
    });

    api.get(API_PREFIX + 'backbonesite/:bsid/links/outgoing/kube', async (req, res) => {
        apiLog(req, await fetchBackboneLinksOutgoingKube(req.params.bsid, res));
    });

    api.post(API_PREFIX + 'backbonesite/:bsid/ingress', async (req, res) => {
        apiLog(req, await postBackboneIngress(req.params.bsid, req, res));
    });

    adminApi.Initialize(api);
    userApi.Initialize(api);

    let server = api.listen(API_PORT, () => {
        let host = server.address().address;
        let port = server.address().port;
        if (host[0] == ':') {
            host = '[' + host + ']';
        }
        Log(`API Server listening on http://${host}:${port}`);
    });
}