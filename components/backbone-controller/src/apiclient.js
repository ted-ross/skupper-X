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

const REQUEST_TIMEOUT_SECONDS   = 10;
const HEARTBEAT_PERIOD_SECONDS  = 15;
const HASH_QUERY_PERIOD_SECONDS = 600;

const site_id = process.env.SKUPPERX_SITE_ID || 'unknown';
var   configurationHash = "";

const manageHeartbeat = function() {
    router.ApiSend({
        op: 'BB_HEARTBEAT',
        site: site_id,
    });
    setTimeout(manageHeartbeat, HEARTBEAT_PERIOD_SECONDS * 1000);
}

const syncConfiguration = async function() {
}

const doHashQuery = async function() {
    const request = {
        op: 'BB_QUERY_HASH',
        site: site_id,
    };
    try {
        let response = await router.ApiRequest(request, REQUEST_TIMEOUT_SECONDS);
        if (response.hash != configurationHash) {
            configurationHash = response.hash;
            await syncConfiguration();
        }
    } catch(error) {
        Log(`Exception in processing of configuration hash request/response: ${error.stack}`);
    }
}

const manageHashPoll = function() {
    doHashQuery();
    setTimeout(manageHashPoll, HASH_QUERY_PERIOD_SECONDS);
}

exports.Start = async function () {
    Log('[API-Client module started]');
    router.NotifyApiReady(() => {
        try {
            manageHeartbeat();
            manageHashPoll();
        } catch(err) {
            Log(`Exception in heartbeat processing: ${err.message} ${err.stack}`);
        }
    });
}
