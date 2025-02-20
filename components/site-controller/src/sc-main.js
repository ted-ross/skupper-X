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
const kube         = require('./common/kube.js');
const amqp         = require('./common/amqp.js');
const apiserver    = require('./sc-apiserver.js');
const syncKube     = require('./sync-site-kube.js');
const router       = require('./common/router.js');
const links        = require('./links.js');
const ingress      = require('./ingress.js');
const claim        = require('./claim.js');
const memberapi    = require('./api-member.js');
const Log          = require('./common/log.js').Log;
const Flush        = require('./common/log.js').Flush;
const pods         = require('./pod-connector.js');

const VERSION       = '0.1.2';
const STANDALONE    = (process.env.SKX_STANDALONE || 'NO') == 'YES';
const BACKBONE_MODE = (process.env.SKX_BACKBONE || 'NO') == 'YES';
var   site_id       = process.env.SKUPPERX_SITE_ID || 'unknown';

Log(`Skupper-X Site controller version ${VERSION}`);
Log(`Backbone   : ${BACKBONE_MODE}`);
Log(`Standalone : ${STANDALONE}`);

//
// This is the main program startup sequence.
//
exports.Main = async function() {
    try {
        await kube.Start(k8s, fs, yaml, !STANDALONE);
        await amqp.Start(rhea);

        //
        // Start the API server early so we don't cause readiness-probe problems.
        //
        await apiserver.Start(BACKBONE_MODE);

        if (!BACKBONE_MODE) {
            //
            // If we are in member mode, we must assert a claim (or use a previously accepted claim) to join an application network.
            // This function does not complete until after the claim has been asserted, accepted, and processed.  On subsequent
            // restarts of this controller after claim acceptance, the following function is effectively a no-op.
            //
            site_id = await claim.Start();
            await memberapi.Start();
        }

        Log(`Site-Id : ${site_id}`);
        let conn = amqp.OpenConnection('LocalRouter');
        await router.Start(conn);
        await links.Start(BACKBONE_MODE);
        if (BACKBONE_MODE) {
            await ingress.Start(site_id);
        }
        await syncKube.Start(site_id, conn, BACKBONE_MODE);
        await pods.Start();
        Log("[Site controller initialization completed successfully]");
    } catch (error) {
        Log(`Site controller initialization failed: ${error.message}`)
        Log(error.stack);
        Flush();
        process.exit(1);
    };
};
