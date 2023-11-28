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
const kube    = require('./common/kube.js');
const Log     = require('./common/log.js').Log;

const API_PREFIX = '/api/v1alpha1/';
const API_PORT   = 8085;
var api;

const listInvitations = async function(res) {
    const client = await db.ClientFromPool();
    const result = await client.query("SELECT Id FROM MemberInvitations");
    var list = [];
    result.rows.forEach(row => {
        list.push(row.id);
    });
    res.send(JSON.stringify(list));
    res.status(200).end();
}

const deployment_object = function(name, image) {
    return {
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
        },
        template: {
            metadata: {
                labels: {
                    app: name,
                },
            },
            spec: {
                containers: [
                    {
                        image: image,
                        imagePullPolicy: 'IfNotPresent',
                        name: name,
                    },
                ],
            },
        },
    };
}

const secret_object = function(name, source_secret) {
    return {
        apiVersion: 'v1',
        kind: 'Secret',
        type: 'kubernetes.io/tls',
        metadata: {
            name: name,
            annotations: {
                'skupper.io/skx-controlled': 'true',
                'skupper.io/skx-van-id': source_secret.metadata.annotations['skupper.io/skx-van-id'],
                // TODO - Add access URLs here
            }
        },
        data: source_secret.data,
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

        invitation += "---\n" + yaml.dump(deployment_object('skupper-router', secret.metadata.annotations['skupper.io/skx-dataplane-image']));
        invitation += "---\n" + yaml.dump(deployment_object('skupperx-sitecontroller', secret.metadata.annotations['skupper.io/skx-controller-image']));
        invitation += "---\n" + yaml.dump(secret_object('skupperx-claim', secret));

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