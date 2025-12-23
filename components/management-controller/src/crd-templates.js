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

const common = require('./common/common.js');

exports.BackboneSite = function(name, siteId) {
    return {
        apiVersion : common.CRD_API_VERSION,
        kind       : 'Site',
        metadata : {
            name : name,
        },
        spec : {
            linkAccess : 'none',
            settings   : {
                'management-plane'   : 'skupperx',
                'skupperx-site-id'   : siteId,
                'skupperx-site-type' : 'backbone',
            }
        },
    };
}

exports.RouterAccess = function(accessPoint, tlsName) {
    var role = 'normal';
    switch (accessPoint.kind) {
        case 'peer' :
            role = 'inter-router';
            break;
        case 'member' :
            role = 'edge';
            break;
    }

    let obj = {
        apiVersion : common.CRD_API_VERSION,
        kind       : 'LinkAccess',
        metadata : {
            name : `access-${accessPoint.kind}-${accessPoint.id}`,
            [common.META_ANNOTATION_SKUPPERX_CONTROLLED] : true,
        },
        spec : {
            roles : [
                {
                    role : role,
                },
            ],
            tlsCredentials : tlsName,
            bindHost       : accessPoint.bindhost,
        },
    };

    return obj;
}

exports.BackboneRoleYaml = function() {
    return `---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: skupperx-site
  labels:
    application: skupperx
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list", "watch", "create", "update", "delete", "patch"]
- apiGroups: ["skupper.io"]
  resources: ["sites", "linkaccesses", "links"]
  verbs: ["get", "list", "watch", "create", "update", "delete", "patch"]
`;
}

exports.NetworkCRYaml = function(networkId) {
    return `---
apiVersion: skupper.io/v2alpha1
kind: Network
metadata:
  name: network
spec:
  networkId: ${networkId}
`;
}

exports.NetworkLinkCRYaml = function(host, port, secret) {
    return `---
apiVersion: skupper.io/v2alpha1
kind: NetworkLink
metadata:
  name: management-link
spec:
  hostname: ${host}
  port: ${port}
  tlsCredentials: ${secret}
`;
}
