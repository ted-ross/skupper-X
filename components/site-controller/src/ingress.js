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

const kube   = require('./common/kube.js');
const Log    = require('./common/log.js').Log;
const router = require('./common/router.js');

const SERVICE_NAME = 'skx-router';
const ROUTER_LABEL = 'skx-router';

var ingress_bundle = {
    ready:     false,
    siteId:    process.env.SKUPPERX_SITE_ID,
    ingresses: {},
};

const backbone_service = function() {
    return {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
            name: SERVICE_NAME,
        },
        spec: {
            type: 'ClusterIP',
            internalTrafficPolicy: 'Cluster',
            ports: [
                {
                    name:       'peer',
                    port:       55671,
                    protocol:   'TCP',
                    targetPort: 55671,
                },
                {
                    name:       'member',
                    port:       45671,
                    protocol:   'TCP',
                    targetPort: 45671,
                },
                {
                    name:       'claim',
                    port:       45669,
                    protocol:   'TCP',
                    targetPort: 45669,
                },
                {
                    name:       'manage',
                    port:       45670,
                    protocol:   'TCP',
                    targetPort: 45670,
                },
            ],
            selector: {
                application: ROUTER_LABEL,
            },
        }
    };
}

const backbone_route = function(name, socket) {
    return {
        apiVersion: 'route.openshift.io/v1',
        kind: 'Route',
        metadata: {
            name: name,
        },
        spec: {
            port: {
                targetPort: socket,
            },
            tls: {
                termination: 'passthrough',
                insecureEdgeTerminationPolicy: 'None',
            },
            to: {
                kind: 'Service',
                name: SERVICE_NAME,
                weight: 100,
            },
            wildcardPolicy: 'None',
        },
    };
}

const sync_kube_service = async function() {
    let services = await kube.GetServices();
    let found    = false;
    services.forEach(service => {
        if (service.metadata.name == SERVICE_NAME) {
            if (!service.metadata.annotations || service.metadata.annotations['skupper.io/skx-controlled'] != 'true') {
                throw Error(`Existing service ${SERVICE_NAME} found that is not controlled by skupper-X`);
            }
            found = true;
        }
    });

    if (!found) {
        let service = backbone_service();
        await kube.ApplyObject(service);
    }
}

const sync_route = async function(name, socket) {
    let routes = await kube.GetRoutes();
    let found  = false;
    routes.forEach(route => {
        if (route.metadata.name == name) {
            if (!route.metadata.annotations || route.metadata.annotations['skupper.io/skx-controlled'] != 'true') {
                throw Error(`Existing route ${name} found that is not controller by skupper-X`);
            }
            found = true;
        }
    });

    if (!found) {
        let route = backbone_route(name, socket);
        await kube.ApplyObject(route);
    }
}

const resolve_ingress = async function() {
    let routes = await kube.GetRoutes();

    for (const route of routes) {
        for (const name of ['skx-peer', 'skx-member', 'skx-claim', 'skx-manage']) {
            if (route.metadata.name == name && route.spec.host) {
                ingress_bundle.ingresses[name] = {
                    host: route.spec.host,
                    port: 443,
                };
            }
        }
    }

    if (Object.keys(ingress_bundle.ingresses).length == 4) {
        ingress_bundle.ready = true;
        Log('Hosts for the ingress are resolved');
    } else {
        setTimeout(resolve_ingress, 1000);
    }
}

const sync_ingress = async function() {
    await sync_kube_service();
    await sync_route('skx-peer',   'peer');
    await sync_route('skx-member', 'member');
    await sync_route('skx-claim',  'claim');
    await sync_route('skx-manage', 'manage');
    setTimeout(resolve_ingress, 1000);
}

exports.GetIngressBundle = function() {
    return ingress_bundle;
}

exports.Start = async function() {
    Log('[Ingress module started]');
    await sync_ingress();
}