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

const Log    = require('./common/log.js').Log;
const router = require('./common/router.js');

const REQUEST_TIMEOUT_SECONDS = 3;
const HEARTBEAT_PERIOD_SECONDS = 10;
const site_id = process.env.SKUPPERX_SITE_ID || 'unknown';

const heartbeat = function() {
    router.ApiSend({
        op: 'HEARTBEAT',
        site: site_id,
    });
    setTimeout(heartbeat, HEARTBEAT_PERIOD_SECONDS * 1000);
}

exports.Start = async function () {
    Log('[API-Client module started]');
    router.NotifyMgmtReady(() => {
        try {
            heartbeat();
        } catch(err) {
            Log(`Exception in heartbeat processing: ${err.message} ${err.stack}`);
        }
    });
}
