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

const router      = require('./router.js');
const certs       = require('./certs.js');
const prune       = require('./prune.js');
const db          = require('./db.js');
const kube        = require('./kube.js');
const config      = require('./config.js');
const apiserver   = require('./mc-apiserver.js');
const axios       = require('axios');
const fs          = require('fs');
const Log         = require('./common/log.js').Log;
const Flush       = require('./common/log.js').Flush;

const VERSION     = '0.1.1';
const STANDALONE  = (process.env.SKX_STANDALONE || 'NO') == 'YES';

Log(`Skupper-X Management controller version ${VERSION}`);
Log(`Standalone : ${STANDALONE}`);

//
// This is the main program startup sequence.
//
exports.Main = async function() {
    try {
        await kube.Start(!STANDALONE);
        await db.Start();
        await config.Start();
        await prune.Start();
        await certs.Start();
        await apiserver.Start();
        Log("[Management controller initialization completed successfully]");
    } catch (reason) {
        Log(`Management controller initialization failed: ${reason.stack}`)
        Flush();
        process.exit(1);
    };
};

