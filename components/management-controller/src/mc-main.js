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

const k8s          = require('@kubernetes/client-node');
const yaml         = require('yaml');
const fs           = require('fs');
const rhea         = require('rhea');
const bbLinks      = require('./backbone-links.js');
const externalVans = require('./external-vans.js');
const certs        = require('./certs.js');
const prune        = require('./prune.js');
const db           = require('./db.js');
const kube         = require('./common/kube.js');
const config       = require('./config.js');
const apiserver    = require('./mc-apiserver.js');
const sync         = require('./sync-management.js');
const amqp         = require('./common/amqp.js');
const claims       = require('./claim-server.js');
const compose      = require('./compose.js');
const Log          = require('./common/log.js').Log;
const Flush        = require('./common/log.js').Flush;

const VERSION        = '0.1.3';
const STANDALONE_NS  = process.env.SKX_STANDALONE_NAMESPACE;
const CONTROLLER     = process.env.SKX_CONTROLLER_NAME || process.env.HOSTNAME || 'main-controller';

Log(`Skupper-X Management controller version ${VERSION}`);
if (STANDALONE_NS) {
    Log('Running in Standalone mode (outside a kubernetes cluster)');
}

//
// This is the main program startup sequence.
//
exports.Main = async function() {
    try {
        await kube.Start(k8s, fs, yaml, STANDALONE_NS);
        await db.Start();
        await config.Start();
        await prune.Start();
        await certs.Start();
        await amqp.Start(rhea);
        await apiserver.Start();
        await bbLinks.Start(CONTROLLER);
        await externalVans.Start();
        await sync.Start();
        await claims.Start();
        await compose.Start();
        Log("[Management controller initialization completed successfully]");
    } catch (reason) {
        Log(`Management controller initialization failed: ${reason.stack}`)
        Flush();
        process.exit(1);
    };
};

