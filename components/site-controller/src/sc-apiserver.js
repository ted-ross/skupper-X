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

const express  = require('express');
const yaml     = require('js-yaml');
const ingress  = require('./ingress.js');
const kube     = require('./common/kube.js');
const Log      = require('./common/log.js').Log;

const API_PREFIX = '/api/v1alpha1/';
const API_PORT   = 8086;
api = express();

app.use(cors());

const get_hostnames = function(res) {
    let ingress_bundle = ingress.GetIngressBundle();
    if (ingress_bundle.ready) {
        res.send(JSON.stringify(ingress_bundle));
        res.status(200).end();
    } else {
        res.send('Ingress content is not yet available');
        res.status(204).end();
    }
}

exports.Start = async function() {
    Log('[API Server module started]');

    api.get('/healthz', (req, res) => {
        res.send('OK');
        res.status(200).end();
    });

    api.get(API_PREFIX + 'hostnames', (req, res) => {
        Log(`API: Hostname request from ${req.ip}`);
        get_hostnames(res);
    });

    let server = api.listen(API_PORT, () => {
        let host = server.address().address;
        let port = server.address().port;
        if (host[0] == ':') {
            host = '[' + host + ']';
        }
        Log(`API Server listening on http://${host}:${port}`);
    });
}