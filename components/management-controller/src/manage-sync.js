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

const Log       = require('./common/log.js').Log;
const amqp      = require('./common/amqp.js');
const db        = require('./db.js');
const kube      = require('./common/kube.js');
const protocol  = require('./common/protocol.js');
const api       = require('./mc-apiserver.js');
const bbLinks   = require('./backbone-links.js');
const crypto    = require('crypto');

const API_CONTROLLER_ADDRESS = 'skx/sync/mgmtcontroller';
const API_MY_ADDRESS_PREFIX  = 'skx/sync/site/';

const REQUEST_TIMEOUT_SECONDS   = 10;
const HEARTBEAT_PERIOD_SECONDS  = 60;
const HEARTBEAT_INITIAL_SECONDS = 2;

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

var activeBackboneSites = {};   // { siteId: { heartbeatTimer: <>, lastPingTime, bbHashSet: [], siteHashSet: [] } }
var openLinks = {};             // { backboneId: { conn, apiSender, apiReceiver } }

const sendHeartbeat = function(siteId) {
    let site = activeBackboneSites[siteId];
    let link = openLinks[site.backboneId];
    try {
        if (link) {
            let hashSet = {};

            for (const [key, index] of Object.entries(backboneHashKeys)) {
                hashSet[key] = site.bbHashSet[index];
            }

            amqp.SendMessage(link.apiSender, protocol.Heartbeat('manage', hashSet), {}, API_MY_ADDRESS_PREFIX + siteId);
        }

        site.heartbeatTimer = setTimeout(() => {
            sendHeartbeat(siteId);
        }, HEARTBEAT_PERIOD_SECONDS * 1000);
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
        activeBackboneSites[siteId].heartbeatTimer = setTimeout(() => { sendHeartbeat(siteId); }, HEARTBEAT_INITIAL_SECONDS * 1000)
    }
}

const checkSiteHashset = async function(backboneId, siteId, hashSet) {
    await activateBackboneSite(backboneId, siteId);
    let backbone = activeBackboneSites[siteId];
    backbone.lastPingTime = Date.now();
    let updateKeys = [];
    let deleteKeys = [];
    for (const [key, hash] of Object.entries(hashSet)) {
        let index = siteIngressKeys[key];
        if (hash != backbone.siteHashSet[index]) {
            if (hash == null) {
                deleteKeys.push(key);
            } else {
                updateKeys.push(key);
            }
        }
    }

    for (const key of deleteKeys) {
        // TODO - figure this out
    }

    Log('checkSiteHashset');
    for (const key of updateKeys) {
        Log(`    key: ${key}`);
        try {
            let index = siteIngressKeys[key];
            let apiSender = openLinks[backboneId].apiSender;
            Log('    sending request...');
            const [responseAp, responseBody] = await amqp.Request(apiSender, protocol.GetObject('manage', key), {}, REQUEST_TIMEOUT_SECONDS, API_MY_ADDRESS_PREFIX + siteId);
            Log(`    response code ${responseBody.statusCode}`);
            if (responseBody.statusCode == 200) {
                if (responseBody.objectName == key) {
                    await api.AddHostToAccessPoint(siteId, key, responseBody.data.host, responseBody.data.port);
                    backbone.siteHashSet[index] = responseBody.hash;
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
}

const hashOfSecret = function(secret) {
    let text = '';
    for (const [key, value] of Object.entries(secret.data)) {
        text += key + value;
    }
    return crypto.createHash('sha1').update(text).digest('hex');
}

const dataOfSecret = function(secret, hash) {
    let data = {};
    data.metadata = secret.metadata;
    data.data     = secret.data;
    if (!data.metadata.annotations) {
        data.metadata.annotations = {};
    }
    data.metadata.annotations['skupperx/skx-hash'] = hash;
    return data;
}

const hashOfConfigMap = function(cm) {
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
            hash = hashOfSecret(secret);
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
                    hash = hashOfSecret(secret);
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

exports.GetBackboneIngresses_TX = async function(client, siteId) {
    let data = {};
    const result = await client.query(
        'SELECT * FROM InteriorSites WHERE Id = $1', [siteId]);
    if (result.rowCount == 1) {
        const site = result.rows[0];
        const apRefs = {
            manage : site.manageaccess,
            peer   : site.peeraccess,
            member : site.memberaccess,
            claim  : site.claimaccess,
        };

        for (const [profile, apRef] of Object.entries(apRefs)) {
            data[profile] = 'false';
            if (apRef) {
                const apResult = await client.query('SELECT Lifecycle FROM BackboneAccessPoints WHERE BackboneAccessPoints.Id = $1', [apRef]);
                if (apResult.rowCount == 1) {
                    data[profile] = 'true';
                }
            }
        }
    } else {
        throw (Error(`Unknown site: ${siteId}`));
    }
    return data;
}

const getLinksIncoming = async function(siteId) {
    var data = {
        metadata : {
            annotations: {},
        },
        data : {},
    };
    var hash = null;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        data.data = await exports.GetBackboneIngresses_TX(client, siteId);
        hash = hashOfConfigMap(data);
        data.metadata.annotations['skupperx/skx-hash'] = hash;
        await client.query('COMMIT');
    } catch (error) {
        Log(`Exception in getLinksIncoming: ${error.message}`);
        await client.query('ROLLBACK');
    } finally {
        client.release();
    }

    return [hash, data];
}

exports.GetBackboneConnectors_TX = async function (client, siteId) {
    const result = await client.query(
        'SELECT *, BackboneAccessPoints.Hostname, BackboneAccessPoints.Port FROM InterRouterLinks ' +
        'JOIN InteriorSites ON InteriorSites.Id = ListeningInteriorSite ' +
        'JOIN BackboneAccessPoints ON BackboneAccessPoints.Id = InteriorSites.PeerAccess ' +
        'WHERE ConnectingInteriorSite = $1', [siteId]);
    let outgoing = {};
    for (const connection of result.rows) {
        outgoing[connection.listeninginteriorsite] = JSON.stringify({
            host: connection.hostname,
            port: connection.port,
            cost: connection.cost.toString(),
        });
    }
    return outgoing;
}

const getLinksOutgoing = async function(siteId) {
    let data = {
        metadata : {
            annotations: {},
        },
        data : {},
    };
    let hash = null;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        data.data = await exports.GetBackboneConnectors_TX(client, siteId);
        hash = hashOfConfigMap(data);
        data.metadata.annotations['skupperx/skx-hash'] = hash;
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
    } finally {
        client.release();
    }

    return [hash, data];
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

const onSendable = function(unused) {
    // This function intentionally left blank
}

const onMessage = async function(backboneId, application_properties, body, onReply) {
    try {
        protocol.DispatchMessage(body,
            async (site, hashset) => {     // onHeartbeat
                await checkSiteHashset(backboneId, site, hashset);
            },
            (site) => {                    // onSolicit
                let backbone = activeBackboneSites[site];
                clearTimeout(backbone.heartbeatTimer);
                sendHeartbeat(site);
            },
            async (site, objectname) => {  // onGet
                let [hash, data] = await getObject(site, objectname);
                onReply({}, protocol.GetObjectResponseSuccess(objectname, hash, data));
                activeBackboneSites[site].bbHashSet[objectname] = hash;
            });
    } catch (error) {
        Log(`Exception in onMessage: ${error.message}`);
    }
}

const onLinkAdded = async function(backboneId, conn) {
    let link = {
        conn        : conn,
        apiSender   : amqp.OpenSender('AnonymousSender', conn, undefined, onSendable),
        apiReceiver : amqp.OpenReceiver(conn, API_CONTROLLER_ADDRESS, onMessage, backboneId),
    };
    link.apiReceiver.backboneId = backboneId;
    openLinks[backboneId] = link;
}

const onLinkDeleted = async function(backboneId) {
    delete openLinks[backboneId];
}

exports.Start = async function () {
    Log('[Manage-Sync module started]');
    await bbLinks.RegisterHandler(onLinkAdded, onLinkDeleted);
}
