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
// This module is responsible for setting up the requested ingresses into a Skupper v2 site.
//
// The input to this module is a set of ConfigMaps that represent configured access points:
//   metadata.annotations:
//     skx/state-type: accesspoint
//     skx/state-id:   <The database ID of the source BackboneAccessPoint>
//   data:
//     kind: [claim|peer|member|manage]
//
// The output of this module:
//   Skupper v2 RouterAccess resources
//   Ingress bundles for the API
//

const kube        = require('./common/kube.js');
const Log         = require('./common/log.js').Log;
const common      = require('./common/common.js');
const sync        = require('./sync-site-kube.js');
const crypto      = require('crypto');
const { setTimeout } = require('timers/promises');

var reconcile_config_map_scheduled      = false;
var reconcile_router_accesses_scheduled = false;
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

    if (accessPoints[apid]) {
        throw Error(`accessPoint already exists for ${apid}`);
    }
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

const do_reconcile_router_accesses = async function() {
    reconcile_router_accesses_scheduled = false;
    const all_routes = await kube.GetRoutes();
    let routes = {};

    for (const candidate of all_routes) {
        const apid = kube.Annotation(candidate, common.META_ANNOTATION_STATE_ID);
        if (kube.Controlled(candidate)) {
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
                    port : '443',
                };
                hash = ingressHash(data);
                if (hash != ap.syncHash) {
                    accessPoints[apid].syncHash = hash;
                    accessPoints[apid].syncData = data;
                    await sync.UpdateLocalState(`accessstatus-${apid}`, hash, data);
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

const reconcile_router_accesses = async function() {
    if (!reconcile_router_accesses_scheduled) {
        reconcile_router_accesses_scheduled = true;
        await setTimeout(200);
        await do_reconcile_router_accesses();
    }
}

const ingressHash = function(data) {
    if (data == {}) {
        return null;
    }

    let text = 'host' + data.host + 'port' + data.port;
    return crypto.createHash('sha1').update(text).digest('hex');
}

exports.GetIngressBundle = function() {
    let bundle = {};

    for (const [apid, ap] of Object.entries(accessPoints)) {
        if (ap.syncHash) {
            bundle[apid] = {
                host : ap.syncData.host,
                port : ap.syncData.port,
            };
        }
    }

    return bundle;
}

exports.GetInitialState = async function() {
    await do_reconcile_config_maps();
    await do_reconcile_router_accesses();
    return exports.GetIngressBundle();
}

const do_reconcile_config_maps = async function() {
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
        if (Object.keys(accessPoints).indexOf(apid) >= 0) {
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
        await reconcile_router_accesses();
    }
}

const reconcile_config_maps = async function() {
    if (!reconcile_config_map_scheduled) {
        reconcile_config_map_scheduled = true;
        await setTimeout(200);
        await do_reconcile_config_maps();
    }
}

const onConfigMapWatch = function(type, apiObj) {
    try {
        const controlled = kube.Controlled(apiObj);
        const state_type = kube.Annotation(apiObj, common.META_ANNOTATION_STATE_TYPE);
        if (controlled && state_type == common.STATE_TYPE_ACCESS_POINT) {
            reconcile_config_maps();
        }
    } catch (e) {
        Log('Exception caught in ingress.onConfigMapWatch');
        Log(e.stack);
    }
}

const onRouterAccessWatch = async function(type, route) {
    if (kube.Controlled(route)) {
        await reconcile_router_accesses();
    }
}

exports.Start = async function(siteId) {
    Log('[Ingress Skupper v2 module started]');
    await do_reconcile_config_maps();
    await do_reconcile_router_accesses();
    kube.WatchConfigMaps(onConfigMapWatch);
    kube.WatchRouterAccesses(onRouterAccessWatch);
}