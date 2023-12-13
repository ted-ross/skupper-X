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
const formidable = require('formidable');
const yaml       = require('js-yaml');
const crypto     = require('crypto');
const db         = require('./db.js');
const backbone   = require('./backbone.js');
const kube       = require('./common/kube.js');
const { isObject } = require('util');
const Log        = require('./common/log.js').Log;

const API_PREFIX = '/api/v1alpha1/';
const API_PORT   = 8085;
var api;

const listInvitations = async function(res) {
    const client = await db.ClientFromPool();
    const result = await client.query("SELECT Id, Name, Lifecycle, Failure FROM MemberInvitations");
    var list = [];
    result.rows.forEach(row => {
        list.push(row);
    });
    res.send(JSON.stringify(list));
    res.status(200).end();
    client.release();
}

const listBackbones = async function(res) {
    const client = await db.ClientFromPool();
    const result = await client.query("SELECT Id, Name, Lifecycle, Failure FROM Backbones");
    var list = [];
    result.rows.forEach(row => {
        list.push(row);
    });
    res.send(JSON.stringify(list));
    res.status(200).end();
    client.release();
}

const listBackboneSites = async function(bid, res) {
    const client = await db.ClientFromPool();
    const result = await client.query("SELECT Id, Name, Lifecycle, Failure FROM InteriorSites WHERE Backbone = $1", [bid]);
    var list = [];
    result.rows.forEach(row => {
        list.push(row);
    });
    res.send(JSON.stringify(list));
    res.status(200).end();
    client.release();
}

const deployment_object = function(name, image, env = undefined) {
    let dep = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
            name: name,
        },
        spec: {
            replicas: 1,
            selector: {
                matchLabels: {
                    app: name,
                },
            },
            template: {
                metadata: {
                    labels: {
                        app: name,
                    },
                },
                spec: {
                    serviceAccountName: 'skupper-site-controller',
                    containers: [
                        {
                            image: image,
                            imagePullPolicy: 'IfNotPresent',
                            name: name,
                        },
                    ],
                },
            },
        },
    };

    if (env) {
        dep.spec.template.spec.containers[0].env = env;
    }

    return dep;
}

const secret_object_claim = function(name, source_secret, invitation) {
    return {
        apiVersion: 'v1',
        kind: 'Secret',
        type: 'kubernetes.io/tls',
        metadata: {
            name: name,
            annotations: {
                'skupper.io/skx-controlled':       'true',
                'skupper.io/skx-van-id':           source_secret.metadata.annotations['skupper.io/skx-van-id'],
                'skupper.io/skx-dataplane-image':  source_secret.metadata.annotations['skupper.io/skx-dataplane-image'],
                'skupper.io/skx-configsync-image': source_secret.metadata.annotations['skupper.io/skx-configsync-image'],
                'skupper.io/skx-interactive':      invitation.interactiveclaim ? 'true' : 'false',
                // TODO - Add access URLs here
            }
        },
        data: source_secret.data,
    };
}

const service_account = function(name, application) {
    return {
        apiVersion: 'v1',
        kind: 'ServiceAccount',
        metadata: {
            name: name,
            labels: {
                application: application,
            },
        },
    };
}

const role = function(name, application) {
    return {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'Role',
        metadata: {
            name: name,
            labels: {
                application: application,
            },
        },
        rules: [
            {
                apiGroups: [""],
                resources: ['configmaps', 'pods', 'pods/exec', 'services', 'secrets', 'serviceaccounts', 'events'],
                verbs: ['get', 'list', 'watch', 'create', 'update', 'delete', 'patch'],
            },
            {
                apiGroups: ['apps'],
                resources: ['deployments', 'statefulsets', 'daemonsets'],
                verbs: ['get', 'list', 'watch', 'create', 'update', 'delete'],
            },
            {
                apiGroups: ['route.openshift.io'],
                resources: ['routes'],
                verbs: ['get', 'list', 'watch', 'create', 'update', 'delete'],
            },
            {
                apiGroups: ['networking.k8s.io'],
                resources: ['ingresses', 'networkpolicies'],
                verbs: ['get', 'list', 'watch', 'create', 'delete'],
            },
            {
                apiGroups: ['projectcontour.io'],
                resources: ['httpproxies'],
                verbs: ['get', 'list', 'watch', 'create', 'delete'],
            },
            {
                apiGroups: ['rbac.authorization.k8s.io'],
                resources: ['rolebindings', 'roles'],
                verbs: ['get', 'list', 'watch', 'create', 'delete'],
            },
            {
                apiGroups: ['apps.openshift.io'],
                resources: ['deploymentconfigs'],
                verbs: ['get', 'list', 'watch'],
            },
        ],
    };
}

const role_binding = function(name, application) {
    return {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'RoleBinding',
        metadata: {
            name: name,
            labels: {
                application: application,
            },
        },
        subjects: [
            {
                kind: 'ServiceAccount',
                name: name,
            }
        ],
        roleRef: {
            apiGroup: 'rbac.authorization.k8s.io',
            kind: 'Role',
            name: name,
        },
    };
}

const site_config_map_edge = function(site_name, van_id) {
    return {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
            name: 'skupper-site',
        },
        data: {
            name: site_name,
            'router-mode': 'edge',
            'service-controller': 'true',
            'service-sync': 'false',
            'van-id': van_id,
        },
    };
}

const site_config_map_interior = function(site_name) {
    return {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
            name: 'skupper-site',
        },
        data: {
            name: site_name,
            'router-mode': 'interior',
            'service-controller': 'false',
            'service-sync': 'false',
        },
    };
}

const fetchInvitationKube = async function (iid, res) {
    const client = await db.ClientFromPool();
    const result = await client.query("SELECT MemberInvitations.*, TlsCertificates.ObjectName as secret_name FROM MemberInvitations " +
                                      "JOIN TlsCertificates ON MemberInvitations.Certificate = TlsCertificates.Id WHERE MemberInvitations.Id = $1", [iid]);
    if (result.rowCount == 1) {
        const row = result.rows[0];
        const secret = await kube.LoadSecret(row.secret_name);
        var   invitation = '';

        invitation += "---\n" + yaml.dump(service_account('skupper-site-controller', 'skupper-site-controller'));
        invitation += "---\n" + yaml.dump(role('skupper-site-controller', 'skupper-site-controller'));
        invitation += "---\n" + yaml.dump(role_binding('skupper-site-controller', 'skupper-site-controller'));
        invitation += "---\n" + yaml.dump(deployment_object('skupper-site-controller', secret.metadata.annotations['skupper.io/skx-controller-image'], [
            {name: 'WATCH_NAMESPACE', valueFrom: {fieldRef: {fieldPath: 'metadata.namespace'}}},
            {name: 'QDROUTERD_IMAGE', value: secret.metadata.annotations['skupper.io/skx-dataplane-image']},
            {name: 'SKUPPER_CONFIG_SYNC_IMAGE', value: secret.metadata.annotations['skupper.io/skx-configsync-image']},
        ]));
        invitation += "---\n" + yaml.dump(secret_object_claim('skupperx-claim', secret, row));
        invitation += "---\n" + yaml.dump(site_config_map_edge(crypto.randomUUID(), secret.metadata.annotations['skupper.io/skx-van-id']));

        res.send(invitation);
        res.status(200).end();
    } else {
        res.status(404).end();
    }

    client.release();
}

const fetchBackboneSiteKube = async function (bsid, res) {
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            'SELECT InteriorSites.Certificate, TlsCertificates.ObjectName as secret_name FROM InteriorSites ' +
            'JOIN TlsCertificates ON InteriorSites.Certificate = TlsCertificates.Id WHERE Interiorsites.Id = $1', [bsid]);
        if (result.rowCount == 1) {
            let secret = await kube.LoadSecret(result.rows[0].secret_name);
            let text = '';
            text += backbone.ServiceAccountYaml();
            text += backbone.RoleYaml();
            text += backbone.RoleBindingYaml();
            text += backbone.ConfigMapYaml();
            text += backbone.DeploymentYaml(bsid);
            text += backbone.SecretYaml(secret);

            res.send(text);
            res.status(200).end();
        } else {
            throw Error('Site secret not found');
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        res.send(err.stack);
        res.status(404).end();
    } finally {
        client.release();
    }
}

const fetchBackboneLinksKube = async function (bsid, res) {
    res.status(404).end();
}

const addHostToAccessPoint = async function(bsid, key, hostname, port) {
    let retval = 1;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        var ref;
        switch (key) {
            case 'skx-manage' : ref = 'ManagementAccess';  break;
            case 'skx-member' : ref = 'MemberAccess';      break;
            case 'skx-peer'   : ref = 'PeerAccess';        break;
            default: throw Error(`Invalid ingress key: ${key}`);
        }
        const result = await client.query(`SELECT ${ref} as access_ref, BackboneAccessPoints.* FROM InteriorSites JOIN BackboneAccessPoints ON ${ref} = BackboneAccessPoints.Id WHERE InteriorSites.Id = $1`, [bsid]);
        if (result.rowCount == 1) {
            let access = result.rows[0];
            if (access.hostname) {
                throw Error(`Referenced access (${access.access_ref}) already has a hostname`);
            }
            if (access.lifecycle != 'partial') {
                throw Error(`Referenced access (${access.access_ref}) has lifecycle ${access.lifecycle}, expected partial`);
            }
            await client.query("UPDATE BackboneAccessPoints SET Hostname = $1, Port=$2, Lifecycle='new' WHERE Id = $3", [hostname, port, access.access_ref]);
            await client.query("COMMIT");
        } else {
            throw Error(`Access point not found for site ${bsid} (${ref})`);
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
    const form = new formidable.IncomingForm();
    form.parse(req, async function(err, fields, files) {
        if (err != null) {
            Log(err)
            res.status(400).json({ message: err.message });
        }

        let count = 0;
        if (typeof fields.ingresses == 'object') {
            for (const [key, obj] of Object.entries(fields.ingresses)) {
                count += await addHostToAccessPoint(bsid, key, obj.host, obj.port);
            }
        }

        res.json({ processed: count });
    });
}

exports.Start = async function() {
    Log('[API Server module started]');
    api = express();

    api.get(API_PREFIX + 'invitations', (req, res) => {
        listInvitations(res);
    });

    api.get(API_PREFIX + 'backbones', (req, res) => {
        listBackbones(res);
    });

    api.get(API_PREFIX + 'backbone/:bid/sites', (req, res) => {
        listBackboneSites(req.params.bid, res);
    });

    api.get(API_PREFIX + 'invitation/kube/:iid', (req, res) => {
        Log(`Request for invitation (Kubernetes): ${req.params.iid}`);
        fetchInvitationKube(req.params.iid, res);
    });

    api.get(API_PREFIX + 'backbonesite/kube/:bsid', (req, res) => {
        Log(`Request for backbone site (Kubernetes): ${req.params.bsid}`);
        fetchBackboneSiteKube(req.params.bsid, res);
    });

    api.get(API_PREFIX + 'backbonelinks/kube/:bsid', (req, res) => {
        Log(`Request for backbone links (Kubernetes): ${req.params.bsid}`);
        fetchBackboneLinksKube(req.params.bsid, res);
    });

    api.post(API_PREFIX + 'backboneingress/:bsid', (req, res) => {
        Log(`POST - backbone site ingress data for site ${req.params.bsid}`);
        postBackboneIngress(req.params.bsid, req, res);
    });

    let server = api.listen(API_PORT, () => {
        let host = server.address().address;
        let port = server.address().port;
        if (host[0] == ':') {
            host = '[' + host + ']';
        }
        Log(`API Server listening on http://${host}:${port}`);
    });
}