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
const express    = require('express');
const cors       = require('cors');
const yaml       = require('js-yaml');
const ingress    = require('./ingress.js');
const claim      = require('./claim.js');
const kube       = require('./common/kube.js');
const util       = require('./common/util.js');
const Log        = require('./common/log.js').Log;
const memberapi  = require('./api-member.js');

const API_PREFIX = '/api/v1alpha1/';
const API_PORT   = 8086;
var api;

const getHostnames = function(res) {
    let ingress_bundle = ingress.GetIngressBundle();
    res.status(200).json(ingress_bundle);
    return 200;
}

const getSiteStatus = function(res) {
    const claimState = claim.GetClaimState();
    res.status(200).json(claimState);
    return 200;
}

const startClaim = async function(req, res) {
    var returnStatus;
    const form = new formidable.IncomingForm();
    try {
        const [fields, files] = await form.parse(req);
        const norm = util.ValidateAndNormalizeFields(fields, {
            'name' : {type: 'string', optional: false},
        });

        await claim.StartClaim(norm.name);
        returnStatus = 201;
        res.status(returnStatus).json({ name : norm.name });
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).json({ message : error.message });
    }

    return returnStatus;
}

const apiLog = function(req, status) {
    Log(`SiteAPI: ${req.ip} - (${status}) ${req.method} ${req.originalUrl}`);
}

exports.Start = async function(backboneMode) {
    Log('[API Server module started]');
    api = express();
    api.use(cors());

    api.get('/healthz', (req, res) => {
        res.send('OK');
        res.status(200).end();
    });

    if (backboneMode) {
        api.get(API_PREFIX + 'hostnames', (req, res) => {
            apiLog(req, getHostnames(res));
        });
    } else {
        api.get(API_PREFIX + 'site/status', (req, res) => {
            apiLog(req, getSiteStatus(res));
        });

        api.put(API_PREFIX + 'site/start', async (req, res) => {
            apiLog(req, await startClaim(req, res));
        });
    }

    memberapi.Initialize(api);

    let server = api.listen(API_PORT, () => {
        let host = server.address().address;
        let port = server.address().port;
        if (host[0] == ':') {
            host = '[' + host + ']';
        }
        Log(`API Server listening on http://${host}:${port}`);
    });
}