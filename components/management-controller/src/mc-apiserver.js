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

const express = require('express');
const yaml    = require('js-yaml');
const crypto  = require('crypto');
const db      = require('./db.js');
const kube    = require('./common/kube.js');
const Log     = require('./common/log.js').Log;

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

const secret_object = function(name, source_secret, invitation) {
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

const site_config_map = function(site_name, van_id) {
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
        invitation += "---\n" + yaml.dump(secret_object('skupperx-claim', secret, row));
        invitation += "---\n" + yaml.dump(site_config_map(crypto.randomUUID(), secret.metadata.annotations['skupper.io/skx-van-id']));

        res.send(invitation);
        res.status(200).end();
    } else {
        res.status(404).end();
    }

    client.release();
}

exports.Start = async function() {
    Log('[API Server module started]');
    api = express();

    api.get(API_PREFIX + 'invitations', (req, res) => {
        listInvitations(res);
    });

    api.get(API_PREFIX + 'invitation/kube/:iid', (req, res) => {
        Log(`Request for invitation (Kubernetes): ${req.params.iid}`);
        fetchInvitationKube(req.params.iid, res);
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