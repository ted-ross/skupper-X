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

const Log = require('./log.js').Log;

const QUERY_TIMEOUT_SECONDS = 5;

var container;
var conn;
var replyReceiver;
var replyTo;
var apiSender;
var mgmtSender;
var nextCid  = 1;
var nextMessageId = 1;
var inFlight = {};        // { cid : handler }

var receiverReady   = false;
var mgmtSenderReady = false;
var apiSenderReady  = false;

var mgmtWaiting = [];
var apiWaiting  = [];

const notify_mgmt_waiters = function() {
    if (receiverReady && mgmtSenderReady) {
        mgmtWaiting.forEach(cb => cb());
        mgmtWaiting = [];
    }
}

const notify_api_waiters = function() {
    if (receiverReady && apiSenderReady) {
        apiWaiting.forEach(cb => cb());
        apiWaiting = [];
    }
}

const rhea_handlers = function() {
    container.options.enable_sasl_external = true;

    container.on('connection_open', function(context) {
        Log('Connection to the local access point is open');
    });

    container.on('receiver_open', function(context) {
        replyTo = context.receiver.source.address;
        if (!receiverReady) {
            receiverReady = true;
            notify_mgmt_waiters();
            notify_api_waiters();
        }
        Log(`AMQP dynamic reply address: ${replyTo}`);
    });

    container.on('sendable', function(context) {
        if (context.sender == apiSender) {
            Log('Management controller is reachable');
            apiSenderReady = true;
            notify_api_waiters();
        } else if (context.sender == mgmtSender) {
            mgmtSenderReady = true;
            notify_mgmt_waiters();
        }
    });

    container.on('message', function (context) {
        let response = context.message;
        let cid      = response.correlation_id;
        var handler;
        if (cid) {
            handler = inFlight[cid];
            if (handler) {
                delete inFlight[cid];
                handler(response);
            }
        }
    });
}

const convertBodyToItems = function(body) {
    let keys  = body.attributeNames;
    let items = [];
    body.results.forEach(values => {
        let item = {};
        for (let i = 0; i < keys.length; i++) {
            item[keys[i]] = values[i];
        }
        items.push(item);
    });
    return items;
}

exports.ListManagementEntity = function(entityType, timeout, attributes=[]) {
    return new Promise((resolve, reject) => {
        let timer = setTimeout(() => reject('ListManagementEntity timeout'), timeout * 1000);
        let cid   = nextCid;
        nextCid++;
        inFlight[cid] = (response) => {
            clearTimeout(timer);
            if (response.application_properties.statusCode == 200) {
                let items = convertBodyToItems(response.body);
                resolve(items);
            } else {
                reject(response.application_properties.statusDescription);
            }
        };
        mgmtSender.send({
            reply_to       : replyTo,
            correlation_id : cid,
            application_properties : {
                operation  : 'QUERY',
                type       : 'org.amqp.management',
                entityType : entityType,
                name       : 'self',
            },
            body : {
                attributeNames : attributes,
            }
        });
    });
}

exports.CreateManagementEntity = function(entityType, name, data, timeout) {
    return new Promise((resolve, reject) => {
        let timer = setTimeout(() => reject('CreateManagementEntity timeout'), timeout * 1000);
        let cid   = nextCid;
        nextCid++;
        inFlight[cid] = (response) => {
            clearTimeout(timer);
            if (response.application_properties.statusCode == 201) {
                resolve(response.body);
            } else {
                reject(response.application_properties.statusDescription);
            }
        };
        mgmtSender.send({
            reply_to       : replyTo,
            correlation_id : cid,
            application_properties : {
                operation : 'CREATE',
                type      : entityType,
                name      : name,
            },
            body : data,
        });
    });
}

exports.DeleteManagementEntity = function(entityType, name, timeout) {
    return new Promise((resolve, reject) => {
        let timer = setTimeout(() => reject('DeleteManagementEntity timeout'), timeout * 1000);
        let cid   = nextCid;
        nextCid++;
        inFlight[cid] = (response) => {
            clearTimeout(timer);
            if (response.application_properties.statusCode == 204) {
                resolve(response.body);
            } else {
                reject(response.application_properties.statusDescription);
            }
        };
        mgmtSender.send({
            reply_to       : replyTo,
            correlation_id : cid,
            application_properties : {
                operation : 'DELETE',
                type      : entityType,
                name      : name,
            },
        });
    });
}

exports.ListSslProfiles = async function(attributes = []) {
    return await exports.ListManagementEntity('io.skupper.router.sslProfile', QUERY_TIMEOUT_SECONDS, attributes);
}

exports.CreateSslProfile = async function(name, obj) {
    await exports.CreateManagementEntity('io.skupper.router.sslProfile', name, obj, QUERY_TIMEOUT_SECONDS);
}

exports.DeleteSslProfile = async function(name) {
    await exports.DeleteManagementEntity('io.skupper.router.sslProfile', name, QUERY_TIMEOUT_SECONDS);
}

exports.ListConnectors = async function(attributes = []) {
    return await exports.ListManagementEntity('io.skupper.router.connector', QUERY_TIMEOUT_SECONDS, attributes);
}

exports.CreateConnector = async function(name, obj) {
    await exports.CreateManagementEntity('io.skupper.router.connector', name, obj, QUERY_TIMEOUT_SECONDS);
}

exports.DeleteConnector = async function(name) {
    await exports.DeleteManagementEntity('io.skupper.router.connector', name, QUERY_TIMEOUT_SECONDS);
}

exports.ListListeners = async function(attributes = []) {
    return await exports.ListManagementEntity('io.skupper.router.listener', QUERY_TIMEOUT_SECONDS, attributes);
}

exports.CreateListener = async function(name, obj) {
    await exports.CreateManagementEntity('io.skupper.router.listener', name, obj, QUERY_TIMEOUT_SECONDS);
}

exports.DeleteListener = async function(name) {
    await exports.DeleteManagementEntity('io.skupper.router.listener', name, QUERY_TIMEOUT_SECONDS);
}

exports.NotifyMgmtReady = function(cb) {
    mgmtWaiting.push(cb);
    notify_mgmt_waiters();
}

exports.NotifyApiReady = function(cb) {
    apiWaiting.push(cb);
    notify_api_waiters();
}

exports.ApiSend = function(message) {
    const messageId = nextMessageId;
    nextMessageId++;
    apiSender.send({message_id: messageId, body: message});
}

exports.ApiRequest = function(request, onResponse, onFail, timeout) {
    const messageId = nextMessageId;
    const cid = nextCid;
    nextMessageId++;
    nextCid++;
    let timer = setTimeout(() => {
        delete inFlight[cid];
        onFail('timeout');
    }, timeout * 1000);
    inFlight[cid] = (response) => {
        clearTimeout(timer);
        onResponse(response.body)
    };

    apiSender.send({message_id: messageId, reply_to: replyTo, correlation_id: cid, body: request});
}

exports.Start = async function(rhea, apiAddress) {
    Log('[Router module started]')
    container = rhea;
    rhea_handlers();
    conn = container.connect();
    replyReceiver = conn.open_receiver({source:{dynamic:true}});
    apiSender     = conn.open_sender(apiAddress);
    mgmtSender    = conn.open_sender('$management');
}