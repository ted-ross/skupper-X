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

const container = require('rhea');
const Log       = require('./common/log.js').Log;

container.options.enable_sasl_external = true;

const QUERY_TIMEOUT_SECONDS = 5;
const API_ADDRESS = 'skx/controller/bb';

var conn;
var replyReceiver;
var replyTo;
var apiSender;
var mgmtSender;
var nextCid  = 1;
var inFlight = {};        // { cid : handler }

var receiverReady    = false;
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
        notify_api_waiters();
    } else if (context.sender == mgmtSender) {
        notify_mgmt_waiters();
    }
});

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

exports.ListSslProfiles = function(attributes = []) {
    return exports.ListManagementEntity('io.skupper.router.sslProfile', QUERY_TIMEOUT_SECONDS, attributes);
}

exports.CreateSslProfile = function(name, obj) {
    return exports.CreateManagementEntity('io.skupper.router.sslProfile', name, obj, QUERY_TIMEOUT_SECONDS);
}

exports.DeleteSslProfile = function(name) {
    return exports.DeleteManagementEntity('io.skupper.router.sslProfile', name, QUERY_TIMEOUT_SECONDS);
}

exports.ListConnectors = function(attributes = []) {
    return exports.ListManagementEntity('io.skupper.router.connector', QUERY_TIMEOUT_SECONDS, attributes);
}

exports.CreateConnector = function(name, obj) {
    return exports.CreateManagementEntity('io.skupper.router.connector', name, obj, QUERY_TIMEOUT_SECONDS);
}

exports.DeleteConnector = function(name) {
    return exports.DeleteManagementEntity('io.skupper.router.connector', name, QUERY_TIMEOUT_SECONDS);
}

exports.ListListeners = function(attributes = []) {
    return exports.ListManagementEntity('io.skupper.router.listener', QUERY_TIMEOUT_SECONDS, attributes);
}

exports.CreateListener = function(name, obj) {
    return exports.CreateManagementEntity('io.skupper.router.listener', name, obj, QUERY_TIMEOUT_SECONDS);
}

exports.DeleteListener = function(name) {
    return exports.DeleteManagementEntity('io.skupper.router.listener', name, QUERY_TIMEOUT_SECONDS);
}

exports.NotifyMgmtReady = function(cb) {
    mgmtWaiting.push(cb);
    notify_mgmt_waiters();
}

exports.NotifyApiReady = function(cb) {
    apiWaiting.push(cb);
    notify_api_waiters();
}

exports.Start = async function() {
    Log('[AMQP module started]')
    conn = container.connect();
    replyReceiver = conn.open_receiver({source:{dynamic:true}});
    apiSender     = conn.open_sender(API_ADDRESS);
    mgmtSender    = conn.open_sender('$management');
}