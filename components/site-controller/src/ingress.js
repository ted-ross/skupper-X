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
const sync        = require('./sync-backbone-kube.js');
const router_port = require('./router-port.js');
const util        = require('./common/util.js');
const crypto      = require('crypto');

var reconcile_config_map_scheduled = false;
var reconcile_routes_scheduled     = false;
var accessPoints = {}; // APID => {kind, routerPort, syncHash, syncData, toDelete}

exports.GetTargetPort = function(apid) {
    const ap = accessPoints[apid];
    if (ap) {
        return ap.routerPort;
    }
    return undefined;
}

const new_access_point = function(apid, kind) {
    const port = router_port.AllocatePort();
    let value = {
        kind       : kind,
        routerPort : port,
        syncHash   : null,
        syncData   : {},
        toDelete   : false,
    };

    accessPoints[apid] = value;
}

const free_access_point = function(apid) {
    const ap = accessPoints[apid];
    if (ap) {
        router_port.FreePort(ap.routerPort);
        delete accessPoints[apid];
    }
}

const backbone_service = function() {
    let service_object = {
        apiVersion : 'v1',
        kind       : 'Service',
        metadata   : {
            name        : common.ROUTER_SERVICE_NAME,
            annotations : {
                [common.META_ANNOTATION_SKUPPERX_CONTROLLED] : 'true',
            },
        },
        spec : {
            type                  : 'ClusterIP',
            internalTrafficPolicy : 'Cluster',
            ports                 : [],
            selector : {
                application : common.APPLICATION_ROUTER_LABEL,
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

const backbone_route = function(apid) {
    const access = accessPoints[apid];
    const name   = `skx-${access.kind}-${apid}`;
    return {
        apiVersion : 'route.openshift.io/v1',
        kind       : 'Route',
        metadata : {
            name : name,
            annotations : {
                [common.META_ANNOTATION_SKUPPERX_CONTROLLED] : 'true',
                [common.META_ANNOTATION_STATE_ID]            : apid,
            },
        },
        spec: {
            port : {
                targetPort : `${access.kind}-${apid}`,
            },
            tls : {
                termination                   : 'passthrough',
                insecureEdgeTerminationPolicy : 'None',
            },
            to : {
                kind   : 'Service',
                name   : common.ROUTER_SERVICE_NAME,
                weight : 100,
            },
            wildcardPolicy : 'None',
        },
    };
}

const reconcile_kube_service = async function() {
    let services = await kube.GetServices();
    let found    = false;
    let desired  = Object.keys(accessPoints).length > 0;

    services.forEach(service => {
        if (service.metadata.name == common.ROUTER_SERVICE_NAME) {
            if (!kube.Controlled(service)) {
                throw Error(`Existing service ${service.metadata.name} found that is not controlled by skupper-X`);
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
        const desired_service = backbone_service();
        const existing_service = await kube.LoadService(common.ROUTER_SERVICE_NAME);
        if (!util.mapEqual_sync(desired_service, existing_service)) {
            await kube.ReplaceService(common.ROUTER_SERVICE_NAME, desired_service);
        }
    }
}

const reconcile_routes = async function() {
    reconcile_routes_scheduled = false;
    const all_routes = await kube.GetRoutes();
    let routes = {};

    for (const candidate of all_routes) {
        const apid = kube.Annotation(candidate, common.META_ANNOTATION_STATE_ID);
        if (kube.Controlled(candidate) && Object.keys(accessPoints).indexOf(apid) >= 0) {
            routes[apid] = candidate;
        }
    }

    for (const [apid, ap] of Object.entries(accessPoints)) {
        if (Object.keys(routes).indexOf(apid) >= 0) {
            const route = routes[apid];
            let hash = null;
            let data = {};
            if (route.spec.host) {
                data = {
                    host : route.spec.host,
                    port : 443,
                };
                hash = ingressHash(data);
                if (hash != ap.syncHash) {
                    ap.syncHash = hash;
                    ap.syncData = data;
                    // TODO - Inform the state-sync module of the local change.
                }
            }
            delete routes[apid];
        } else {
            await kube.ApplyObject(backbone_route(apid));
        }
    }

    //
    // Any remaining routes in the list were not found in the accessPoints.  Delete them.
    //
    for (const route of Object.values(routes)) {
        await kube.DeleteRoute(route.metadata.name);
    }
}

const ingressHash = function(data) {
    if (data == {}) {
        return null;
    }

    let text = data.host + data.port.toString();
    return crypto.createHash('sha1').update(text).digest('hex');
}

//
// Refactor: TODO
//
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

//
// Refactor: TODO
//
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

const reconcile_config_maps = async function() {
    reconcile_config_map_scheduled = false;
    const all_config_maps = await kube.GetConfigmaps();
    let ingress_config_maps = {};
    let need_service_sync   = false;

    //
    // Build a map of all configured access points from the config maps.
    //
    for (const cm of all_config_maps) {
        if (kube.Controlled(cm) && kube.Annotation(cm, common.META_ANNOTATION_STATE_TYPE) == common.STATE_TYPE_ACCESS_POINT) {
            const apid = kube.Annotation(cm, common.META_ANNOTATION_STATE_ID);
            if (apid) {
                ingress_config_maps[apid] = cm;
            }
        }
    }

    //
    // Mark all local access points as candidates for deletion.
    //
    for (const apid of Object.keys(accessPoints)) {
        accessPoints[apid].toDelete = true;
    }

    //
    // Un-condemn still-existing ingresses and create new ones.
    //
    for (const [apid, cm] of Object.entries(ingress_config_maps)) {
        if (apid in Object.keys(accessPoints)) {
            accessPoints[apid].toDelete = false;
        } else {
            const kind = cm.data.kind;
            new_access_point(apid, kind);
            need_service_sync = true;
        }
    }

    //
    // Delete access points that are no longer mentioned in the config maps.
    //
    for (const [apid, ap] of Object.entries(accessPoints)) {
        if (ap.toDelete) {
            free_access_point(apid);
            need_service_sync = true;
        }
    }

    //
    // If the list of ingresses has been altered in any way, re-sync the ingress service.
    //
    if (need_service_sync) {
        await reconcile_kube_service();
        await reconcile_routes();
    }
}

const onConfigMapWatch = function(type, apiObj) {
    try {
        const controlled = kube.Controlled(apiObj);
        const state_type = kube.Annotation(apiObj, common.META_ANNOTATION_STATE_TYPE);
        if (controlled && state_type == common.STATE_TYPE_ACCESS_POINT) {
            if (!reconcile_config_map_scheduled) {
                setTimeout(reconcile_config_maps, 200);
                reconcile_config_map_scheduled = true;
            }
        }
    } catch (e) {
        Log('Exception caught in ingress.onConfigMapWatch');
        Log(e.stack);
    }
}

const onRouteWatch = async function(type, route) {
    const apid = kube.Annotation(route, common.META_ANNOTATION_STATE_ID);
    if (apid && Object.keys(accessPoints).indexOf(apid) >= 0 && !reconcile_routes_scheduled) {
        reconcile_routes_scheduled = true;
        setTimeout(reconcile_routes, 200);
    }
}

const onServiceWatch = async function(type, apiObj) {
    if (apiObj.metadata.name == common.ROUTER_SERVICE_NAME) {
        await reconcile_kube_service();
    }
}

exports.Start = async function(siteId) {
    Log('[Ingress module started]');
    kube.WatchConfigMaps(onConfigMapWatch);
    kube.WatchRoutes(onRouteWatch);
    kube.WatchServices(onServiceWatch);
}