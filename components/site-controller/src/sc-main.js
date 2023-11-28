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

const k8s         = require('@kubernetes/client-node');
const yaml        = require('yaml');
const fs          = require('fs');
const router      = require('./router.js');
const kube        = require('./common/kube.js');
const apiserver   = require('./sc-apiserver.js');
const Log         = require('./common/log.js').Log;
const Flush       = require('./common/log.js').Flush;

const VERSION     = '0.1.1';
const STANDALONE  = (process.env.SKX_STANDALONE || 'NO') == 'YES';

Log(`Skupper-X Site controller version ${VERSION}`);
Log(`Standalone : ${STANDALONE}`);

//
// This is the main program startup sequence.
//
exports.Main = async function() {
    try {
        await kube.Start(k8s, fs, yaml, !STANDALONE);
        await apiserver.Start();
        Log("[Site controller initialization completed successfully]");
    } catch (reason) {
        Log(`Site controller initialization failed: ${reason.stack}`)
        Flush();
        process.exit(1);
    };
};

