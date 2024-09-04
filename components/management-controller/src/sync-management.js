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
// This module is the state-sync endpoint for the management controller.
//
// The responsibility of this module is to track connected sites and synchronize their state to and from
// the database.
//

const Log       = require('./common/log.js').Log;
const common    = require('./common/common.js');
const util      = require('./common/util.js');
const db        = require('./db.js');
const kube      = require('./common/kube.js');
const sync      = require('./common/state-sync.js');
const bbLinks   = require('./backbone-links.js');
const templates = require('./site-templates.js');
const crypto    = require('crypto');

var peers = {};  // {peerId: {pClass: <>, stuff}}


exports.GetBackboneLinks_TX = async function(client, siteId) {
    const result = await client.query(
        'SELECT InterRouterLinks.Id, InterRouterLinks.Cost, BackboneAccessPoints.Hostname, BackboneAccessPoints.Port FROM InterRouterLinks ' +
        'JOIN BackboneAccessPoints ON BackboneAccessPoints.Id = InterRouterLinks.AccessPoint ' +
        'WHERE ConnectingInteriorSite = $1', [siteId]);
    let links = {};
    for (const link of result.rows) {
        if (link.hostname) {
            links[link.id] = {
                host: link.hostname,
                port: link.port,
                cost: link.cost.toString(),
            };
        }
    }
    return links;
}

exports.GetBackboneAccessPoints_TX = async function(client, siteId, initialOnly = false) {
    let data = {};
    const result = await client.query(
        'SELECT Id, Kind, BindHost FROM BackboneAccessPoints WHERE InteriorSite = $1', [siteId]);
    for (const ap of result.rows) {
        if (!initialOnly || (ap.kind == 'manage' || ap.kind == 'peer')) {
            data[ap.id] = {
                kind : ap.kind,
            };
            if (ap.bindhost) {
                data[ap.id].bindhost = ap.bindhost;
            }
        }
    }
    return data;
}

//=========================================================================================================================
// Backbone Site Handlers
//=========================================================================================================================
const onNewBackboneSite = async function(peerId) {
    //
    // peerId identifies the row in InteriorSites
    //
    // Local state:
    //   - tls-site-<id>   - The client certificate/ca for the backbone router            [ id => Site ]
    //   - tls-server-<id> - Certificates/CAs for the backbone's access points            [ id => AccessPoint ]
    //   - access-<id>     - Access point {kind: <>, bindHost: <>, tls: <server-tls-id>}  [ id => AccessPoint ]
    //   - link-<id>       - Link {host: <>, port: <>, cost: <>}                          [ id => InterRouterLink ]
    //
    // Remote state:
    //   - accessstatus-<id> - Host/Port for an access point  {host: <>, port: <>}
    //
    var localState  = {};
    var remoteState = {};
    const client    = await db.ClientFromPool();
    try {
        await client.query("BEGIN");

        //
        // Query for the site's client certificate
        //
        const siteResult = await client.query("SELECT Lifecycle, FirstActiveTime, Certificate, TlsCertificates.ObjectName FROM InteriorSites " +
                                              "JOIN TlsCertificates ON TlsCertificates.Id = InteriorSites.Certificate " +
                                              "WHERE InteriorSites.Id = $1", [peerId]);
        if (siteResult.rowCount != 1) {
            throw Error(`InteriorSite not found using id ${peerId}`);
        }
        const site = siteResult.rows[0];
        const secret = await kube.LoadSecret(site.objectname);
        localState[`tls-site-${peerId}`] = templates.HashOfSecret(secret);

        //
        // Find all of the access points associated with this backbone site.
        // If the access point is 'ready', include its certificate and include remote state for its host/port.
        //
        const accessResult = await client.query("SELECT Id, Lifecycle, Certificate, Kind, BindHost, Hostname, Port FROM BackboneAccessPoints WHERE InteriorSite = $1", [peerId]);
        for (const accessPoint of accessResult.rows) {
            let apData = {
                kind : accessPoint.kind,
            };
            if (accessPoint.bindhost) {
                apData.bindhost = accessPoint.bindhost;
            }
            if (accessPoint.lifecycle == 'ready') {
                const tlsResult = await client.query("SELECT ObjectName FROM TlsCertificates WHERE Id = $1", [accessPoint.certificate]);
                if (tlsResult.rowCount != 1) {
                    throw Error(`Access point in ready state does not have a TlsCertificate - ${accessPoint.id}`);
                }
                const secret = await kube.LoadSecret(tlsResult.rows[0].objectname);
                localState[`tls-server-${accessPoint.id}`] = templates.HashOfSecret(secret);
                remoteState[`accessstatus-${accessPoint.id}`] = templates.HashOfData({
                    host : accessPoint.hostname,
                    port : accessPoint.port,
                });
            }
            localState[`access-${accessPoint.id}`] = templates.HashOfData(apData);
        }

        //
        // Find the links from this backbone site.
        //
        const linkResult = await client.query("SELECT InterRouterLinks.Id, Cost, BackboneAccessPoints.Lifecycle, BackboneAccessPoints.Hostname, BackboneAccessPoints.Port FROM InterRouterLinks " +
                                              "JOIN BackboneAccessPoints ON BackboneAccessPoints.Id = AccessPoint " +
                                              "WHERE ConnectingInteriorSite = $1 AND Lifecycle = 'ready'", [peerId]);
        for (const link of linkResult.rows) {
            localState[`link-${link.id}`] = templates.HashOfData({
                host : link.hostname,
                port : link.port,
                cost : link.cost,
            });
        }

        //
        // Update the timestamps and lifecycle on the interior site
        //
        if (site.lifecycle == 'ready') {
            await client.query("UPDATE InteriorSites SET FirstActiveTime = CURRENT_TIMESTAMP, LastHeartbeat = CURRENT_TIMESTAMP, LifeCycle = 'active' WHERE Id = $1", [peerId]);
        } else {
            await client.query("UPDATE InteriorSites SET LastHeartbeat = CURRENT_TIMESTAMP WHERE Id = $1", [peerId]);
        }

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`Exception in onNewBackboneSite processing: ${error.message}`);
        Log(error.stack);
    } finally {
        client.release();
    }
    return [localState, remoteState];
}

const onLostBackbone = async function(peerId) {
    // Nothing to do here - Consider adding status to the schema to indicate a stale site
}

const onStateChangeBackbone = async function(peerId, stateKey, hash, data) {
    //
    // Notes:
    //   This will update the access point with host/port on initial site creation.
    //   If there is any subsequent change to the host/port configuration, this will not respond in any way.
    //   TODO - Consider going back to partial state on deletion and re-issuing the TLS cert on update.
    //     Delete => delete TLS certificate, nullify host/port, lifecycle := partial
    //     Update => delete TLS certificate, update host/port, lifecycle := new
    //
    if (stateKey.substring(0, 13) == 'accessstatus-') {
        const accessId = stateKey.substring(13);
        const client = await db.ClientFromPool();
        try {
            await client.query("BEGIN");
            await client.query("UPDATE BackboneAccessPoints SET Hostname = $1, Port = $2, Lifecycle = 'new' " +
                               "WHERE Id = $3 AND Lifecycle = 'partial' AND InteriorSite = $4", [data.host, data.port, accessId, peerId]);
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            Log(`Exception in onStateChangeBackbone processing: ${error.message}`);
            Log(error.stack);
        } finally {
            client.release();
        }
    } else {
        Log(`Unexpected state-key ${stateKey} in onStateChangeBackbone`);
    }
}

const getStateTlsSite = async function(siteId) {
    var hash = null;
    var data = null;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT TlsCertificates.ObjectName FROM InteriorSites " +
                                          "JOIN TlsCertificates ON TlsCertificates.Id = Certificate " +
                                          "WHERE InteriorSites.Id = $1", [siteId]);
        if (result.rowCount == 1) {
            const secret = await kube.LoadSecret(result.rows[0].objectname);
            hash = templates.HashOfSecret(secret);
            data = secret.data;
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`Exception in getStateTlsSite processing: ${error.message}`);
        Log(error.stack);
    } finally {
        client.release();
    }
    return [hash, data];
}

const getStateTlsServer = async function(apid) {
    var hash = null;
    var data = null;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT TlsCertificates.ObjectName FROM BackboneAccessPoints " +
                                          "JOIN TlsCertificates ON TlsCertificates.Id = Certificate " + 
                                          "WHERE BackboneAccessPoints.Id = $1", [apid]);
        if (result.rowCount == 1) {
            const secret = await kube.LoadSecret(result.rows[0].objectname);
            hash = templates.HashOfSecret(secret);
            data = secret.data;
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`Exception in getStateTls processing: ${error.message}`);
        Log(error.stack);
    } finally {
        client.release();
    }
    return [hash, data];
}

const getStateAccessPoint = async function(apId) {
    var hash = null;
    var data = null;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT Kind, Bindhost FROM BackboneAccessPoints WHERE Id = $1", [apId]);
        if (result.rowCount == 1) {
            const accessPoint = result.rows[0];
            data = {
                kind : accessPoint.kind,
            };
            if (accessPoint.bindhost) {
                data.bindhost = accessPoint.bindhost;
            }
            hash = templates.HashOfData(data);
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`Exception in getStateTls processing: ${error.message}`);
        Log(error.stack);
    } finally {
        client.release();
    }
    return [hash, data];
}

const getStateLink = async function(linkId) {
    var hash = null;
    var data = null;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT Cost, BackboneAccessPoints.Hostname, BackboneAccessPoints.Port FROM InterRouterLinks " +
                                          "JOIN BackboneAccessPoints ON BackboneAccessPoint.Id = AccessPoint " +
                                          "WHERE InterRouterLinks.Id = $1 AND Lifecycle = 'ready'", [linkId]);
        if (result.rowCount == 1) {
            const link = result.rows[0];
            data = {
                host : link.hostname,
                port : link.port,
                cost : link.cost,
            };
            hash = templates.HashOfData(data);
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`Exception in getStateTls processing: ${error.message}`);
        Log(error.stack);
    } finally {
        client.release();
    }
    return [hash, data];
}

const onStateRequestBackbone = async function(peerId, stateKey) { // => [hash, data]
    var hash = null;
    var data = null;

    if (stateKey.substring(0, 9) == 'tls-site-') {
        [hash, data] = await getStateTlsSite(stateKey.substring(9));
    } else if (stateKey.substring(0, 11) == 'tls-server-') {
        [hash, data] = await getStateTlsServer(stateKey.substring(11));
    } else if (stateKey.substring(0, 7) == 'access-') {
        [hash, data] = await getStateAccessPoint(stateKey.substring(7));
    } else if (stateKey.substring(0, 5) == 'link-') {
        [hash, data] = await getStateLink(stateKey.substring(5));
    } else {
        Log(`Invalid stateKey for onStateRequestBackbone processing: ${stateKey}`);
    }

    return [hash, data];
}

const onPingBackbone = async function(peerId) {
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        await client.query("UPDATE InteriorSite SET LastHeartbeat = CURRENT_TIMESTAMP WHERE Id = $1", [peerId]);
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`Exception in onPingBackbone processing: ${error.message}`);
        Log(error.stack);
    } finally {
        client.release();
    }
}

//=========================================================================================================================
// Member Site Handlers
//=========================================================================================================================
const onNewMember = async function(peerId) {
    //
    // peerId identifies the row in MemberSites
    //
    // Local state:
    //   - tls-site-<id> - The client certificate/ca for the member router
    //   - link-<id>     - Link (host: <>, port: <>)
    //
    // Remote state:
    //   - infostatus  - Information map from the member site (label, location, contactInfo, verifiedParticipantEmail, etc.)
    //
    var localState  = {};
    var remoteState = {};
    const client    = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        // TODO
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`Exception in onNewMember processing: ${error.message}`);
        Log(error.stack);
    } finally {
        client.release();
    }
    return [localState, remoteState];
}

const onLostMember = async function(peerId) {
    // TODO
}

const onStateChangeMember = async function(peerId, stateKey, hash, data) {
    // TODO
}

const onStateRequestMember = async function(peerId, stateKey) {
    // TODO
}

const onPingMember = async function(peerId) {
    // TODO
}

//=========================================================================================================================
// Sync Handlers
//=========================================================================================================================
const onNewPeer = async function(peerId, peerClass) {
    var localState;
    var remoteState;
    peers[peerId] = {
        pClass : peerClass,
    }

    if (peerClass == sync.CLASS_MEMBER) {
        [localState, remoteState] = await onNewMember(peerId);
    } else if (peerClass == sync.CLASS_BACKBONE) {
        [localState, remoteState] = await onNewBackboneSite(peerId);
    }

    return [localState, remoteState];
}

const onPeerLost = async function(peerId) {
    const peer = peers[peerId];
    if (!!peer) {
        if (peer.pClass == sync.CLASS_MEMBER) {
            await onLostMember(peerId);
        } else if (peer.pClass == sync.CLASS_BACKBONE) {
            await onLostBackbone(peerId);
        }

        delete peers[peerId];
    }
}

const onStateChange = async function(peerId, stateKey, hash, data) {
    const peer = peers[peerId];
    if (!!peer) {
        if (peer.pClass == sync.CLASS_MEMBER) {
            await onStateChangeMember(peerId, stateKey, hash, data);
        } else if (peer.pClass == sync.CLASS_BACKBONE) {
            await onStateChangeBackbone(peerId, stateKey, hash, data);
        }
    }
}

const onStateRequest = async function(peerId, stateKey) {
    var hash = null;
    var data = null;
    const peer = peers[peerId];
    if (!!peer) {
        if (peer.pClass == sync.CLASS_MEMBER) {
            [hash, data] = await onStateRequestMember(peerId, stateKey);
        } else if (peer.pClass == sync.CLASS_BACKBONE) {
            [hash, data] = await onStateRequestBackbone(peerId, stateKey);
        }
    }
    return [hash, data];
}

const onPing = async function(peerId) {
    const peer = peers[peerId];
    if (!!peer) {
        if (peer.pClass == sync.CLASS_MEMBER) {
            await onPingMember(peerId);
        } else if (peer.pClass == sync.CLASS_BACKBONE) {
            await onPingBackbone(peerId);
        }
    }
}

//=========================================================================================================================
// Backbone Link Handlers
//=========================================================================================================================
const onLinkAdded = async function(backboneId, conn) {
    await sync.AddConnection(backboneId, conn);
}

const onLinkDeleted = async function(backboneId) {
    await sync.DeleteConnection(backboneId);
}

//=========================================================================================================================
// Database change notifications that affect local state
//=========================================================================================================================
exports.SiteCertificateChanged = async function(certId) {
    //
    // Update the tls-site-<id> hash for the one affected site
    //
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT InteriorSites.Id, TlsCertificates.ObjectName FROM InteriorSites " +
                                          "JOIN TlsCertificates ON TlsCertificates.Id = InteriorSites.Certificate " +
                                          "WHERE Certificate = $1", [certId]);
        if (result.rowCount == 1) {
            const site = result.rows[0];
            if (peers[site.id]) {
                const secret = await kube.LoadSecret(site.objectname);
                const hash = templates.HashOfSecret(secret);
                await sync.UpdateLocalState(site.id, `tls-site-${site.id}`, hash);
            }
        }
        await client.query("COMMIT");
    } catch (error) {
        Log(`Exception in SiteCertificateChanged: ${error.message}`);
        await client.query("ROLLBACK");
    } finally {
        client.release();
    }
}

exports.AccessCertificateChanged = async function(certId) {
    //
    // Update the tls-server-<id> hashes for the one affected site
    //
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT BackboneAccessPoints.Id as apid, InteriorSites.Id, TlsCertificates.ObjectName FROM BackboneAccessPoints " +
                                          "JOIN InteriorSites ON InteriorSites.id = InteriorSite " +
                                          "JOIN TlsCertificates ON TlsCertificates.Id = BackboneAccessPoints.Certificate " +
                                          "WHERE BackboneAccessPoints.Certificate = $1", [certId]);
        if (result.rowCount == 1) {
            const row = result.rows[0];
            if (peers[row.id]) {
                const secret = await kube.LoadSecret(row.objectname);
                const hash = templates.HashOfSecret(secret);
                await sync.UpdateLocalState(row.id, `tls-server-${row.apid}`, hash);
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

exports.SiteIngressChanged = async function(siteId, accessPointId) {
    //
    // Update the access-<id> hash for the one affected site
    //
    if (peers[siteId]) {
        const client = await db.ClientFromPool();
        try {
            await client.query("BEGIN");
            const result = await client.query("SELECT Kind, BindHost, Certificate, Lifecycle FROM BackboneAccessPoints WHERE Id = $1", [accessPointId]);
            if (result.rowCount == 1) {
                const row = result.rows[0];
                var ap = {kind : row.kind};
                if (row.bindhost) {
                    ap.bindhost = row.bindhost;
                }
                const hash = templates.HashOfData(ap);
                await sync.UpdateLocalState(siteId, `access-${accessPointId}`, hash);
            }
            await client.query("COMMIT");
        } catch (error) {
            Log(`Exception in SiteIngressChanged: ${error.message}`);
            await client.query("ROLLBACK");
        } finally {
            client.release();
        }
    }
}

exports.LinkChanged = async function(connectingSiteId, linkId) {
    //
    // Update the link-<id> hash for the one affected connecting site
    //
    if (peers[connectingSiteId]) {
        try {
            let hash = null;
            await client.query("BEGIN");
            const result = await client.query("SELECT Cost, BackboneAccessPoints.Hostname, BackboneAccessPoints.Port FROM InterRouterLinks " +
                                              "JOIN BackboneAccessPoints ON BackboneAccessPoints.Id = AccessPoint " +
                                              "WHERE Id = $1", [linkId]);
            if (result.rowCount == 1) {
                const row = result.rows[0];
                var link = {
                    host : row.hostname,
                    port : row.port,
                    cost : row.cost,
                };
                hash = templates.HashOfData(link);
            }
            await sync.UpdateLocalState(connectingSiteId, `link-${linkId}`, hash);
            await client.query("COMMIT");
        } catch (error) {
            Log(`Exception in SiteIngressChanged: ${error.message}`);
            await client.query("ROLLBACK");
        } finally {
            client.release();
        }
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

exports.Start = async function() {
    await sync.Start(sync.CLASS_MANAGEMENT, 'mc', common.API_CONTROLLER_ADDRESS, onNewPeer, onPeerLost, onStateChange, onStateRequest, onPing);
    await bbLinks.RegisterHandler(onLinkAdded, onLinkDeleted);
}
