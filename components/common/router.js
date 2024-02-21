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

const { on } = require('events');
const amqp = require('./amqp.js');
const Log  = require('./log.js').Log;

var mgmtSender;
var ready   = false;
var waiters = [];

const QUERY_TIMEOUT_SECONDS = 5;

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

exports.ListManagementEntity = async function(entityType, timeout, attributes=[]) {
    let requestAp = {
        operation  : 'QUERY',
        type       : 'org.amqp.management',
        entityType : entityType,
        name       : 'self',
    };
    let requestBody = {
        attributeNames : attributes,
    };

    const [replyAp, replyBody] = await amqp.Request(mgmtSender, requestBody, requestAp, timeout);

    if (replyAp.statusCode == 200) {
        let items = convertBodyToItems(replyBody);
        return items;
    }

    throw(Error(replyAp.statusDescription));
}

exports.CreateManagementEntity = async function(entityType, name, data, timeout) {
    let requestAp = {
        operation : 'CREATE',
        type      : entityType,
        name      : name,
    };

    const [replyAp, replyBody] = await amqp.Request(mgmtSender, data, requestAp, timeout);

    if (replyAp.statusCode == 201) {
        return (replyBody);
    }

    throw(Error(replyAp.statusDescription));
}

exports.DeleteManagementEntity = async function(entityType, name, timeout) {
    let requestAp = {
        operation : 'DELETE',
        type      : entityType,
        name      : name,
    };

    const [replyAp, replyBody] = await amqp.Request(mgmtSender, undefined, requestAp, timeout);

    if (replyAp.statusCode == 204) {
        return (replyBody);
    }

    throw(Error(replyAp.statusDescription));
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

exports.NotifyApiReady = async function(onApiReady) {
    if (ready) {
        onApiReady();
    } else {
        waiters.push(onApiReady);
    }
}

const onSendable = function(unused) {
    if (!ready) {
        ready = true;
        waiters.forEach(waiter => waiter());
        waiters = [];
    }
}

exports.Start = async function(connection) {
    Log('[Router-management module started]')
    mgmtSender = await amqp.OpenSender('Management', connection, '$management');
    onSendable();
}
