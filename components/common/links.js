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

/*
 * This module is responsible for synchronizing secrets to router ssl-profiles and the 'skupperx-[incom,outgo]ing' config maps to connectors and listeners.
 */

const Log    = require('./log.js').Log;
const kube   = require('./kube.js');
const router = require('./router.js');
var   fs;   // require('fs/promises);

const CERT_DIRECTORY = process.env.SKX_CERT_PATH || '/etc/skupper-router-certs/';

const inject_profile = async function(name, secret) {
    let path = CERT_DIRECTORY + name + '/';
    let profile = {
        caCertFile:     path + 'ca.crt',
        certFile:       path + 'tls.crt',
        privateKeyFile: path + 'tls.key',
    };

    Log(`Creating new SslProfile: ${name}`);
    await router.CreateSslProfile(name, profile);
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

const sync_secrets = async function() {
    let router_profiles = await router.ListSslProfiles();
    let secrets         = await kube.GetSecrets();
    let profiles        = {};

    router_profiles.forEach(p => {
        profiles[p.name] = p;
    });

    for (const secret of secrets) {
        let profile_name = secret.metadata.annotations ? secret.metadata.annotations['skupper.io/skx-inject'] : undefined;
        if (profile_name) {
            if (Object.keys(profiles).indexOf(profile_name) >= 0) {
                delete profiles[profile_name];
            } else {
                await inject_profile(profile_name, secret)
            }
        }
    };

    for (const p of Object.values(profiles)) {
        await router.DeleteSslProfile(p.name);
        await fs.rm(CERT_DIRECTORY + p.name, force=true, recursive=true);
    };
}

const sync_listeners = async function(router_listeners, config_listeners_json) {
    try {
        //
        // Build a map of the synchronizable listeners.  Exclude the builtin listeners.
        //
        let listener_map = {};
        for (const rl of router_listeners) {
            if (rl.name != 'health' && rl.name != 'sidecar') {
                listener_map[rl.name] = rl;
            }
        }

        //
        // Decode the JSON-strings in the config
        //
        var config_listeners = {};
        for (const [key, value] of Object.entries(config_listeners_json)) {
            config_listeners[key] = JSON.parse(value);
        }

        for (const [_lname, cl] of Object.entries(config_listeners)) {
            const lname = 'listener_' + _lname;
            if (lname in listener_map) {
                delete listener_map[lname];
            } else {
                Log(`Creating router listener ${lname}`);
                await router.CreateListener(lname, {
                    host:              cl.host,
                    port:              cl.port,
                    role:              cl.role,
                    cost:              cl.cost,
                    sslProfile:        cl.profile,
                    saslMechanisms:    'EXTERNAL',
                    stripAnnotations:  'no',
                    authenticatePeer:  true,
                    requireEncryption: true,
                    requireSsl:        true,
                });
            }
        }

        //
        // Any listeners remaining in the map were not mentioned in the config and should be removed.
        //
        for (const lname of Object.keys(listener_map)) {
            Log(`Deleting router listener ${lname}`);
            await router.DeleteListener(lname);
        }
    } catch (err) {
        Log(`Exception in sync_listeners: ${err.message}`);
    }
}

const sync_connectors = async function(router_connectors, config_connectors_json) {
    try {
        //
        // Build a map of the connectors.
        //
        let connector_map = {};
        for (const rc of router_connectors) {
            connector_map[rc.name] = rc;
        }

        var config_connectors = {};
        for (const [key, value] of Object.entries(config_connectors_json)) {
            config_connectors[key] = JSON.parse(value);
        }

        for (const [cname, cc] of Object.entries(config_connectors)) {
            if (cname in connector_map) {
                delete connector_map[cname];
            } else {
                Log(`Creating router connector connector_${cname}`);
                await router.CreateConnector('connector_' + cname, {
                    host:             cc.host,
                    port:             cc.port,
                    role:             cc.role,
                    cost:             cc.cost,
                    sslProfile:       cc.profile,
                    saslMechanisms:   'EXTERNAL',
                    stripAnnotations: 'no',
                    verifyHostname:   true,
                });
            }
        }

        //
        // Any connectors remaining in the map were not mentioned in the config and should be removed.
        //
        for (const cname of Object.keys(connector_map)) {
            Log(`Deleting router connector ${cname}`);
            await router.DeleteListener(cname);
        }
    } catch (err) {
        Log(`Exception in sync_connectors: ${err.message}`);
    }
}

const sync_config_map_incoming = async function() {
    var configmap;
    try {
        configmap = await kube.LoadConfigmap('skupperx-incoming');
    } catch(err) {
        Log(`Failed to load skupperx-incoming config-map, no links created`);
        return;
    }

    let actual_listeners  = await router.ListListeners();
    let config_listeners  = configmap.data;

    await sync_listeners(actual_listeners, config_listeners);
}

const sync_config_map_outgoing = async function() {
    var configmap;
    try {
        configmap = await kube.LoadConfigmap('skupperx-outgoing');
    } catch(err) {
        Log(`Failed to load skupperx-outgoing config-map, no links created`);
        return;
    }

    let actual_connectors = await router.ListConnectors();
    let config_connectors = configmap.data;

    await sync_connectors(actual_connectors, config_connectors);
}

const on_secret_watch = async function(kind, obj) {
    if (obj.metadata.annotations && obj.metadata.annotations['skupper.io/skx-inject']) {
        await sync_secrets();
    }
}

const on_configmap_watch = async function(kind, obj) {
    if (obj.metadata.name == 'skupperx-incoming') {
        await sync_config_map_incoming();
    } else if (obj.metadata.name == 'skupperx-outgoing') {
        await sync_config_map_outgoing();
    }
}

const start_sync_loop = async function () {
    Log('Link module sync-loop starting');
    await sync_secrets();
    await sync_config_map_incoming();
    await sync_config_map_outgoing();
    kube.WatchSecrets(on_secret_watch);
    kube.WatchConfigMaps(on_configmap_watch);
}

exports.Start = async function (_fs) {
    Log('[Links module started]');
    fs = _fs;
    router.NotifyMgmtReady(() => {
        try {
            start_sync_loop();
        } catch(err) {
            Log(`Exception in start_sync_loop: ${err.message} ${err.stack}`);
        }
    });
}
