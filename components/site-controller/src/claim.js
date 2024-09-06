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
const common   = require('./common/common.js');

const CLAIM_CONFIG_MAP_NAME         = 'skupperx-claim';
const LINK_CONFIG_MAP_NAME          = 'skupperx-links-outgoing';
const CLAIM_SECRET_NAME             = 'skupperx-claim';
const CLAIM_CONTROLLER_ADDRESS      = 'skx/claim';
const CLAIM_REQUEST_TIMEOUT_SECONDS = 30;

var claimState = {
    interactive : true,
    status      : 'awaiting-name',  // processing, joined, failed
    namePrefix  : '',
    siteName    : null,
    failure     : null,
};


const startClaim = async function(configMap, secret) {
    claimState.status = 'processing';

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
    var claimId    = configMap.data.claimId;
    var host       = configMap.data.host;
    var port       = configMap.data.port;
    
    claimState.namePrefix = configMap.data.namePrefix || '';

    //
    // Open the AMQP connection and sender for claim-assertion
    //
    Log(`Asserting claim ${claimId} via amqps://${host}:${port}`);
    let claimConnection = amqp.OpenConnection('Claim', host, port, 'tls', tls_ca, tls_cert, tls_key);
    let claimSender     = await amqp.OpenSender('Claim', claimConnection, CLAIM_CONTROLLER_ADDRESS);

    //
    // Send the claim-assert request to the management controller
    //
    const [ap, response] = await amqp.Request(claimSender, protocol.AssertClaim(claimId, claimState.siteName), {}, CLAIM_REQUEST_TIMEOUT_SECONDS);
    if (response.statusCode != 200) {
        throw(Error(`Claim Rejected: ${response.statusCode} - ${response.statusDescription}`));
    }
    Log('Claim accepted');
    claimState.status = 'joined';

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
    var linkConfigMapPresent = false;
    var claimSecret;

    try {
        claimConfigMap = await kube.LoadConfigmap(CLAIM_CONFIG_MAP_NAME);
        claimState.interactive = claimConfigMap.data.interactive == 'true';
    } catch (error) {}

    try {
        const configMaps = await kube.GetConfigmaps();
        for (const configMap of configMaps) {
            if (kube.Controlled(configMap) && kube.Annotation(common.META_ANNOTATION_STATE_TYPE) == common.STATE_TYPE_LINK) {
                linkConfigMapPresent = true;
                break;
            }
        }
    } catch (error) {}

    try {
        claimSecret = await kube.LoadSecret(CLAIM_SECRET_NAME);
    } catch (error) {}

    try {
        if (linkConfigMapPresent) {
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
            claimState.status = 'joined';
        } else if (claimConfigMap) {
            //
            // If there is no link config-map but there is a claim config-map, we may begin the claim process.
            //
            if (claimState.interactive && claimState.siteName) {
                await startClaim(claimConfigMap, claimSecret);
            } else {
                Log('Claim is interactive - Awaiting API intervention');
            }
        } else {
            //
            // If neither config-map is present, check again after a delay.
            //
            throw(Error(`Expect one of these configMaps: ${CLAIM_CONFIG_MAP_NAME}, ${LINK_CONFIG_MAP_NAME}`));
        }
    } catch (error) {
        Log(`Claim-state check failed: ${error.message}`);
        claimState.status  = 'failed';
        claimState.failure = error.message;
        throw(error);
    }
}

exports.GetClaimState = function () {
    return claimState;
}

exports.StartClaim = async function (name) {
    if (claimState.status == 'awaiting-name') {
        claimState.siteName = claimState.namePrefix + name;
        await checkClaimState();
    }
}

exports.Start = async function () {
    Log('[Claim module started]')
    await checkClaimState();
}