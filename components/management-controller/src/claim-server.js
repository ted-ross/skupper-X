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
// This module is responsible for handling claim-assertion requests from potential member sites connected to backbones.
//

const Log        = require('./common/log.js').Log;
const common     = require('./common/common.js');
const util       = require('./common/util.js');
const amqp       = require('./common/amqp.js');
const db         = require('./db.js');
const kube       = require('./common/kube.js');
const protocol   = require('./common/protocol.js');
const bbLinks    = require('./backbone-links.js');
const templates  = require('./site-templates.js');

var backbones         = {};   // backboneId => {conn: AMQP-Connection, sender: anon-sender, receiver: claim-receiver}
var memberCompletions = {};   // memberId   => {handler: completion-function, result: undefined || {}, error: undefined || ERROR }

//
// This function completes the claim process after the member's certificate is created and ready.
// Completion creates the claim-query response based on facts discovered in the database regarding the member site.
//
const memberCompletion = async function(memberId) { // => [outgoingLinks, siteClient]
    var outgoingLinks;
    var siteClient;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        //
        // Get the member-site record from the database
        //
        const result = await client.query("SELECT Certificate, Invitation, TlsCertificates.ObjectName FROM MemberSites " +
                                          "JOIN TlsCertificates ON TlsCertificates.Id = Certificate " +
                                          "WHERE MemberSites.Id = $1", [memberId]);
        if (result.rowCount != 1) {
            throw(Error(`Could not find MemberSite with Id ${memberId}`));
        }
        const memberSite = result.rows[0];

        //
        // Get the member site's siteClient certificate
        //
        const secret = await kube.LoadSecret(memberSite.objectname);
        siteClient = {
            apiVersion : 'v1',
            kind       : 'Secret',
            data       : secret.data,
            metadata   : {
                name        : `skx-site-${memberId}`,
                annotations : {
                    [common.META_ANNOTATION_STATE_KEY]  : `tls-site-${memberId}`,
                    [common.META_ANNOTATION_STATE_HASH] : templates.HashOfData(secret.data),
                    [common.META_ANNOTATION_STATE_DIR]  : 'remote',
                    [common.META_ANNOTATION_TLS_INJECT] : common.INJECT_TYPE_SITE,
                },
            },
        };

        //
        // Gather the edge-link information for the outgoingLinks
        //
        const linkResult = await client.query("SELECT EdgeLinks.*, BackboneAccessPoints.Id as bbid, BackboneAccessPoints.Hostname, BackboneAccessPoints.Port FROM EdgeLinks " + 
                                              "JOIN BackboneAccessPoints ON BackboneAccessPoints.Id = AccessPoint " + 
                                              "WHERE EdgeToken = $1", [memberSite.invitation]);
        outgoingLinks = [];
        for (const link of linkResult.rows) {
            let linkObj = {
                apiVersion : 'v1',
                kind       : 'ConfigMap',
                metadata : {
                    name : `skx-link-${link.id}`,
                    annotations: {
                        [common.META_ANNOTATION_STATE_TYPE] : common.STATE_TYPE_LINK,
                        [common.META_ANNOTATION_STATE_ID]   : link.id,
                        [common.META_ANNOTATION_STATE_KEY]  : `link-${link.id}`,
                        [common.META_ANNOTATION_STATE_DIR]  : 'remote',
                    },
                },
                data : {
                    host : link.hostname,
                    port : link.port,
                    cost : '1',
                },
            };
            linkObj.metadata.annotations[common.META_ANNOTATION_STATE_HASH] = templates.HashOfData(linkObj.data);
            outgoingLinks.push(linkObj);
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`Exception caught in memberCompletion: ${error.message}`);
        Log(error.stack);
        return [undefined, error];
    } finally {
        client.release();
    }

    return [[outgoingLinks, siteClient], undefined];
}


const blockForCompletion = function(memberId) {
    return new Promise((resolve, reject) => {
        // BEGIN Critical Section
        memberCompletions[memberId].callback = () => {
            const completion = memberCompletions[memberId];
            delete memberCompletions[memberId];
            if (completion.result) {
                resolve(completion.result);
            } else if (completion.error) {
                reject(completion.error);
            } else {
                reject(new Error(`ERROR:ClaimServer - Spurious callback for memberId ${memberId}`));
            }
        };
        if (memberCompletions[memberId].result || memberCompletions[memberId].error) {
            // END Critical Section
            memberCompletions[memberId].callback();
        }
    });
}


const processClaim = async function(claimId, name) {
    var statusCode        = 200;
    var statusDescription = 'OK';
    var outgoingLinks     = null;
    var siteClient        = null;
    var memberId;

    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT * FROM MemberInvitations WHERE Id = $1 and (JoinDeadline IS NULL OR JoinDeadline > now())", [claimId]);
        if (result.rowCount != 1) {
            throw(Error("No valid invitation exists for the claim"));
        }

        //
        // Reject the claim if the instance limit has already been reached
        //
        const claim = result.rows[0];
        if (claim.instancelimit && claim.instancecount == claim.instancelimit) {
            throw(Error("Instance limit on this claim has been reached"));
        }

        //
        // Increment the instance count for the invitation
        //
        await client.query("UPDATE MemberInvitations SET InstanceCount = $1 WHERE Id = $2", [claim.instancecount + 1, claimId]);

        //
        // Create a new member from the invitation
        //
        const memberResult = await client.query("INSERT INTO MemberSites (Name, MemberOf, Invitation, SiteClasses, Metadata) VALUES ($1, $2, $3, $4, $5) RETURNING Id",
                                                [name, claim.memberof, claim.id, claim.memberclasses, JSON.stringify({name: name})]);
        memberId = memberResult.rows[0].id;

        //
        // Set up the completion handler for this memberId (before the COMMIT!)
        //
        memberCompletions[memberId] = {
            result   : undefined,
            error    : undefined,
            callback : undefined,
        };
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`INFO:ClaimServer - Exception in claim processing for claim ${claimId}: ${error.message}`);
        statusCode        = 400;
        statusDescription = `Claim rejected: ${error.message}`;
    } finally {
        client.release();
    }

    if (statusCode == 200) {
        try {
            [outgoingLinks, siteClient] = await blockForCompletion(memberId);
        } catch (error) {
            Log(`Exception in claim processing, memberCompetion: ${error.message}`);
            Log(error.stack);
            statusCode = 500;
            statusDescription = error.message;
        }
    }

    return [statusCode, statusDescription, memberId, outgoingLinks, siteClient];
}

//=========================================================================================================================
// Messaging Handlers
//=========================================================================================================================
const onSendable = function(backboneId) {
    //
    // This function intentionally left blank
    //
}

const onMessage = function(backboneId, application_properties, body, onReply) {
    try {
        protocol.DispatchMessage(body,
            async (site, hashset, address) => { // onHeartbeat
            },
            async (site, objectname) => {       // onGet
            },
            async (claimId, name) => {          // onClaim
                Log(`INFO:ClaimServer - Received claim for invitation ${claimId} via backbone ${backboneId}`);
                let [statusCode, statusDescription, memberId, outgoingLinks, siteClient] = await processClaim(claimId, name);
                if (statusCode == 200) {
                    onReply({}, protocol.AssertClaimResponseSuccess(memberId, outgoingLinks, siteClient));
                } else {
                    onReply({}, protocol.ReponseFailure(statusCode, statusDescription));
                }
            }
        );
    } catch (error) {
        Log(`ERROR:ClaimServer - Exception in onMessage: ${error.message}`);
    }
}

//=========================================================================================================================
// Backbone Link Handlers
//=========================================================================================================================
const onLinkAdded = async function(backboneId, conn) {
    if (backbones[backboneId]) {
        Log(`WARNING:ClaimServer - Received duplicate onLinkAdded for backbone ${backboneId}`);
    } else {
        backbones[backboneId] = {
            conn     : conn,
            receiver : amqp.OpenReceiver(conn, common.CLAIM_ASSERT_ADDRESS, onMessage, backboneId),
            sender   : amqp.OpenSender(`ClaimServerAnon for backbone ${backboneId}`, conn, undefined, onSendable, backboneId),
        }
    }
}

const onLinkDeleted = async function(backboneId) {
    if (backbones[backboneId]) {
        delete backbones[backboneId];
    } else {
        Log(`WARNING:ClaimServer - Received spurious onLinkDeleted for non-existent backbone ${backboneId}`);
    }
}

//=========================================================================================================================
// API Functions
//=========================================================================================================================

//
// This function is called by the certificate generation process after a new member's certificates have been completed.
//
exports.CompleteMember = async function(memberId) {
    if (memberCompletions[memberId]) {
        const [result, error] = await memberCompletion(memberId);

        // BEGIN Critical Section
        memberCompletions[memberId].result = result;
        memberCompletions[memberId].error  = error;
        if (memberCompletions[memberId].callback) {
            memberCompletions[memberId].callback();
        }
        // END Critical Section
    } else {
        Log(`ERROR:ClaimServer - Member completion received for an unknown memberId ${memberId}`);
    }
}

exports.Start = async function() {
    Log('[Claim-Server module starting]');
    await bbLinks.RegisterHandler(onLinkAdded, onLinkDeleted, false, true);
}
