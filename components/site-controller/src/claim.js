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

//
// This module is responsible for asserting a member-claim (invitation) with the management controller.
// If the claim is accepted, this module transitions the site from a claim to a full-member status.
//

const Log      = require('./common/log.js').Log;
const kube     = require('./common/kube.js');
const amqp     = require('./common/amqp.js');
const protocol = require('./common/protocol.js');

const CLAIM_CONFIG_MAP_NAME         = 'skupperx-claim';
const LINK_CONFIG_MAP_NAME          = 'skupperx-links-outgoing';
const CLAIM_SECRET_NAME             = 'skupperx-claim';
const CLAIM_CONTROLLER_ADDRESS      = 'skx/claim';
const CLAIM_REQUEST_TIMEOUT_SECONDS = 30;


const startClaim = async function(configMap, secret) {
    //
    // Extract the needed certificates and keys from the secret
    //
    var tls_ca;
    var tls_cert;
    var tls_key;
    for (const [key, value] of Object.entries(secret.data)) {
        if (key == 'ca.crt') {
            tls_ca = Buffer.from(value, 'base64');
        } else if (key == 'tls.crt') {
            tls_cert = Buffer.from(value, 'base64');
        } else if (key == 'tls.key') {
            tls_key = Buffer.from(value, 'base64');
        }
    }

    //
    // Extract the connection host and port from the config-map
    //
    var connInfo;
    var claimId;
    for (const [key, value] of Object.entries(configMap.data)) {
        claimId  = key;
        connInfo = JSON.parse(value);
        break;
    }

    //
    // Open the AMQP connection and sender for claim-assertion
    //
    Log(`Asserting claim via amqps://${connInfo.host}:${connInfo.port}`);
    let claimConnection = amqp.OpenConnection('Claim', connInfo.host, connInfo.port, 'tls', tls_ca, tls_cert, tls_key);
    let claimSender     = await amqp.OpenSender('Claim', claimConnection, CLAIM_CONTROLLER_ADDRESS);

    //
    // Send the claim-assert request to the management controller
    //
    const [ap, response] = await amqp.Request(claimSender, protocol.AssertClaim(claimId, "TODO-name-me"), {}, CLAIM_REQUEST_TIMEOUT_SECONDS);
    if (response.statusCode != 200) {
        throw(Error(`Claim Rejected: ${response.statusCode} - ${response.statusDescription}`));
    }
    Log('Claim accepted');

    //
    // Create the objects needed to establish member connectivity
    //
    await kube.ApplyObject(response.siteClient);
    await kube.ApplyObject(response.outgoingLinks);

    //
    // Delete the claim objects
    //
    await kube.DeleteSecret(CLAIM_SECRET_NAME);
    await kube.DeleteConfigmap(CLAIM_CONFIG_MAP_NAME);

    //
    // Disconnect the claim connection
    //
    amqp.CloseConnection(claimConnection);
}

const checkClaimState = async function() {
    var claimConfigMap;
    var linkConfigMap;
    var claimSecret;

    try {
        claimConfigMap = await kube.LoadConfigmap(CLAIM_CONFIG_MAP_NAME);
    } catch (error) {}

    try {
        linkConfigMap = await kube.LoadConfigmap(LINK_CONFIG_MAP_NAME);
    } catch (error) {}

    try {
        claimSecret = await kube.LoadSecret(CLAIM_SECRET_NAME);
    } catch (error) {}

    try {
        if (linkConfigMap) {
            //
            // If we have a link config-map, the claim process has already been completed.
            // Remove leftover claim objects (config-map and secret) if they're still here.
            //
            if (claimConfigMap) {
                await kube.DeleteConfigmap(CLAIM_CONFIG_MAP_NAME);
            }

            if (claimSecret) {
                await kube.DeleteSecret(CLAIM_SECRET_NAME);
            }

            Log('Claim already processed in an earlier run');
        } else if (claimConfigMap) {
            //
            // If there is no link config-map but there is a claim config-map, we may begin the claim process.
            //
            await startClaim(claimConfigMap, claimSecret);
        } else {
            //
            // If neither config-map is present, check again after a delay.
            //
            throw(Error(`Expect one of these configMaps: ${CLAIM_CONFIG_MAP_NAME}, ${LINK_CONFIG_MAP_NAME}`));
        }
    } catch (error) {
        Log(`Claim-state check failed: ${error.message}`);
        throw(error);
    }
}

exports.Start = async function () {
    Log('[Claim module started]')
    await checkClaimState();
}