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
// This module is the state-sync endpoint for backbone and member sites.
//
// The responsibility of this module is to synchronize Kubernetes state with the management controller.
//
// Local State (synchronized to the management-controller):
//   - Ingress host/port pairs for each access point (programatically supplied by ingress module)
//
// Remote State (synchronized from the management-controller):
//   - Secrets
//   - Access-Point ConfigMaps
//   - Link ConfigMaps
//

import { Log } from "@vms/modules/log";
import {
    INJECT_TYPE_SITE,
    INJECT_TYPE_ACCESS_POINT,
    STATE_TYPE_ACCESS_POINT,
    STATE_TYPE_LINK,
    META_ANNOTATION_STATE_KEY,
    META_ANNOTATION_STATE_DIR,
    META_ANNOTATION_STATE_HASH,
    META_ANNOTATION_STATE_TYPE,
    META_ANNOTATION_STATE_ID,
    META_ANNOTATION_TLS_INJECT,
    META_ANNOTATION_TLS_ORDINAL,
    META_ANNOTATION_TLS_LAST_VALID,
    API_CONTROLLER_ADDRESS,
    STATE_TYPE_LISTENER,
} from "@vms/modules/common";
import {
    Annotation,
    GetSecrets,
    GetConfigmaps,
    GetDeployments,
    GetPods,
    ApplyObject,
    DeleteSecret,
    DeleteConfigmap,
    DeleteDeployment,
    LoadSecret,
    ReplaceSecret,
    LoadConfigmap,
    UpdateLink,
    UpdateNetworkAccess,
    UpdateRouterAccess,
    LoadLink,
    DeleteLink,
    Controlled,
    DeleteRouterAccess,
    DeleteNetworkAccess,
    LoadRouterAccess,
    LoadNetworkAccess,
    GetListeners,
    LoadListener,
    DeleteListener,
} from "@vms/modules/kube";
import {
    UpdateLocalState as StateSyncUpdateLocalState,
    Start as StateSyncStart,
    CLASS_BACKBONE,
    CLASS_MEMBER,
    AddTarget,
    AddConnection,
} from "@vms/modules/state-sync";
import { GetInitialState, GetRouterAccessRole, GetAccessPointKind } from "./ingress-v2.js";
import { HashOfData } from "./hash.js";

let backbone_mode;
let backboneClientSecret;
let connectedToPeer = false;
let peerId;
const localState = {}; // state-key: {hash, data}

const kubeObjectForState = function (stateKey, data = null) {
    const elements = stateKey.split("-");
    let objName = "vms-" + stateKey;
    let objDir = "remote";
    let apiVersion = "v1";
    let objKind;
    let objType;
    let stateType;
    let stateId;
    let inject;

    if (elements.length < 2) {
        throw new Error(`Malformed stateKey: ${stateKey}`);
    }

    switch (elements[0]) {
        case "tls":
            objKind = "Secret";
            objType = "kubernetes.io/tls";
            if (elements[1] == "site") {
                stateId = stateKey.substring(9); // text following 'tls-site-'
                objName = `vms-site-${stateId}`;
                inject = INJECT_TYPE_SITE;
            } else if (elements[1] == "server") {
                stateId = stateKey.substring(11); // text following 'tls-server-'
                objName = `vms-access-${stateId}`;
                inject = INJECT_TYPE_ACCESS_POINT;
            } else {
                throw new Error(`Invalid stateKey prefix ${elements[0]}-${elements[1]}`);
            }
            break;
        case "access": {
            stateType = STATE_TYPE_ACCESS_POINT;
            stateId = stateKey.substring(7); // text following 'access-'
            apiVersion = "skupper.io/v2alpha1";
            objKind = "RouterAccess";
            let apKind = GetAccessPointKind(stateId);
            if (data && "kind" in data) {
                apKind = data.kind;
            }
            if (apKind == "van") {
                objKind = "NetworkAccess";
            }
            objName = apKind + "-" + stateId.split("-")[0];
            break;
        }
        case "link":
            apiVersion = "skupper.io/v2alpha1";
            objKind = "Link";
            stateType = STATE_TYPE_LINK;
            stateId = stateKey.substring(5); // text following 'link-'
            break;
        case "accessstatus":
            objKind = "InMemory";
            objDir = "local";
            break;
        case "van":
            apiVersion = "skupper.io/v2alpha1";
            objKind = "Listener";
            stateType = STATE_TYPE_LISTENER;
            stateId = stateKey.substring(4); // text following 'van-'
            break;
        default:
            throw new Error(`Invalid stateKey prefix: ${elements[0]}`);
    }

    return [objName, apiVersion, objKind, objType, objDir, stateType, stateId, inject];
};

const stateForList = function (objectList, local, remote) {
    for (const obj of objectList) {
        const stateKey = Annotation(obj, META_ANNOTATION_STATE_KEY);
        const stateDir = Annotation(obj, META_ANNOTATION_STATE_DIR);
        const stateHash = Annotation(obj, META_ANNOTATION_STATE_HASH);

        if (!!stateKey && !!stateDir && !!stateHash) {
            if (stateDir == "local") {
                local[stateKey] = stateHash;
            } else if (stateDir == "remote") {
                remote[stateKey] = stateHash;
            }
        }
    }
    return [local, remote];
};

const stateInMemory = function (local) {
    for (const [key, data] of Object.entries(localState)) {
        local[key] = data.hash;
    }
    return local;
};

const getInitialHashState = async function () {
    let local = {};
    let remote = {};
    const secrets = await GetSecrets();
    const configmaps = await GetConfigmaps();
    const deployments = await GetDeployments();
    const pods = await GetPods();
    const listeners = await GetListeners();
    [local, remote] = stateForList(secrets, local, remote);
    [local, remote] = stateForList(configmaps, local, remote);
    [local, remote] = stateForList(deployments, local, remote);
    [local, remote] = stateForList(pods, local, remote);
    [local, remote] = stateForList(listeners, local, remote);
    if (backbone_mode) {
        const ingressState = await GetInitialState();
        for (const [apid, state] of Object.entries(ingressState)) {
            local[`accessstatus-${apid}`] = {
                hash: HashOfData(state),
                data: state,
            };
        }
    }
    local = stateInMemory(local);
    return [local, remote];
};

const doStateChangeSpec = async function (obj, data) {
    if (obj.apiVersion == "skupper.io/v2alpha1") {
        switch (obj.kind) {
            case "Link":
                await syncLinkSpec(obj, data);
                break;
            case "RouterAccess":
                await syncRouterAccessSpec(obj, data);
                break;
            case "NetworkAccess":
                await syncNetworkAccessSpec(obj, data);
                break;
            case "Listener":
                await syncListenerSpec(obj, data);
                break;
        }
    }
};

const onNewPeer = async function (_peerId, _peerClass) {
    connectedToPeer = true;
    peerId = _peerId;
    return await getInitialHashState();
};

const onPeerLost = async function (_peerId) {
    connectedToPeer = false;
    peerId = undefined;
};

const retrieveLatest = async function (apiVersion, objKind, objName) {
    Log(`Retrieving latest object - kind: ${apiVersion}.${objKind}, name: ${objName}`);
    if (objKind == "Secret") {
        return await LoadSecret(objName);
    }
    if (apiVersion == "skupper.io/v2alpha1") {
        try {
            switch (objKind) {
                case "Link":
                    return await LoadLink(objName);
                case "RouterAccess":
                    return await LoadRouterAccess(objName);
                case "NetworkAccess":
                    return await LoadNetworkAccess(objName);
                case "Listener":
                    return await LoadListener(objName);
            }
        } catch (ex) {
            if ("code" in ex && ex.code != 404) {
                Log(
                    `Error retrieving object - kind: ${apiVersion}.${objKind}, name: ${objName}, error: ${ex}`
                );
            }
        }
    }
    return undefined;
};

const updateObject = async function (obj) {
    const apiVersion = obj.apiVersion;
    const objKind = obj.kind;
    const objName = obj.metadata.name;
    Log(`Updating object - kind: ${apiVersion}.${objKind}, name: ${objName}`);
    if (objKind == "Secret") {
        return await ReplaceSecret(objName, obj);
    }
    if (apiVersion == "skupper.io/v2alpha1") {
        switch (objKind) {
            case "Link":
                return await UpdateLink(obj);
            case "RouterAccess":
                return await UpdateRouterAccess(obj);
            case "NetworkAccess":
                return await UpdateNetworkAccess(obj);
            default:
                Log(`Unsupported object kind: ${apiVersion}.${objKind}, name: ${objName}`);
        }
    }
    return undefined;
};

async function syncLinkSpec(obj, data) {
    obj.spec = {
        tlsCredentials: await getBackboneClientSecret(),
        cost: parseInt(data.cost, 10),
        endpoints: [
            {
                name: "inter-router",
                group: "skupper-router",
                host: data.host,
                port: data.port,
            },
        ],
    };
}

async function syncRouterAccessSpec(obj, data) {
    obj.spec = {
        tlsCredentials: `vms-access-${Annotation(obj, META_ANNOTATION_STATE_ID)}`,
        generateTlsCredentials: false,
        roles: [
            {
                name: GetRouterAccessRole(data.kind),
            },
        ],
    };
    if ("bindHost" in data) {
        obj.spec.bindHost = data.bindHost;
    }
    if ("accessType" in data) {
        obj.spec.accessType = data.accessType;
    }
}

async function syncNetworkAccessSpec(obj, data) {
    obj.spec = {
        tlsCredentials: `vms-access-${Annotation(obj, META_ANNOTATION_STATE_ID)}`,
        generateTlsCredentials: false,
    };
    if ("bindHost" in data) {
        obj.spec.bindHost = data.bindHost;
    }
    if ("accessType" in data) {
        obj.spec.accessType = data.accessType;
    }
}

async function syncListenerSpec(obj, data) {
    const vanId = data.vanid;
    obj.spec = {
        observer: "none",
        host: `skupper-console-${vanId}`,
        port: 8080,
        routingKey: `skupper-console-${vanId}`,
    };
}

async function getBackboneClientSecret() {
    if (backboneClientSecret) {
        return backboneClientSecret;
    }
    for (const secret of await GetSecrets()) {
        if (
            !Controlled(secret) ||
            Annotation(secret, META_ANNOTATION_TLS_INJECT) != INJECT_TYPE_SITE
        ) {
            continue;
        }
        backboneClientSecret = secret.metadata.name;
        return backboneClientSecret;
    }
    if (!backboneClientSecret) {
        throw new Error("Site client certificate not found");
    }
}

function takeTlsRotationFromSyncData(data, annotations) {
    if (!data || typeof data !== "object") {
        return data;
    }
    const certData = { ...data };
    if (Object.hasOwn(certData, "ordinal")) {
        annotations[META_ANNOTATION_TLS_ORDINAL] = String(certData.ordinal);
        delete certData.ordinal;
    }
    if (Object.hasOwn(certData, "lastValid")) {
        annotations[META_ANNOTATION_TLS_LAST_VALID] = String(certData.lastValid);
        delete certData.lastValid;
    }
    return certData;
}

const onStateChange = async function (peerId, stateKey, hash, data) {
    const [objName, apiVersion, objKind, objType, objDir, stateType, stateId, inject] =
        kubeObjectForState(stateKey, data);
    if (objDir == "local") {
        throw new Error(`Protocol error: Received update for local state ${stateKey}`);
    }

    if (objName == "spec") {
        await doStateChangeSpec(hash, data);
    } else {
        if (hash) {
            const isSkupperResource = apiVersion == "skupper.io/v2alpha1";
            let obj = await retrieveLatest(apiVersion, objKind, objName);
            let create = true;
            if (!obj) {
                obj = {
                    apiVersion: apiVersion,
                    kind: objKind,
                    metadata: {
                        name: objName,
                        annotations: {
                            [META_ANNOTATION_STATE_KEY]: stateKey,
                            [META_ANNOTATION_STATE_DIR]: objDir,
                            [META_ANNOTATION_STATE_HASH]: hash,
                        },
                    },
                };
            } else {
                const existing_hash = Annotation(obj, META_ANNOTATION_STATE_HASH);
                if (existing_hash == hash) {
                    Log(
                        `Ignoring state change for kind: ${apiVersion}/${objKind}, name: ${objName} as hash is unchanged: ${hash}`
                    );
                    return;
                }
                create = false;
                if (!obj.metadata.annotations) {
                    obj.metadata.annotations = {};
                }
                obj.metadata.annotations[META_ANNOTATION_STATE_KEY] = stateKey;
                obj.metadata.annotations[META_ANNOTATION_STATE_DIR] = objDir;
                obj.metadata.annotations[META_ANNOTATION_STATE_HASH] = hash;
            }
            if (objType) {
                obj.type = objType;
            }

            if (stateType) {
                obj.metadata.annotations[META_ANNOTATION_STATE_TYPE] = stateType;
            }

            if (stateId) {
                obj.metadata.annotations[META_ANNOTATION_STATE_ID] = stateId;
            }

            if (inject) {
                obj.metadata.annotations[META_ANNOTATION_TLS_INJECT] = inject;
            }

            if (!isSkupperResource) {
                obj.data = takeTlsRotationFromSyncData(data, obj.metadata.annotations);
            } else {
                await doStateChangeSpec(obj, data);
            }

            if (create) {
                await ApplyObject(obj);
            } else {
                await updateObject(obj);
            }
        } else {
            if (objKind == "Secret") {
                await DeleteSecret(objName);
            } else if (objKind == "ConfigMap") {
                await DeleteConfigmap(objName);
            } else if (objKind == "Deployment") {
                await DeleteDeployment(objName);
            } else if (objKind == "Link") {
                await DeleteLink(objName);
            } else if (objKind == "RouterAccess") {
                await DeleteRouterAccess(objName);
            } else if (objKind == "NetworkAccess") {
                await DeleteNetworkAccess(objName);
            } else if (objKind == "Listener") {
                await DeleteListener(objName);
            }
        }
    }
};

const onStateRequest = async function (peerId, stateKey) {
    const [objName, _apiVersion, objKind, _objType, objDir] = kubeObjectForState(stateKey);
    if (objDir == "remote") {
        throw new Error(`Protocol error: Received request for remote state ${stateKey}`);
    }

    let obj;
    let hash;

    try {
        if (objKind == "Secret") {
            // No local secrets currently
            obj = await LoadSecret(objName);
            hash = Annotation(obj, META_ANNOTATION_STATE_HASH);
        } else if (objKind == "ConfigMap") {
            // No local configmaps currently
            obj = await LoadConfigmap(objName);
            hash = Annotation(obj, META_ANNOTATION_STATE_HASH);
        } else if (objKind == "InMemory") {
            obj = { data: localState[stateKey].data };
            hash = localState[stateKey].hash;
        }
    } catch {
        hash = null;
    }

    if (hash) {
        return [hash, obj.data];
    }
    return [null, null];
};

const onPing = async function (_siteId) {
    // This function intentionally left blank
};

export async function UpdateLocalState(stateKey, stateHash, stateData) {
    if (stateHash) {
        localState[stateKey] = {
            hash: stateHash,
            data: stateData,
        };
    } else {
        delete localState[stateKey];
    }

    if (connectedToPeer) {
        await StateSyncUpdateLocalState(peerId, stateKey, stateHash);
    }
}

export async function Start(siteId, conn, _backbone_mode, _platform) {
    backbone_mode = _backbone_mode;
    Log(`[Sync-Site-Kube module started]`);
    await StateSyncStart(
        backbone_mode ? CLASS_BACKBONE : CLASS_MEMBER,
        siteId,
        undefined,
        onNewPeer,
        onPeerLost,
        onStateChange,
        onStateRequest,
        onPing
    );
    await AddTarget(API_CONTROLLER_ADDRESS);
    await AddConnection(undefined, conn);
}
