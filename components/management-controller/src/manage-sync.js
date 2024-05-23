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

//
// This module is deprecated and will be removed
//

"use strict";

const Log        = require('./common/log.js').Log;
const amqp       = require('./common/amqp.js');
const db         = require('./db.js');
const kube       = require('./common/kube.js');
const protocol   = require('./common/protocol.js');
const api        = require('./mc-apiserver.js');
const bbLinks    = require('./backbone-links.js');
const deployment = require('./site-deployment-state.js');
const crypto     = require('crypto');

const API_CONTROLLER_ADDRESS   = 'skx/sync/mgmtcontroller';
const CLAIM_CONTROLLER_ADDRESS = 'skx/claim';

const REQUEST_TIMEOUT_SECONDS   = 10;
const HEARTBEAT_PERIOD_SECONDS  = 60;
const HEARTBEAT_INITIAL_SECONDS = 2;
const HEARTBEAT_WINDOW_SECONDS  = 5;

const siteIngressKeys = {
    'ingress/manage' : 0,
    'ingress/peer'   : 1,
    'ingress/claim'  : 2,
    'ingress/member' : 3,
};

const backboneHashKeys = {
    'tls/site-client'   : 0,
    'tls/manage-server' : 1,
    'tls/peer-server'   : 2,
    'tls/claim-server'  : 3,
    'tls/member-server' : 4,
    'links/incoming'    : 5,
    'links/outgoing'    : 6,
};

var activeBackboneSites = {};   // { siteId: { heartbeatTimer: <>, lastPingTime: <>, address: <>, bbHashSet: [], siteHashSet: [] } }
var openLinks = {};             // { backboneId: { conn, apiSender, apiReceiver } }
var memberCompletions = {};     // { memberId: completion-function }

const timerDelayMsec = function(floor) {
    return (Math.floor(Math.random() * (HEARTBEAT_WINDOW_SECONDS + 1) + floor)) * 1000;
}

const sendHeartbeat = function(siteId) {
    let site = activeBackboneSites[siteId];
    let link = openLinks[site.backboneId];
    try {
        if (link) {
            let hashSet = {};

            for (const [key, index] of Object.entries(backboneHashKeys)) {
                hashSet[key] = site.bbHashSet[index];
            }

            amqp.SendMessage(link.apiSender, protocol.Heartbeat('manage', hashSet), {}, site.address);
        }

        site.heartbeatTimer = setTimeout(sendHeartbeat, timerDelayMsec(HEARTBEAT_PERIOD_SECONDS), siteId);
    } catch (error) {
        Log(`Exception during heartbeat send: ${error.message}`);
    }
}

const activateBackboneSite = async function(backboneId, siteId) {
    //
    // If this is the first heartbeat we've received from a site, create a new active-backbone object.
    //
    if (!activeBackboneSites[siteId]) {
        Log(`New active backbone site: ${siteId}`);
        activeBackboneSites[siteId] = {
            backboneId     : backboneId,
            heartbeatTimer : null,
            lastPingTime   : null,
            address        : null,
            bbHashSet      : [null, null, null, null, null, null, null],
            siteHashSet    : [null, null, null, null],
        };

        //
        // The backbone hash-set for this site needs to be initialized before heartbeats are sent.
        //
        for (const [key, index] of Object.entries(backboneHashKeys)) {
            var hash;
            var unused;
            [hash, unused] = await getObject(siteId, key);
            activeBackboneSites[siteId].bbHashSet[index] = hash;
        }

        //
        // Schedule the initial heartbeat
        //
        activeBackboneSites[siteId].heartbeatTimer = setTimeout(sendHeartbeat, HEARTBEAT_INITIAL_SECONDS * 1000, siteId);
    }
}

const checkSiteHashset = async function(backboneId, siteId, hashSet, address) {
    await activateBackboneSite(backboneId, siteId);
    let backboneSite = activeBackboneSites[siteId];
    backboneSite.lastPingTime = Date.now();
    backboneSite.address      = address;
    let updateKeys = [];
    let deleteKeys = [];
    for (const [key, hash] of Object.entries(hashSet)) {
        let index = siteIngressKeys[key];
        if (hash != backboneSite.siteHashSet[index]) {
            if (hash == null) {
                deleteKeys.push(key);
            } else {
                updateKeys.push(key);
            }
        }
    }

    for (const key of deleteKeys) {
        // TODO - figure this out
        Log(`Reconcile: Site ${siteId} - Delete key ${key} [no action taken]`);
    }

    for (const key of updateKeys) {
        try {
            let index = siteIngressKeys[key];
            let apiSender = openLinks[backboneId].apiSender;
            const [responseAp, responseBody] = await amqp.Request(apiSender, protocol.GetObject('manage', key), {}, REQUEST_TIMEOUT_SECONDS, backboneSite.address);
            if (responseBody.statusCode == 200) {
                if (responseBody.objectName == key) {
                    Log(`Reconcile: Site ${siteId} - Update key ${key}`);
                    await api.AddHostToAccessPoint(siteId, key, responseBody.data.host, responseBody.data.port);
                    backboneSite.siteHashSet[index] = responseBody.hash;
                } else {
                    Log(`Get response object name mismatch: Got ${responseBody.objectName}, expected ${key}`);
                }
            } else {
                Log(`Get request failure for ${key}: ${responseBody.statusDescription}`);
            }
        } catch (error) {
            Log(`Exception in checkSiteHashset processing for object ${key}: ${error.message}`);
        }
    }

    const client = await db.ClientFromPool();
    let notify = false;
    try {
        let notify_on_commit = false;
        await client.query("BEGIN");
        const result = await client.query("SELECT Lifecycle FROM InteriorSites WHERE Id = $1", [siteId]);
        if (result.rowCount == 1) {
            const row = result.rows[0];
            if (row.lifecycle == 'ready') {
                await client.query("UPDATE InteriorSites SET Lifecycle = 'active', FirstActiveTime = CURRENT_TIMESTAMP WHERE Id = $1", [siteId]);
                notify_on_commit = true;
            }
            await client.query("UPDATE InteriorSites SET LastHeartbeat = CURRENT_TIMESTAMP WHERE Id = $1", [siteId]);
            await client.query("COMMIT");
            notify = notify_on_commit;
        }
    } catch (error) {
        Log(`Exception in heartbeat update: ${error.message}`);
        await client.query("ROLLBACK");
    } finally {
        client.release();
    }

    if (notify) {
        await deployment.SiteLifecycleChanged(siteId, 'active');
    }
}

exports.HashOfSecret = function(secret) {
    let text = '';
    for (const [key, value] of Object.entries(secret.data)) {
        text += key + value;
    }
    return crypto.createHash('sha1').update(text).digest('hex');
}

const dataOfSecret = function(secret, hash) {
    let data = {};
    data.metadata = {
        name : secret.metadata.name,
        annotations : {},
    };
    data.data = secret.data;
    data.type = secret.type;
    for (const [key, value] of Object.entries(secret.metadata.annotations)) {
        const fields = key.split('/');
        if (fields.length > 0 && fields[0] == 'skupper.io') {
            data.metadata.annotations[key] = value;
        }
    }
    data.metadata.annotations['skupper.io/skx-hash'] = hash;
    return data;
}

exports.HashOfConfigMap = function(cm) {
    let text = '';
    for (const [key, value] of Object.entries(cm.data)) {
        text += key + value;
    }
    return crypto.createHash('sha1').update(text).digest('hex');
}

const getSiteClient = async function(siteId) {
    //
    // Return the client secret for the site
    //
    var data = {};
    var hash = null;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            'SELECT InteriorSites.Certificate, TlsCertificates.ObjectName as secret_name FROM InteriorSites ' +
            'JOIN TlsCertificates ON InteriorSites.Certificate = TlsCertificates.Id WHERE Interiorsites.Id = $1', [siteId]);
        if (result.rowCount == 1) {
            let secret = await kube.LoadSecret(result.rows[0].secret_name);
            hash = exports.HashOfSecret(secret);
            data = dataOfSecret(secret, hash);
        }
        await client.query('COMMIT');
    } catch (error) {
        Log(`Exception in getSiteClient: ${error.message}`);
        await client.query('ROLLBACK');
    } finally {
        client.release();
    }

    return [hash, data];
}

const getAccessCert = async function(siteId, kind) {
    var data = {};
    var hash = null;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            'SELECT * FROM InteriorSites WHERE Id = $1', [siteId]);
        if (result.rowCount == 1) {
            let site = result.rows[0];
            let apRef = null;
            switch (kind) {
            case 'manage' : apRef = site.manageaccess; break;
            case 'peer'   : apRef = site.peeraccess;   break;
            case 'member' : apRef = site.memberaccess; break;
            case 'claim'  : apRef = site.claimaccess;  break;
            default:
                throw(Error(`getAccessCert: unknown kind ${kind}`));
            }

            if (apRef) {
                const apResult = await client.query('SELECT *, TlsCertificates.ObjectName FROM BackboneAccessPoints JOIN TlsCertificates ON TlsCertificates.Id = Certificate WHERE BackboneAccessPoints.Id = $1', [apRef]);
                if (apResult.rowCount == 1) {
                    let ap = apResult.rows[0];
                    let secret = await kube.LoadSecret(ap.objectname);
                    hash = exports.HashOfSecret(secret);
                    data = dataOfSecret(secret, hash);
                }
            }
        } else {
            throw Error('Site not found');
        }
        await client.query('COMMIT');
    } catch (error) {
        Log(`Exception in getAccessCert: ${error.message}`);
        await client.query('ROLLBACK');
    } finally {
        client.release();
    }

    return [hash, data];
}

//
// Ingress config-map:  { access-point-id : JSON( { kind : [manage,peer,member,claim], bindhost : <bind-host-string> } )}
//
exports.GetBackboneIngresses_TX = async function(client, siteId, initialOnly = false) {
    let data = {};
    const result = await client.query(
        'SELECT Id, Kind, BindHost FROM BackboneAccessPoints WHERE InteriorSite = $1', [siteId]);
    for (const ap of result.rows) {
        if (!initialOnly || (ap.kind == 'manage' || ap.kind == 'peer')) {
            data[ap.id] = JSON.stringify({
                kind     : ap.kind,
                bindhost : ap.bindhost ? ap.bindhost : "",
            });
        }
    }
    return data;
}

const getLinksIncoming = async function(siteId) {
    var configMap = {
        metadata : {
            annotations: {},
        },
        data : {},
    };
    var hash = null;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        configMap.data = await exports.GetBackboneIngresses_TX(client, siteId);
        hash = exports.HashOfConfigMap(configMap);
        configMap.metadata.annotations['skupper.io/skx-hash'] = hash;
        await client.query('COMMIT');
    } catch (error) {
        Log(`Exception in getLinksIncoming: ${error.message}`);
        await client.query('ROLLBACK');
    } finally {
        client.release();
    }

    return [hash, configMap];
}

exports.GetBackboneConnectors_TX = async function (client, siteId) {
    const result = await client.query(
        'SELECT *, BackboneAccessPoints.Hostname, BackboneAccessPoints.Port FROM InterRouterLinks ' +
        'JOIN BackboneAccessPoints ON BackboneAccessPoints.Id = InterRouterLinks.AccessPoint ' +
        'WHERE ConnectingInteriorSite = $1', [siteId]);
    let outgoing = {};
    for (const connection of result.rows) {
        if (connection.hostname) {
            outgoing[connection.listeninginteriorsite] = JSON.stringify({
                host: connection.hostname,
                port: connection.port,
                cost: connection.cost.toString(),
            });
        }
    }
    return outgoing;
}

const getLinksOutgoing = async function(siteId) {
    let configMap = {
        metadata : {
            annotations: {},
        },
        data : {},
    };
    let hash = null;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        configMap.data = await exports.GetBackboneConnectors_TX(client, siteId);
        hash = exports.HashOfConfigMap(configMap);
        configMap.metadata.annotations['skupper.io/skx-hash'] = hash;
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
    } finally {
        client.release();
    }

    return [hash, configMap];
}

const getObject = async function(siteId, objectname) {
    //
    // Return [hash, data] where 'data' is a kube-style object with metadata and [data,spec]
    //
    switch (objectname) {
    case 'tls/site-client'   : return await getSiteClient(siteId);
    case 'tls/manage-server' : return await getAccessCert(siteId, 'manage');
    case 'tls/peer-server'   : return await getAccessCert(siteId, 'peer');
    case 'tls/claim-server'  : return await getAccessCert(siteId, 'claim');
    case 'tls/member-server' : return await getAccessCert(siteId, 'member');
    case 'links/incoming'    : return await getLinksIncoming(siteId);
    case 'links/outgoing'    : return await getLinksOutgoing(siteId);
    default:
        throw (Error(`getObject: Unknown object name ${objectname}`));
    } 
}

const memberCompletion = function(memberId) { // => [outgoingLinks, siteClient]
    return new Promise((resolve, reject) => {
        memberCompletions[memberId] = async () => {
            var outgoingLinks;
            var siteClient;
            const client = await db.ClientFromPool();
            try {
                await client.query("BEGIN");
                //
                // Get the member-site record from the database
                //
                const result = await client.query("SELECT Certificate, Invitation, TlsCertificates.ObjectName FROM MemberSites "+
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
                const secretHash = exports.HashOfSecret(secret);
                siteClient = dataOfSecret(secret, secretHash);
                siteClient.apiVersion    = 'v1';
                siteClient.kind          = 'Secret';
                siteClient.metadata.name = 'skupperx-site-client';
                siteClient.metadata.annotations['skupper.io/skx-inject'] = 'site-client';

                //
                // Gather the edge-link information for the outgoingLinks
                //
                const linkResult = await client.query("SELECT EdgeLinks.*, BackboneAccessPoints.Id as bbid, BackboneAccessPoints.Hostname, BackboneAccessPoints.Port FROM EdgeLinks " + 
                                                      "JOIN BackboneAccessPoints ON BackboneAccessPoints.Id = AccessPoint " + 
                                                      "WHERE EdgeToken = $1", [memberSite.invitation]);
                outgoingLinks = {
                    apiVersion : 'v1',
                    kind : 'ConfigMap',
                    metadata : {
                        name : 'skupperx-links-outgoing',
                        annotations: {},
                    },
                    data : {},
                };
                for (const link of linkResult.rows) {
                    outgoingLinks.data[link.bbid] = JSON.stringify({
                        host     : link.hostname,
                        port     : link.port,
                        cost     : 1,
                        priority : link.priority,
                    });
                }
                const lrHash = exports.HashOfConfigMap(outgoingLinks);
                outgoingLinks.metadata.annotations['skupper.io/skx-hash'] = lrHash;

                await client.query("COMMIT");
            } catch (error) {
                await client.query("ROLLBACK");
                Log(`Exception caught in memberCompletion: ${error.message}`);
                Log(error.stack);
                reject(error);
            } finally {
                client.release();
            }

            resolve([outgoingLinks, siteClient]);
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
        const memberResult = await client.query("INSERT INTO MemberSites (Name, MemberOf, Invitation, SiteClass) VALUES ($1, $2, $3, $4) RETURNING Id",
                                                [name, claim.memberof, claim.id, claim.memberclass]);
        memberId = memberResult.rows[0].id;
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`Exception in claim processing: ${error.message}`);
        statusCode        = 400;
        statusDescription = `Claim rejected: ${error.message}`;
    } finally {
        client.release();
    }

    if (statusCode == 200) {
        try {
            [outgoingLinks, siteClient] = await memberCompletion(memberId);
        } catch (error) {
            Log(`Exception in claim processing, memberCompetion: ${error.message}`);
            Log(error.stack);
            statusCode = 500;
            statusDescription = error.message;
        }
    }

    return [statusCode, statusDescription, outgoingLinks, siteClient];
}

const onSendable = function(unused) {
    // This function intentionally left blank
}

const onMessageSite = async function(backboneId, application_properties, body, onReply) {
    try {
        protocol.DispatchMessage(body,
            async (site, hashset, address) => { // onHeartbeat
                await checkSiteHashset(backboneId, site, hashset, address);
            },
            (site) => {                         // onSolicit
                let backbone = activeBackboneSites[site];
                clearTimeout(backbone.heartbeatTimer);
                sendHeartbeat(site);
            },
            async (site, objectname) => {       // onGet
                Log(`Reconcile: Received GET request from ${site} for object ${objectname}`);
                let [hash, data] = await getObject(site, objectname);
                onReply({}, protocol.GetObjectResponseSuccess(objectname, hash, data));
                activeBackboneSites[site].bbHashSet[objectname] = hash;
            },
            async (claimId, name) => {          // onClaim
            }
        );
    } catch (error) {
        Log(`Exception in onMessage: ${error.message}`);
    }
}

const onMessageClaim = async function(backboneId, application_properties, body, onReply) {
    try {
        protocol.DispatchMessage(body,
            async (site, hashset, address) => { // onHeartbeat
            },
            (site) => {                         // onSolicit
            },
            async (site, objectname) => {       // onGet
            },
            async (claimId, name) => {          // onClaim
                Log(`Received claim for invitation ${claimId}`);
                let [statusCode, statusDescription, outgoingLinks, siteClient] = await processClaim(claimId, name);
                if (statusCode == 200) {
                    onReply({}, protocol.AssertClaimResponseSuccess(outgoingLinks, siteClient));
                } else {
                    onReply({}, protocol.ReponseFailure(statusCode, statusDescription));
                }
            }
        );
    } catch (error) {
        Log(`Exception in onMessage: ${error.message}`);
    }
}

const onLinkAdded = async function(backboneId, conn) {
    let link = {
        conn          : conn,
        apiSender     : amqp.OpenSender('AnonymousSender', conn, undefined, onSendable),
        apiReceiver   : amqp.OpenReceiver(conn, API_CONTROLLER_ADDRESS, onMessageSite, backboneId),
        claimReceiver : amqp.OpenReceiver(conn, CLAIM_CONTROLLER_ADDRESS, onMessageClaim, backboneId),
    };
    link.apiReceiver.backboneId = backboneId;
    openLinks[backboneId] = link;
}

const onLinkDeleted = async function(backboneId) {
    delete openLinks[backboneId];
}

const accelerateSiteHeartbeat = function(siteId) {
    var site = activeBackboneSites[siteId];
    clearTimeout(site.heartbeatTimer);
    site.heartbeatTimer = setTimeout(sendHeartbeat, timerDelayMsec(0), siteId);
}

//================================================================================
// Database change notifications that affect the hash-sets for sites
//================================================================================
exports.SiteCertificateChanged = async function(certId) {
    //
    // Update the tls/site-client hash for the one affected site
    //
    const client = await db.ClientFromPool();
    try {
        const result = await client.query("SELECT Id FROM InteriorSites WHERE Certificate = $1", [certId]);
        if (result.rowCount == 1) {
            const siteId = result.rows[0].id;
            if (activeBackboneSites[siteId]) {
                const [hash, data] = await getSiteClient(siteId);
                activeBackboneSites[siteId].bbHashSet[backboneHashKeys['tls/site-client']] = hash;
                accelerateSiteHeartbeat(siteId);
            }
        }
    } catch (error) {
        Log(`Exception in SiteCertificateChanged: ${error.message}`);
    } finally {
        client.release();
    }
}

exports.AccessCertificateChanged = async function(certId) {
    //
    // Update the tls/*-server hashes for the one affected site
    //
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const accessResult = await client.query("SELECT Id FROM BackboneAccessPoints WHERE Certificate = $1", [certId]);
        if (accessResult.rowCount == 1) {
            const accessId = accessResult.rows[0].id;
            const siteResult = await client.query("SELECT Id FROM InteriorSites WHERE ClaimAccess = $1 OR PeerAccess = $1 OR MemberAccess = $1 OR ManageAccess = $1", [accessId]);
            if (siteResult.rowCount == 1) {
                const siteId = siteResult.rows[0].id;
                if (activeBackboneSites[siteId]) {
                    for (const ingress of ['claim', 'peer', 'member', 'manage']) {
                        const [hash, data] = await getAccessCert(siteId, ingress);
                        activeBackboneSites[siteId].bbHashSet[backboneHashKeys[`tls/${ingress}-server`]] = hash;
                    }
                    accelerateSiteHeartbeat(siteId);
                }
            }
        }
        await client.query("COMMIT");
    } catch (error) {
        Log(`Exception in AccessCertificateChanged: ${error.message}`);
        await client.query("ROLLBACK");
    } finally {
        client.release();
    }
}

exports.SiteIngressChanged = async function(siteId) {
    //
    // Update the links/incoming hash for the one affected site
    //
    if (activeBackboneSites[siteId]) {
        const [hash, data] = await getLinksIncoming(siteId);
        activeBackboneSites[siteId].bbHashSet[backboneHashKeys['links/incoming']] = hash;
        accelerateSiteHeartbeat(siteId);
    }
}

exports.LinkChanged = async function(connectingSiteId) {
    //
    // Update the links/outgoing hash for the one affected connecting site
    //
    if (activeBackboneSites[connectingSiteId]) {
        const [hash, data] = await getLinksOutgoing(connectingSiteId);
        activeBackboneSites[connectingSiteId].bbHashSet[backboneHashKeys['links/outgoing']] = hash;
        accelerateSiteHeartbeat(connectingSiteId);
    }
}

exports.NewIngressAvailable = async function(siteId) {
    //
    // Update the links/outgoing hash for each site that connects to the indicated site
    //
    const client = await db.ClientFromPool();
    try {
        const result = await client.query("SELECT ConnectingInteriorSite FROM InterRouterLinks WHERE ListeningInteriorSite = $1", [siteId]);
        for (const row of result.rows) {
            const connectingSiteId = row.id;
            if (activeBackboneSites[connectingSiteId]) {
                const [hash, data] = await getLinksOutgoing(connectingSiteId);
                activeBackboneSites[connectingSiteId].bbHashSet[backboneHashKeys['links/outgoing']] = hash;
                accelerateSiteHeartbeat(connectingSiteId);
            }
        }
    } catch (error) {
        Log(`Exception in NewIngressAvailable: ${error.message}`);
    } finally {
        client.release();
    }
}

exports.CompleteMember = async function(memberId) {
    const handler = memberCompletions[memberId];
    if (handler) {
        delete memberCompletions[memberId];
        await handler();
    }
}

//================================================================================
// Startup Function
//================================================================================
exports.Start = async function () {
    Log('[Manage-Sync module started]');
    await bbLinks.RegisterHandler(onLinkAdded, onLinkDeleted);
}
