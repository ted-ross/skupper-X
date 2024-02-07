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

const Log      = require('./common/log.js').Log;
const amqp     = require('./common/amqp.js');
const kube     = require('./common/kube.js');
const ingress  = require('./ingress.js');
const protocol = require('./common/protocol.js');

const API_CONTROLLER_ADDRESS = 'skx/sync/mgmtcontroller';
const API_MY_ADDRESS_PREFIX  = 'skx/sync/site/';

const REQUEST_TIMEOUT_SECONDS   = 10;
const HEARTBEAT_PERIOD_SECONDS  = 60;

var backboneMode;
var siteId;
var apiSender;
var apiReceiver;
var heartbeatTimer;

var localData = {
    'ingress/manage' : {hash: null, data: {}},
    'ingress/peer'   : {hash: null, data: {}},
    'ingress/claim'  : {hash: null, data: {}},
    'ingress/member' : {hash: null, data: {}},
};

var backboneHashSet = {
    'tls/site-client'   : {hash: null, kind: 'Secret',    objname: 'skupperx-site-client'},
    'tls/manage-server' : {hash: null, kind: 'Secret',    objname: 'skupperx-manage-server'},
    'tls/peer-server'   : {hash: null, kind: 'Secret',    objname: 'skupperx-peer-server'},
    'tls/claim-server'  : {hash: null, kind: 'Secret',    objname: 'skupperx-claim-server'},
    'tls/member-server' : {hash: null, kind: 'Secret',    objname: 'skupperx-member-server'},
    'links/incoming'    : {hash: null, kind: 'ConfigMap', objname: 'skupperx-links-incoming'},
    'links/outgoing'    : {hash: null, kind: 'ConfigMap', objname: 'skupperx-links-outgoing'},
};

const sslProfileNames = {
    'tls/site-client'   : 'site-client',
    'tls/manage-server' : 'manage-server',
    'tls/peer-server'   : 'peer-server',
    'tls/claim-server'  : 'claim-server',
    'tls/member-server' : 'member-server',
};


const sendHeartbeat = function() {
    let localHashSet = {};
    for (const [key, value] of Object.entries(localData)) {
        localHashSet[key] = value.hash;
    }
    if (apiSender) {
        amqp.SendMessage(apiSender, protocol.Heartbeat(siteId, localHashSet));
    }
    heartbeatTimer = setTimeout(sendHeartbeat, HEARTBEAT_PERIOD_SECONDS * 1000);
}

const deleteObject = async function(key) {
    const record = backboneHashSet[key];
    switch (record.kind) {
    case 'Secret'    : await kube.DeleteSecret(record.objname);     break;
    case 'ConfigMap' : await kube.DeleteConfigmap(record.objname);  break;
    }
}

const updateObject = async function(key, data) {
    try {
        let obj = {
            apiVersion : 'v1',
            kind       : backboneHashSet[key].kind,
            metadata   : data.metadata,
            data       : data.data,
        };

        obj.metadata.name = backboneHashSet[key].objname;

        if (obj.kind == 'Secret') {
            obj.type = 'kubernetes.io/tls';
            if (!obj.metadata.annotations) {
                obj.metadata.annotations = {};
            }
            obj.metadata.annotations['skupper.io/skx-inject'] = sslProfileNames[key];
        }

        await kube.ApplyObject(obj);
    } catch (error) {
        Log(`Exception in updateObject: ${error.message}`);
    }
}

const checkControllerHashset = async function(hashSet) {
    let updateKeys = [];
    let deleteKeys = [];
    for (const [key, hash] of Object.entries(hashSet)) {
        if (hash != backboneHashSet[key].hash) {
            Log(`Hash mismatch for key ${key}: ${hash} != ${backboneHashSet[key].hash}`);
            if (hash == null) {
                deleteKeys.push(key);
            } else {
                updateKeys.push(key);
            }
        }
    }

    for (const key of deleteKeys) {
        Log(`Reconcile: Deleting object ${key}`);
        await deleteObject(key);
        backboneHashSet[key].hash = null;
    }

    for (const key of updateKeys) {
        try {
            const [responseAp, responseBody] = await amqp.Request(apiSender, protocol.GetObject(siteId, key), {}, REQUEST_TIMEOUT_SECONDS);
            if (responseBody.statusCode == 200) {
                if (responseBody.objectName == key) {
                    Log(`Reconcile: Updating object ${key}`);
                    await updateObject(key, responseBody.data);
                    backboneHashSet[key].hash = responseBody.hash;
                } else {
                    Log(`Get response object name mismatch: Got ${responseBody.objectName}, expected ${key}`);
                }
            } else {
                Log(`Get request failure for ${key}: ${responseBody.statusDescription}`);
            }
        } catch (error) {
            Log(`Exception in checkControllerHashset processing for object ${key}: ${error.message}`);
        }
    }
}

const getObject = async function(objectname) {
    try {
        return [localData[objectname].hash, localData[objectname].data];
    } catch (error) {
        Log(`Exception in getObject: ${error.message}`);
    }
    return [null, {}];
}

const onSendable = function(unused) {
    Log('Beginning site-sync reconciliation');
    sendHeartbeat();
}

const onMessage = async function(unused, application_properties, body, onReply) {
    protocol.DispatchMessage(body,
        async (site, hashset) => {     // onHeartbeat
            await checkControllerHashset(hashset);
        },
        (site) => {              // onSolicit
            clearTimeout(heartbeatTimer);
            sendHeartbeat();
        },
        async (site, objectname) => {  // onGet
            let [hash, data] = await getObject(objectname);
            onReply({}, protocol.GetObjectResponseSuccess(objectname, hash, data));
        });
}

const initializeHashState = async function() {
    //
    // Scan the local versions of the backbone state to pre-populate the hash structure.
    //
    for (const [key, value] of Object.entries(backboneHashSet)) {
        try {
            if (value.kind == 'Secret') {
                const secret = await kube.LoadSecret(value.objname);
                backboneHashSet[key].hash = secret.metadata.annotations['skupper.io/skx-hash'];
            } else if (value.kind == 'ConfigMap') {
                const configmap = await kube.LoadConfigmap(valud.objname);
                backboneHashSet[key].hash = configmap.metadata.annotations['skupper.io/skx-hash'];
            }
            Log(`Initial hash state for key ${key}: ${backboneHashSet[key].hash}`);
        } catch (error) {
            // Ignore exception
            Log(`No local state found for: ${key}`);
        }
    }
}

const initializeLocalData = async function() {
    //
    // Call on the ingress module to provide the local hash and data for our existing ingresses.
    //
    const initialConfig = await ingress.GetInitialConfig();
    for (const [key, value] of Object.entries(initialConfig)) {
        localData['ingress/' + key] = value;
    }
}

exports.LocalObjectUpdated = function(kind, objname, hash) {
    for (const [key, value] of Object.entries(backboneHashSet)) {
        if (value.kind == kind && value.objname == objname) {
            if (backboneHashSet[key].hash != hash) {
                Log(`Updated hashset key ${key} with hash ${hash}`);
                backboneHashSet[key].hash = hash;
            }
            return;
        }
    }
}

exports.UpdateIngress = function(key, _hash, _data) {
    key = 'ingress/' + key;
    Log(`Reconcile: Updating local hash for key ${key}`);
    if (_hash != localData[key].hash) {
        localData[key].hash = _hash;
        localData[key].data = _data;
        clearTimeout(heartbeatTimer);
        sendHeartbeat();
    }
}

exports.Start = async function (mode, id, connection) {
    Log('[Site-Sync module started]');
    backboneMode = mode;
    siteId       = id;
    await initializeHashState();
    await initializeLocalData();
    apiSender   = amqp.OpenSender('Site-Sync', connection, API_CONTROLLER_ADDRESS, onSendable);
    apiReceiver = amqp.OpenReceiver(connection, API_MY_ADDRESS_PREFIX + siteId, onMessage);
}
