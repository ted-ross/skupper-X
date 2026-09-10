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

import { Log } from "@vms/modules/log";
import {
    META_ANNOTATION_STATE_KEY,
    META_ANNOTATION_STATE_HASH,
    META_ANNOTATION_STATE_DIR,
    INJECT_TYPE_SITE,
    META_ANNOTATION_STATE_TYPE,
    STATE_TYPE_LINK,
    META_ANNOTATION_STATE_ID,
    CLAIM_ASSERT_ADDRESS,
} from "@vms/modules/common";
import { OpenReceiver, OpenSender } from "@vms/modules/amqp";
import { ClientFromPool } from "./db.js";
import { LoadSecret } from "@vms/modules/kube";
import { DispatchMessage, AssertClaimResponseSuccess, ReponseFailure } from "@vms/modules/protocol";
import { RegisterHandler } from "./backbone-links.js";
import { HashOfData, Secret } from "./resource-templates.js";
import { NotifyTransaction } from "./notify.js";
import { getTlsRotationMeta, overlayDualTrustCa } from "./tls-rotation.js";

const backbones = {}; // backboneId => {conn: AMQP-Connection, sender: anon-sender, receiver: claim-receiver}
const memberCompletions = {}; // memberId   => {handler: completion-function, result: undefined || {}, error: undefined || ERROR }

//
// This function completes the claim process after the member's certificate is created and ready.
// Completion creates the claim-query response based on facts discovered in the database regarding the member site.
//
const memberCompletion = async function (memberId) {
    // => [outgoingLinks, siteClient]
    let outgoingLinks;
    let siteClient;
    const client = await ClientFromPool("system");
    try {
        await client.query("BEGIN");
        //
        // Get the member-site record from the database
        //
        const result = await client.query(
            "SELECT Certificate, Invitation, TlsCertificates.ObjectName FROM MemberSites " +
                "JOIN TlsCertificates ON TlsCertificates.Id = Certificate " +
                "WHERE MemberSites.Id = $1",
            [memberId]
        );
        if (result.rowCount != 1) {
            throw new Error(`Could not find MemberSite with Id ${memberId}`);
        }
        const memberSite = result.rows[0];

        //
        // Get the member site's siteClient certificate
        //
        const secret = await LoadSecret(memberSite.objectname);
        const data = await overlayDualTrustCa(client, memberSite.certificate, secret.data);
        const tlsMeta = await getTlsRotationMeta(client, memberSite.certificate);
        siteClient = Secret(
            { ...secret, data },
            `vms-site-${memberId}`,
            INJECT_TYPE_SITE,
            `tls-site-${memberId}`,
            tlsMeta
        );

        //
        // Gather the edge-link information for the outgoingLinks
        //
        const linkResult = await client.query(
            "SELECT EdgeLinks.*, BackboneAccessPoints.Id as bbid, BackboneAccessPoints.Hostname, BackboneAccessPoints.Port FROM EdgeLinks " +
                "JOIN BackboneAccessPoints ON BackboneAccessPoints.Id = AccessPoint " +
                "WHERE EdgeToken = $1",
            [memberSite.invitation]
        );
        outgoingLinks = [];
        for (const link of linkResult.rows) {
            const linkObj = {
                apiVersion: "v1",
                kind: "ConfigMap",
                metadata: {
                    name: `vms-link-${link.id}`,
                    annotations: {
                        [META_ANNOTATION_STATE_TYPE]: STATE_TYPE_LINK,
                        [META_ANNOTATION_STATE_ID]: link.id,
                        [META_ANNOTATION_STATE_KEY]: `link-${link.id}`,
                        [META_ANNOTATION_STATE_DIR]: "remote",
                    },
                },
                data: {
                    host: link.hostname,
                    port: link.port,
                    cost: "1",
                },
            };
            linkObj.metadata.annotations[META_ANNOTATION_STATE_HASH] = HashOfData(linkObj.data);
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
};

const blockForCompletion = function (memberId) {
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
};

const processClaim = async function (claimId, name) {
    let statusCode = 200;
    let statusDescription = "OK";
    let outgoingLinks = null;
    let siteClient = null;
    let memberId;

    const client = await ClientFromPool("system");
    const notify = new NotifyTransaction();
    try {
        await client.query("BEGIN");
        const result = await client.query(
            "SELECT * FROM MemberInvitations WHERE Id = $1 and (JoinDeadline IS NULL OR JoinDeadline > now())",
            [claimId]
        );
        if (result.rowCount != 1) {
            throw new Error("No valid invitation exists for the claim");
        }

        //
        // Reject the claim if the instance limit has already been reached
        //
        const claim = result.rows[0];
        if (claim.instancelimit && claim.instancecount == claim.instancelimit) {
            throw new Error("Instance limit on this claim has been reached");
        }

        //
        // Increment the instance count for the invitation
        //
        await client.query("UPDATE MemberInvitations SET InstanceCount = $1 WHERE Id = $2", [
            claim.instancecount + 1,
            claimId,
        ]);
        notify.update("MemberInvitations", claimId);

        //
        // Create a new member from the invitation
        //
        const memberResult = await client.query(
            "INSERT INTO MemberSites (Name, MemberOf, Invitation, SiteClasses, Metadata) VALUES ($1, $2, $3, $4, $5) RETURNING Id",
            [name, claim.memberof, claim.id, claim.memberclasses, JSON.stringify({ name: name })]
        );
        memberId = memberResult.rows[0].id;
        notify.add("MemberSites", memberId);

        //
        // Set up the completion handler for this memberId (before the COMMIT!)
        //
        memberCompletions[memberId] = {
            result: undefined,
            error: undefined,
            callback: undefined,
        };
        await client.query("COMMIT");
        await notify.commit();
    } catch (error) {
        await client.query("ROLLBACK");
        Log(
            `INFO:ClaimServer - Exception in claim processing for claim ${claimId}: ${error.message}`
        );
        statusCode = 400;
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
};

//=========================================================================================================================
// Messaging Handlers
//=========================================================================================================================
const onSendable = function (_backboneId) {
    //
    // This function intentionally left blank
    //
};

const onMessage = function (backboneId, _application_properties, body, onReply) {
    try {
        DispatchMessage(
            body,
            async (_site, _hashset, _address) => {
                // onHeartbeat
            },
            async (_site, _objectname) => {
                // onGet
            },
            async (claimId, name) => {
                // onClaim
                Log(
                    `INFO:ClaimServer - Received claim for invitation ${claimId} via backbone ${backboneId}`
                );
                const [statusCode, statusDescription, memberId, outgoingLinks, siteClient] =
                    await processClaim(claimId, name);
                if (statusCode == 200) {
                    onReply({}, AssertClaimResponseSuccess(memberId, outgoingLinks, siteClient));
                } else {
                    onReply({}, ReponseFailure(statusCode, statusDescription));
                }
            }
        );
    } catch (error) {
        Log(`ERROR:ClaimServer - Exception in onMessage: ${error.message}`);
    }
};

//=========================================================================================================================
// Backbone Link Handlers
//=========================================================================================================================
const onLinkAdded = async function (backboneId, conn) {
    if (backbones[backboneId]) {
        Log(`WARNING:ClaimServer - Received duplicate onLinkAdded for backbone ${backboneId}`);
    } else {
        backbones[backboneId] = {
            conn: conn,
            receiver: OpenReceiver(conn, CLAIM_ASSERT_ADDRESS, onMessage, backboneId),
            sender: OpenSender(
                `ClaimServerAnon for backbone ${backboneId}`,
                conn,
                undefined,
                onSendable,
                backboneId
            ),
        };
    }
};

const onLinkDeleted = async function (backboneId) {
    if (backbones[backboneId]) {
        delete backbones[backboneId];
    } else {
        Log(
            `WARNING:ClaimServer - Received spurious onLinkDeleted for non-existent backbone ${backboneId}`
        );
    }
};

//=========================================================================================================================
// API Functions
//=========================================================================================================================

//
// This function is called by the certificate generation process after a new member's certificates have been completed.
//
export async function CompleteMember(memberId) {
    if (memberCompletions[memberId]) {
        const [result, error] = await memberCompletion(memberId);

        // BEGIN Critical Section
        memberCompletions[memberId].result = result;
        memberCompletions[memberId].error = error;
        if (memberCompletions[memberId].callback) {
            memberCompletions[memberId].callback();
        }
        // END Critical Section
    } else {
        Log(`ERROR:ClaimServer - Member completion received for an unknown memberId ${memberId}`);
    }
}

export async function Start() {
    Log("[Claim-Server module starting]");
    await RegisterHandler(onLinkAdded, onLinkDeleted, false, true);
}

/** @internal Exported for unit tests */
export function _registerMemberCompletionForTest(memberId, { callback } = {}) {
    memberCompletions[memberId] = {
        result: undefined,
        error: undefined,
        callback,
    };
    return memberCompletions[memberId];
}
