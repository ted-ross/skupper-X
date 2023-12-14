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
const fs     = require('fs/promises');

const SERVICE_NAME = 'skx-router';
const ROUTER_LABEL = 'skx-router';
const CERT_DIRECTORY = '/etc/skupper-router-certs/';

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
            },
            to: {
                kind: 'Service',
                name: SERVICE_NAME,
            },
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
        for (const name of ['skx-peer', 'skx-member', 'skx-manage']) {
            if (route.metadata.name == name && route.spec.host) {
                ingress_bundle.ingresses[name] = {
                    host: route.spec.host,
                    port: 443,
                };
            }
        }
    }

    if (Object.keys(ingress_bundle.ingresses).length == 3) {
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
    await sync_route('skx-manage', 'manage');
    setTimeout(resolve_ingress, 1000);
}

const add_profile = async function(name, secret) {
    let path = CERT_DIRECTORY + name + '/';
    let profile = {
        name: name,
        caCertFile:     path + 'ca.crt',
        certFile:       path + 'tls.crt',
        privateKeyFile: path + 'tls.key',
    };

    await router.CreateSslProfile(name, profile);
    Log(`Created new SslProfile: ${name}`);
    try {
        await fs.mkdir(CERT_DIRECTORY + name);
        for (const [key, value] of Object.entries(secret.data)) {
            let filepath = path + key;
            let text     = Buffer.from(value, "base64");
            await fs.writeFile(filepath, text);
            Log(`  Wrote secret data to profile path: ${filepath}`);
        }
    } catch (error) {
        Log(`Exception during profile creation: ${error.message}`);
    }
}

const sync_ssl_profiles = async function() {
    let router_profiles = await router.ListSslProfiles();
    let secrets         = await kube.GetSecrets();
    let profiles        = [];

    router_profiles.forEach(p => {
        profiles[p.name] = p;
    });

    for (const secret of secrets) {
        let profile_name = secret.metadata.annotations ? secret.metadata.annotations['skupper.io/skx-inject'] : undefined;
        if (profile_name) {
            if (profile_name in profiles) {
                profiles.delete(profile_name);
            } else {
                await add_profile(profile_name, secret)
            }
        }
    };

    for (const p of profiles) {
        await router.DeleteSslProfile(p.name);
        await fs.rm(CERT_DIRECTORY + p.name, force=true, recursive=true);
    };
}

const start_config_sync = async function() {
    await sync_ssl_profiles();
}

exports.GetIngressBundle = function() {
    return ingress_bundle;
}

exports.Start = async function() {
    Log('[Ingress module started]');
    await sync_ingress();
    router.NotifyMgmtReady(() => {
        start_config_sync();
    });
}