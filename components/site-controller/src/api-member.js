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

const formidable = require('formidable');
const Log        = require('./common/log.js').Log;
const util       = require('./common/util.js');
const kube       = require('./common/kube.js');

const API_PREFIX = '/api/v1alpha1/';

const createListener = async function(req, res) {
    res.status(400).send('Not Implemented');
}

const createConnector = async function(req, res) {
    res.status(400).send('Not Implemented');
}

const readListener = async function(res, lid) {
    res.status(400).send('Not Implemented');
}

const readConnector = async function(res, cid) {
    res.status(400).send('Not Implemented');
}

const readRoutingKey = async function(res, rkid) {
    res.status(400).send('Not Implemented');
}

const listListeners = async function(res) {
    res.status(400).send('Not Implemented');
}

const listConnectors = async function(res) {
    res.status(400).send('Not Implemented');
}

const listRoutingKeys = async function(res) {
    res.status(400).send('Not Implemented');
}

const deleteListener = async function(res, lid) {
    res.status(400).send('Not Implemented');
}

const deleteConnector = async function(res, cid) {
    res.status(400).send('Not Implemented');
}

const apiLog = function(req, status) {
    Log(`MemberAPI: ${req.ip} - (${status}) ${req.method} ${req.originalUrl}`);
}

exports.Initialize = async function(api) {
    Log('[API Member interface starting]');

    //========================================
    // Listeners
    //========================================

    // CREATE
    api.post(API_PREFIX + 'listeners', async (req, res) => {
        apiLog(req, await createListener(req, res));
    });

    // READ
    api.get(API_PREFIX + 'listener/:lid', async (req, res) => {
        apiLog(req, await readListener(res, req.params.lid));
    });

    // LIST
    api.get(API_PREFIX + 'listeners', async (req, res) => {
        apiLog(req, await listListeners(res));
    });

    // DELETE
    api.delete(API_PREFIX + 'listener/:lid', async (req, res) => {
        apiLog(req, await deleteListener(res, req.params.lid));
    });

    //========================================
    // Connectors
    //========================================

    // CREATE
    api.post(API_PREFIX + 'connectors', async (req, res) => {
        apiLog(req, await createConnector(req, res));
    });

    // READ
    api.get(API_PREFIX + 'connector/:cid', async (req, res) => {
        apiLog(req, await readConnector(res, req.params.cid));
    });

    // LIST
    api.get(API_PREFIX + 'connectors', async (req, res) => {
        apiLog(req, await listConnectors(res));
    });

    // DELETE
    api.delete(API_PREFIX + 'connector/:cid', async (req, res) => {
        apiLog(req, await deleteConnector(res, req.params.cid));
    });

    //========================================
    // Routing Keys
    //========================================

    // READ
    api.get(API_PREFIX + 'routingkey/:rkid', async (req, res) => {
        apiLog(req, await readRoutingKey(res, req.params.rkid));
    });

    // LIST
    api.get(API_PREFIX + 'routingkeys', async (req, res) => {
        apiLog(req, await listRoutingKeys(res));
    });

    //========================================
    // Components (for later)
    //========================================
}

exports.Start = async function() {
}