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
const amqp     = require('./common/ampq.js');
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
    'ingressurl/mgmt'   : {hash : null, data: {}},
    'ingressurl/peer'   : {hash : null, data: {}},
    'ingressurl/claim'  : {hash : null, data: {}},
    'ingressurl/member' : {hash : null, data: {}},
};

var backboneHashSet = {
    'tls/site-client'   : {hash: null, kind: 'secret',    objname: 'skupperx-site-client'},
    'tls/mgmt-server'   : {hash: null, kind: 'secret',    objname: 'skupperx-mgmt-server'},
    'tls/peer-server'   : {hash: null, kind: 'secret',    objname: 'skupperx-peer-server'},
    'tls/claim-server'  : {hash: null, kind: 'secret',    objname: 'skupperx-claim-server'},
    'tls/member-server' : {hash: null, kind: 'secret',    objname: 'skupperx-member-server'},
    'ingress/mgmt'      : {hash: null, kind: 'configmap', objname: 'skupperx-ingress-mgmt'},
    'ingress/peer'      : {hash: null, kind: 'configmap', objname: 'skupperx-ingress-peer'},
    'ingress/claim'     : {hash: null, kind: 'configmap', objname: 'skupperx-ingress-claim'},
    'ingress/member'    : {hash: null, kind: 'configmap', objname: 'skupperx-ingress-member'},
    'links/outgoing'    : {hash: null, kind: 'configmap', objname: 'skupperx-links-outgoing'},
};


const sendHeartbeat = function() {
    let localHashSet = {};
    for (const [key, value] of Object.entries(localData)) {
        localHashSet[key] = value.hash;
    }
    amqp.SendMessage(apiSender, protocol.Heartbeat(siteId, localHashSet));
    heartbeatTimer = setTimeout(sendHeartbeat, HEARTBEAT_PERIOD_SECONDS * 1000);
}

const deleteObject = async function(key) {
    const record = backboneHashSet[key];
    switch (record.kind) {
    case 'secret'    : await kube.DeleteSecret(record.objname);     break;
    case 'configmap' : await kube.DeleteConfigmap(record.objname);  break;
    }
}

const updateObject = async function(objectname, data) {
}

const checkControllerHashset = async function(hashSet) {
    let updateKeys = [];
    let deleteKeys = [];
    for (const [key, value] of Object.entries(hashSet)) {
        if (value.hash != backboneHashSet[key]) {
            if (value.hash == null) {
                deleteKeys.push(key);
            } else {
                updateKeys.push(key);
            }
        }
    }

    for (const key of deleteKeys) {
        await deleteObject(key);
        backboneHashSet[key].hash = null;
    }

    for (const key of updateKeys) {
        try {
            const [responseAp, responseBody] = await amqp.Request(apiSender, protocol.GetObject(siteId, key), {}, REQUEST_TIMEOUT_SECONDS);
            if (responseBody.statusCode == 200) {
                if (responseBody.objectName == key) {
                    await updateObject(key, responseBody.data);
                    backboneHashSet[key].hash = responseBody.hash;
                } else {
                    Log(`Get response object name mismatch: Got ${responseBody.objectName}, expected ${key}`);
                }
            } else {
                Log(`Get request failure for ${key}: ${responseBody.statusDescription}`);
            }
        } catch (error) {
            Log(`Exception during sync-update process for object ${key}: ${error.message}`);
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

exports.UpdateIngress = function(key, _hash, _data) {
    localData[key].hash = _hash;
    localData[key].data = _data;
    clearTimeout(heartbeatTimer);
    sendHeartbeat();
}

exports.Start = async function (mode, id, connection) {
    Log('[Site-Sync module started]');
    backboneMode = mode;
    siteId       = id;
    apiSender    = amqp.OpenSender('Site-Sync', connection, API_CONTROLLER_ADDRESS, onSendable);
    apiReceiver  = amqp.OpenReceiver(connection, API_MY_ADDRESS_PREFIX + siteId, onMessage);
}
