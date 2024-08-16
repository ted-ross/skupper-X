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

//
// This module is responsible for setting up the requested ingresses into a site.
//
// The input to this module is a set of ConfigMaps that represent configured access points:
//   metadata.annotations:
//     skx/state-type: accesspoint
//     skx/state-id:   <The database ID of the source BackboneAccessPoint>
//   data:
//     kind: [claim|peer|member|manage]
//     bindhost: The host to bind the listening socket to, optional.
//
// The output of this module:
//   Kubernetes Service: skx-router, with a port for each access point
//   Kubernetes Ingresses: OC Route, Load-balancer, nginx ingress, etc.
//   Host/Port status of created ingresses
//
// Currently the only ingress supported is OpenShift Routes.
//   TODO: Add "loadbalancer" ingress
//   TODO: Add "nodeport" ingress
//   TODO: Add "nginx-ingress-v1" ingress
//   TODO: Add "contour-http-proxy" ingress
//

const kube        = require('./common/kube.js');
const Log         = require('./common/log.js').Log;
const common      = require('./common/common.js');
const sync        = require('./site-sync.js');
const router_port = require('./router-port.js');
const crypto      = require('crypto');

var ingressState = { // TODO - remove or refactor
    manage : {hash: null, data: {}, toDelete: false},
    peer   : {hash: null, data: {}, toDelete: false},
    claim  : {hash: null, data: {}, toDelete: false},
    member : {hash: null, data: {}, toDelete: false},
};

var accessPoints = {}; // APID => {kind, bindHost, routerPort, toDelete}

exports.GetTargetPort = function(apid) {
    const ap = accessPoints[apid];
    if (ap) {
        return ap.routerPort;
    }
    return undefined;
}

const new_access_point = function(apid, kind, bindHost=undefined) {
    const port = router_port.AllocatePort();
    let value = {
        kind       : kind,
        routerPort : port,
        toDelete   : false,
    };

    if (bindHost) {
        value.bindHost = bindHost;
    }

    accessPoints[apid] = value;
}

const free_access_point = function(apid) {
    const ap = accessPoints[apid];
    if (ap) {
        router_port.FreePort(ap.routerPort);
        accessPoints.delete(apid)
    }
}

const backbone_service = function() {
    let service_object = {
        apiVersion : 'v1',
        kind       : 'Service',
        metadata   : {
            name : common.ROUTER_SERVICE_NAME,
        },
        spec : {
            type                  : 'ClusterIP',
            internalTrafficPolicy : 'Cluster',
            ports                 : [],
            selector : {
                application: common.APPLICATION_ROUTER_LABEL,
            },
        },
    };

    for (const [apid, access] of Object.entries(accessPoints)) {
        service_object.spec.ports.push({
            name       : `${access.kind}-${apid}`,
            port       : access.routerPort,
            protocol   : 'TCP',
            targetPort : access.routerPort,
        });
    };

    return service_object;
}

const backbone_route = function(name, apid) {
    const access = accessPoints[apid];
    return {
        apiVersion : 'route.openshift.io/v1',
        kind       : 'Route',
        metadata : {
            name: name,
        },
        spec: {
            port: {
                targetPort: `${access.kind}-${apid}`,
            },
            tls: {
                termination: 'passthrough',
                insecureEdgeTerminationPolicy: 'None',
            },
            to: {
                kind: 'Service',
                name: common.ROUTER_SERVICE_NAME,
                weight: 100,
            },
            wildcardPolicy: 'None',
        },
    };
}

const sync_kube_service = async function() {
    let services = await kube.GetServices();
    let found    = false;
    let desired  = Object.keys(accessPoints).length > 0;

    services.forEach(service => {
        if (service.metadata.name == common.ROUTER_SERVICE_NAME) {
            if (!service.metadata.annotations || service.metadata.annotations[common.META_ANNOTATION_SKUPPERX_CONTROLLED] != 'true') {
                throw Error(`Existing service ${common.ROUTER_SERVICE_NAME} found that is not controlled by skupper-X`);
            }
            found = true;
        }
    });

    if (desired && !found) {
        //
        // Create the service object
        //
        const service = backbone_service();
        await kube.ApplyObject(service);
    }

    if (!desired && found) {
        await kube.DeleteService(common.ROUTER_SERVICE_NAME);
    }

    if (desired && found) {
        const service = backbone_service();
        await kube.ReplaceService(common.ROUTER_SERVICE_NAME, service);
    }
}

const sync_route = async function(name, kind) {
    let routes  = await kube.GetRoutes();
    let found   = false;
    let desired = false;
    routes.forEach(route => {
        if (route.metadata.name == name) {
            if (kube.Annotation(route, common.META_ANNOTATION_SKUPPERX_CONTROLLED) != 'true') {
                throw Error(`Existing route ${name} found that is not controller by skupper-X`);
            }
            found = true;
        }
    });

    try {
        const incoming = await kube.LoadConfigmap(INCOMING_CONFIG_MAP_NAME);
        for (const [key, value_json] of Object.entries(incoming.data)) {
            const value = JSON.parse(value_json);
            if (value.kind == kind) {
                desired = true;
            }
        }
    } catch (error) {
        desired = false;
    }

    if (desired && !found) {
        let route = backbone_route(name, kind);
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
    try {
        const routeList = await kube.GetRoutes();
        for (const route of routeList) {
            for (const [key, unused] of Object.entries(ingressState)) {
                if (route.metadata.name == 'skx-' + key && route.spec.host) {
                    ingressState[key].data = {host: route.spec.host, port: 443};
                    ingressState[key].hash = ingressHash(ingressState[key].data);
                }
            }
        }
    } catch (error) {}

    return ingressState;
}

exports.GetIngressBundle = function() {
    let bundle = {};

    for (const key of ['manage', 'peer']) {
        const value = ingressState[key];
        if (value.hash) {
            bundle[`${key}_host`] = value.data.host;
            bundle[`${key}_port`] = value.data.port;
        }
    }

    return bundle;
}

const updateConfigMap = function(cm) {
    const apid   = cm.metadata.annotations[common.META_ANNOTATION_STATE_ID];
    const access = accessPoints[apid];
    if (!access) {
        new_access_point(apid, cm.data.kind, cm.data.bindhost);
        return true;
    }
    return false;
}

const deleteConfigMap = function(cm) {

}

const onConfigMapWatch = function(type, apiObj) {
    try {
        var changed = true;
        const state_type = kube.Annotation(apiObj, common.META_ANNOTATION_STATE_TYPE);

        if (state_type == common.STATE_TYPE_ACCESS_POINT) {

        } else if (state_type == common.STATE_TYPE_LINK) {

        }

        if (apiObj.metadata.annotations && apiObj.metadata.annotations[common.META_ANNOTATION_STATE_TYPE] == common.STATE_TYPE_ACCESS_POINT) {
            if (type == 'ADDED') {
                changed = updateConfigMap(apiObj);
            } else if (type == 'DELETED') {
                deleteConfigMap(apiObj);
            }
            if (changed) {
                sync_ingress();
            }
        }
    } catch (e) {
        Log(e.stack);
    }
}

const onRouteWatch = async function(type, apiObj) {
    let routes = await kube.GetRoutes();

    for (const [key, value] of Object.entries(ingressState)) {
        if (value.hash != null) {
            ingressState[key].toDelete = true;
        }
    }

    for (const route of routes) {
        for (const key of ['peer', 'member', 'claim', 'manage']) {
            if (route.metadata.name == 'skx-' + key && route.spec.host) {
                const data = {host: route.spec.host, port: 443};
                const hash = ingressHash(data);
                ingressState[key].toDelete = false;

                if (hash != ingressState[key].hash) {
                    ingressState[key].hash = hash;
                    ingressState[key].data = data;
                    sync.UpdateIngress(key, hash, data);
                }
            }
        }
    }

    for (const [key, value] of Object.entries(ingressState)) {
        if (value.toDelete) {
            ingressState[key].hash = null;
            ingressState[key].data = {};
            ingressState[key].toDelete = false;
            sync.UpdateIngress(key, null, {});
        }
    }
}

const onServiceWatch = async function(type, apiObj) {
    if (apiObj.metadata.name == common.ROUTER_SERVICE_NAME) {
        await sync_kube_service();
    }
}

exports.Start = async function(siteId) {
    Log('[Ingress module started]');
    kube.WatchConfigMaps(onConfigMapWatch);
    kube.WatchRoutes(onRouteWatch);
    kube.WatchServices(onServiceWatch);
}