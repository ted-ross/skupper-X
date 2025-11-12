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
 * This module is responsible for synchronizing:
 *   - Secrets to router ssl-profiles
 *   - ConfigMaps to connectors and listeners.
 */

/*
 * TODO Items for the future:
 *
 * - Update the profile injection to allow overwrite of existing SslProfiles with new content.
 * - Support the tls-ordinal/tls-oldest-valid features in SslProfiles.
 * - Support changes in link-cost (ignored presently) by deleting/re-creating connectors (or using a new router cost-update feature).
 */

const Log     = require('./common/log.js').Log;
const kube    = require('./common/kube.js');
const router  = require('./common/router.js');
const common  = require('./common/common.js');
const ingress = require('./ingress.js');
var   fs      = require('fs/promises');

const CERT_DIRECTORY = process.env.SKX_CERT_PATH || '/etc/skupper-router-certs/';

var backboneMode;

const inject_profile = async function(name, secret) {
    let path = CERT_DIRECTORY + name + '/';
    let profile = {
        caCertFile:     path + 'ca.crt',
        certFile:       path + 'tls.crt',
        privateKeyFile: path + 'tls.key',
        uidFormat:      'c',
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
        const inject_type = secret.metadata.annotations ? secret.metadata.annotations[common.META_ANNOTATION_TLS_INJECT] : undefined;
        if (inject_type) {
            const profile_name = (inject_type == common.INJECT_TYPE_SITE) ? 'site-client' : secret.metadata.name;
            if (Object.keys(profiles).indexOf(profile_name) >= 0) {
                delete profiles[profile_name];
            } else {
                await inject_profile(profile_name, secret)
            }
        }
    };

    //
    // Delete any profiles that were not mentioned in the set of secrets.
    //
    for (const p of Object.values(profiles)) {
        await router.DeleteSslProfile(p.name);
        await fs.rm(CERT_DIRECTORY + p.name, {recursive: true});
    };
}

const sync_listeners = async function() {
    //
    // Exit immediately if we are not in backbone mode.  There are no inter-router listeners on a member router.
    //
    if (!backboneMode) {
        return;
    }

    try {
        //
        // Get the current set of listeners from the router.
        //
        const router_listeners = await router.ListListeners();

        //
        // Build a map of the synchronizable listeners.  Exclude the listeners that we didn't create.
        //
        let listener_map = {};
        for (const rl of router_listeners) {
            if (rl.name.indexOf('skx_') == 0) {
                listener_map[rl.name] = rl;
            }
        }

        //
        // Get a list of the names of injected SslProfiles so we can avoid creating listeners that reference nonexistent profiles.
        //
        let sslProfileNames = [];
        const profileList = await router.ListSslProfiles();
        for (const profile of profileList) {
            sslProfileNames.push(profile.name);
        }

        //
        // Build a list of accesspoint-type ConfigMaps as our set of desired listeners.  Exclude any listeners for which there is no SslProfile.
        //
        const configMaplist = await kube.GetConfigmaps();
        var config_listeners = {};
        var target_ports     = {};
        for (const configMap of configMaplist) {
            if ((kube.Annotation(configMap, common.META_ANNOTATION_STATE_TYPE) == common.STATE_TYPE_ACCESS_POINT)
                && sslProfileNames.indexOf(configMap.metadata.name) >= 0) {
                let port = ingress.GetTargetPort(kube.Annotation(configMap, common.META_ANNOTATION_STATE_ID));
                if (port) {
                    config_listeners[configMap.metadata.name] = configMap.data;
                    target_ports[configMap.metadata.name] = port;
                }
            }
        }

        for (const [key, value] of Object.entries(config_listeners)) {
            const lname = `skx_listener_${value.kind}_${key}`;
            if (lname in listener_map) {
                delete listener_map[lname];
            } else {
                Log(`Creating router listener ${lname}`);
                var host    = value.bindhost || '';
                var port    = target_ports[key];
                var role    = 'normal';
                var profile = key;
                var strip   = 'both';
                var create_autolink = false;
                switch (value.kind) {
                case 'claim':
                case 'manage':
                    break;

                case 'peer':
                    role  = 'inter-router';
                    strip = 'no';
                    break;

                case 'member':
                    role  = 'edge';
                    strip = 'no';
                    break;

                case 'van':
                    role = 'inter-network';
                    create_autolink = true;
                    break;

                default:
                    throw(Error(`Unknown listener type ${value.kind}`));
                }

                await router.CreateListener(lname, {
                    host:              host,
                    port:              port,
                    role:              role,
                    cost:              1,
                    sslProfile:        profile,
                    saslMechanisms:    'EXTERNAL',
                    stripAnnotations:  strip,
                    authenticatePeer:  true,
                    requireEncryption: true,
                    requireSsl:        true,
                });

                if (create_autolink) {
                    await router.CreateAutoLink(lname, {
                        connection:      lname,
                        direction:       'in',
                        externalAddress: '_topo/mbone',
                    });
                }
            }
        }

        //
        // Any listeners remaining in the map were not mentioned in the config and should be removed.
        //
        for (const lname of Object.keys(listener_map)) {
            Log(`Deleting router listener ${lname}`);
            await router.DeleteListener(lname);
            try {
                await router.DeleteAutoLink(lname);
            } catch(e) {}
        }
    } catch (err) {
        Log(`Exception in sync_listeners: ${err.stack}`);
    }
}

const sync_connectors = async function() {
    try {
        //
        // Build a map of the existing router connectors.
        //
        const router_connectors = await router.ListConnectors();
        let connector_map = {};
        for (const rc of router_connectors) {
            connector_map[rc.name] = rc;
        }

        //
        // Build a map of synchronizable links.
        //
        const configMaplist = await kube.GetConfigmaps();
        var config_connectors = {};
        for (const configMap of configMaplist) {
            if (kube.Annotation(configMap, common.META_ANNOTATION_STATE_TYPE) == common.STATE_TYPE_LINK) {
                config_connectors[configMap.metadata.name] = configMap;
            }
        }

        for (const [cname, cc] of Object.entries(config_connectors)) {
            if (cname in connector_map) {
                delete connector_map[cname];
            } else {
                Log(`Creating router connector ${cname}`);
                await router.CreateConnector(cname, {
                    host:             cc.data.host,
                    port:             cc.data.port,
                    role:             backboneMode ? 'inter-router' : 'edge',
                    cost:             cc.data.cost,
                    sslProfile:       'site-client',
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
            await router.DeleteConnector(cname);
        }
    } catch (err) {
        Log(`Exception in sync_connectors: ${err.stack}`);
    }
}

const on_secret_watch = async function(kind, obj) {
    const inject_type = kube.Annotation(obj, common.META_ANNOTATION_TLS_INJECT);
    if (inject_type == common.INJECT_TYPE_ACCESS_POINT) {
        //
        // An update occurred that affects an access-point.  First, sync the secrets to update the SslProfiles,
        // then sync the Listeners in case SslProfile changes affect Listener configuration.
        //
        await sync_secrets();
        await sync_listeners();
    } else if (inject_type == common.INJECT_TYPE_SITE) {
        //
        // The site client certificate has bee updated.  Sync the secrets to ensure the SslProfiles are up to date.
        //
        await sync_secrets();
    }
}

const on_configmap_watch = async function(kind, obj) {
    const state_type = kube.Annotation(obj, common.META_ANNOTATION_STATE_TYPE);
    if (state_type == common.STATE_TYPE_ACCESS_POINT) {
        await sync_listeners();
    } else if (state_type == common.STATE_TYPE_LINK) {
        await sync_connectors();
    }
}

const start_sync_loop = async function () {
    Log('Link module sync-loop starting');
    await sync_secrets();
    await sync_listeners();
    await sync_connectors();
    kube.WatchSecrets(on_secret_watch);
    kube.WatchConfigMaps(on_configmap_watch);
}

exports.Start = async function (mode) {
    Log('[Links module started]');
    backboneMode = mode;
    router.NotifyApiReady(() => {
        try {
            start_sync_loop();
        } catch(err) {
            Log(`Exception in start_sync_loop: ${err.message} ${err.stack}`);
        }
    });
}
