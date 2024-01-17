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
const sync   = require('./site-sync.js');
const crypto = require('crypto');

const SERVICE_NAME = 'skx-router';
const ROUTER_LABEL = 'skx-router';

const INCOMING_CONFIG_MAP_NAME = 'skupperx-incoming';
const OUTGOING_CONFIG_MAP_NAME = 'skupperx-outgoing';

const MANAGE_PORT = 45670;
const PEER_PORT   = 55671;
const CLAIM_PORT  = 45669;
const MEMBER_PORT = 45671;

var ingressState = {
    manage : {hash: null, data: {}},
    peer   : {hash: null, data: {}},
    claim  : {hash: null, data: {}},
    member : {hash: null, data: {}},
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
                    port:       PEER_PORT,
                    protocol:   'TCP',
                    targetPort: PEER_PORT,
                },
                {
                    name:       'member',
                    port:       MEMBER_PORT,
                    protocol:   'TCP',
                    targetPort: MEMBER_PORT,
                },
                {
                    name:       'claim',
                    port:       CLAIM_PORT,
                    protocol:   'TCP',
                    targetPort: CLAIM_PORT,
                },
                {
                    name:       'manage',
                    port:       MANAGE_PORT,
                    protocol:   'TCP',
                    targetPort: MANAGE_PORT,
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
    let desired  = true;
    services.forEach(service => {
        if (service.metadata.name == SERVICE_NAME) {
            if (!service.metadata.annotations || service.metadata.annotations['skupper.io/skx-controlled'] != 'true') {
                throw Error(`Existing service ${SERVICE_NAME} found that is not controlled by skupper-X`);
            }
            found = true;
        }
    });

    try {
        const unused = await kube.LoadConfigmap(INCOMING_CONFIG_MAP_NAME);
    } catch (error) {
        desired = false;
    }

    if (desired && !found) {
        let service = backbone_service();
        await kube.ApplyObject(service);
    }

    if (!desired && found) {
        await kube.DeleteService(SERVICE_NAME);
    }
}

const sync_route = async function(name, socket) {
    let routes  = await kube.GetRoutes();
    let found   = false;
    let desired = true;
    routes.forEach(route => {
        if (route.metadata.name == name) {
            if (!route.metadata.annotations || route.metadata.annotations['skupper.io/skx-controlled'] != 'true') {
                throw Error(`Existing route ${name} found that is not controller by skupper-X`);
            }
            found = true;
        }
    });

    try {
        const incoming = await kube.LoadConfigmap(INCOMING_CONFIG_MAP_NAME);
        if (!incoming.data[socket]) {
            desired = false;
        }
    } catch (error) {
        desired = false;
    }

    if (desired && !found) {
        let route = backbone_route(name, socket);
        await kube.ApplyObject(route);
    }

    if (!desired && found) {
        await kube.DeleteRoute(name);
    }
}

const sync_ingress = async function() {
    await sync_kube_service();
    await sync_route('skx-peer',   'peer');
    await sync_route('skx-member', 'member');
    await sync_route('skx-claim',  'claim');
    await sync_route('skx-manage', 'manage');
}

const ingressHash = function(data) {
    if (data == {}) {
        return null;
    }

    let text = data.host + data.port.toString();
    return crypto.createHash('sha1').update(text).digest('hex');
}

exports.GetInitialConfig = async function() {
    const routeList = await kube.GetRoutes();
    for (const route of routeList) {
        for (const [key, unused] of Object.entries(ingressState)) {
            if (route.metadata.name == 'skx-' + key && route.spec.host) {
                ingressState[key].data = {host: route.spec.host, port: 443};
                ingressState[key].hash = ingressHash(ingressState[key].data);
            }
        }
    }

    return ingressState;
}

const onConfigMapWatch = function(type, apiObj) {
    if (apiObj.metadata.name == INCOMING_CONFIG_MAP_NAME) {
        sync_ingress();
    }
}

const onRouteWatch = async function(type, apiObj) {
    let routes = await kube.GetRoutes();

    for (const route of routes) {
        for (const key of ['peer', 'member', 'claim', 'manage']) {
            if (route.metadata.name == 'skx-' + key && route.spec.host) {
                const data = {host: route.spec.host, port: 443};
                const hash = ingressHash(data);

                if (hash != ingressState[key].hash) {
                    ingressState[key].hash = hash;
                    ingressState[key].data = data;
                    sync.UpdateIngress(key, hash, data);
                }
            }
        }
    }

    if (Object.keys(ingressState.ingresses).length == 4) {
        ingressState.ready = true;
        Log('Hosts for the ingress are resolved');
    } else {
        setTimeout(resolve_ingress, 1000);
    }
}

exports.Start = async function() {
    Log('[Ingress module started]');
    kube.WatchConfigMaps(onConfigMapWatch);
    kube.WatchRoutes(onRouteWatch);
    await sync_ingress();
}