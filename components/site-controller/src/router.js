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

const amqp   = require('rhea');
const fs     = require('fs');
const Log    = require('./common/log.js').Log;
const { resolve } = require('path');

const QUERY_TIMEOUT_SECONDS = 5;

amqp.options.enable_sasl_external = true;

var shuttingDown = false;
var conn;
var receiver;
var mgmtSender;
var anonSender;
var replyTo;
var pollTimer;
var nextCid  = 1;
var inFlight = {};        // { cid : handler }
var inFlightSubject = {}; // { subj : handler }
var connectorStatus = {};
var connectedHandlers = [];
var readyHandlers     = [];

const responseBodyToList = function(body) {
    let keys   = body.attributeNames;
    let values = body.results;
    let list   = [];
    var i, j;
    for (i = 0; i < values.length; i++) {
        let map = {};
        for (j = 0; j < keys.length; j++) {
            map[keys[j]] = values[i][j];
        }
        list.push(map);
    }
    return list;
}

const handleConnectorResponse = function(response) {
    if (response.application_properties.statusCode == 200) {
        let connectors = responseBodyToList(response.body);
        let newStatus = {};
        connectors.forEach(connector => {
            if (connector.name.substring(0,4) == 'nhc-') {
                let key = connector.name.substring(4);
                let active = connector.connectionMsg.includes('Connection Opened');
                newStatus[key] = active;
            }
        });
        if (JSON.stringify(newStatus) != JSON.stringify(connectorStatus)) {
            connectorStatus = newStatus;
        }
    }
}

const sendConnectorRequest = function() {
    return new Promise((resolve, reject) => {
        let cid = nextCid;
        nextCid++;
        inFlight[cid] = handleConnectorResponse;
        let request = {
            reply_to       : replyTo,
            correlation_id : cid,
            application_properties : {
                operation  : 'QUERY',
                type       : 'org.amqp.management',
                entityType : 'org.apache.qpid.dispatch.connector'
            },
            body : {
                attributeNames : [
                    'role',
                    'cost',
                    'connectionStatus',
                    'connectionMsg',
                    'name'
                ]
            }
        };
        mgmtSender.send(request);
        resolve(cid);
    });
}

const readAddress = function(addr, timeout) {
    return new Promise((resolve, reject) => {
        let timer = setTimeout(() => reject('timeout'), timeout * 1000);
        let cid   = nextCid;
        nextCid++;
        inFlight[cid] = (response) => {
            clearTimeout(timer);
            if (response.application_properties.statusCode == 200) {
                resolve(response.body);
            } else {
                reject(response.application_properties.statusDescription);
            }
        };
        mgmtSender.send({
            reply_to       : replyTo,
            correlation_id : cid,
            application_properties : {
                operation  : 'READ',
                type       : 'org.amqp.management',
                entityType : 'org.apache.qpid.dispatch.router.address',
                name       : addr
            }
        });
    })
}

const poll = function() {
    pollTimer = undefined;
    if (shuttingDown) {
        return;
    }
    return sendConnectorRequest()
    .finally(() => pollTimer = setTimeout(poll, 1000 * config.ConnectorPollInterval()));
}

exports.Start = function () {
    Log("[Router AMQP client module starting]");
    return new Promise((resolve, reject) => {
        connectedHandlers.push(() => resolve());
        conn       = amqp.connect();
        receiver   = conn.open_receiver({source:{dynamic:true}});
        mgmtSender = conn.open_sender('$management');
        anonSender = conn.open_sender();
    });
}

exports.Shutdown = function() {
    return new Promise((resolve, reject) => {
        shuttingDown = true;
        conn.close();
        resolve();
    })
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

exports.ListTcpConnectors = function(attributes = []) {
    return exports.ListManagementEntity('org.apache.qpid.dispatch.tcpConnector', QUERY_TIMEOUT_SECONDS, attributes);
}

exports.CreateTcpConnector = function(name, obj) {
    return exports.CreateManagementEntity('org.apache.qpid.dispatch.tcpConnector', name, obj, QUERY_TIMEOUT_SECONDS);
}

exports.DeleteTcpConnector = function(name) {
    return exports.DeleteManagementEntity('org.apache.qpid.dispatch.tcpConnector', name, QUERY_TIMEOUT_SECONDS);
}

exports.ListTcpListeners = function(attributes = []) {
    return exports.ListManagementEntity('org.apache.qpid.dispatch.tcpListener', QUERY_TIMEOUT_SECONDS, attributes);
}

exports.CreateTcpListener = function(name, obj) {
    return exports.CreateManagementEntity('org.apache.qpid.dispatch.tcpListener', name, obj, QUERY_TIMEOUT_SECONDS);
}

exports.DeleteTcpListener = function(name) {
    return exports.DeleteManagementEntity('org.apache.qpid.dispatch.tcpListener', name, QUERY_TIMEOUT_SECONDS);
}

exports.ListAddresses = function(attributes = []) {
    return exports.ListManagementEntity('org.apache.qpid.dispatch.router.address', QUERY_TIMEOUT_SECONDS, attributes);
}

exports.ListLinks = function(attributes = []) {
    return exports.ListManagementEntity('org.apache.qpid.dispatch.router.link', QUERY_TIMEOUT_SECONDS, attributes);
}

exports.OnRouterReady = function(callback) {
    readyHandlers.push(callback);
}

amqp.on('connection_open', function(context) {
    Log("AMQP connection to the router is open");
    connectedHandlers.forEach(handler => handler());
    connectedHandlers = [];
});

amqp.on('receiver_open', function (context) {
    replyTo = context.receiver.source.address;
    Log(`AMQP dynamic reply address: ${replyTo}`);
    if (pollTimer) {
        clearTimeout(pollTimer);
    }
    poll();
    readyHandlers.forEach(ready => ready());
});

amqp.on('message', function (context) {
    let response = context.message;
    let cid      = response.correlation_id;
    var handler;
    if (cid) {
        handler = inFlight[cid];
        if (handler) {
            delete inFlight[cid];
        }
    } else if (response.subject) {
        handler = inFlightSubject[response.subject];
        if (handler) {
            delete inFlightSubject[response.subject];
        }
    }

    if (handler) {
        handler(response);
    }
});
