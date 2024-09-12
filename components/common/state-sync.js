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
// This is the State-Sync module.  It is responsible for running the heaertbeat protocol and keeping track of the
// state-hashes of state being synchronized to us and from us to others.
//
// This module is agnostic as to the format of the storage of local state (ConfigMaps, CRs, files, etc.).  It uses a
// canonical object-based format for standardized transport.
//
// This module tracks remote peers and the stateId:hash tuples for the remote copy of the state.  It does not store actual
// state.  The state is stored in the management database and in various forms on network sites including Kubernetes
// objects (secrets, config-maps, Skupper custom resources), files, database records, etc.
//

const Log      = require('./log.js').Log;
const amqp     = require('./amqp.js');
const protocol = require('./protocol.js');

exports.CLASS_MANAGEMENT = 'management';
exports.CLASS_BACKBONE   = 'backbone';
exports.CLASS_MEMBER     = 'member';

const HEARTBEAT_PERIOD_SECONDS = 10;  // TODO - make this much longer
const HEARTBEAT_WINDOW_SECONDS = 5;

var localClass;
var localId;
var localAddress;
var addressToUse;
var initialBeacon = true;
var onNewPeer;
var onPeerLost;
var onStateChange;
var onStateRequest;
var onPing;

//
// Concepts:
//
//   Class         - Describes the peer endpoint as a management-controller, a backbone-controller, or a member-controller
//   PeerId        - Either 'mc' for the management-controller or the UUID identifier of the site (backbone or member)
//   ConnectionKey - Either 'net' for the site's network or the backbone-id (UUID).  Identifies a connection to a network
//   State         - A unit of configuration that will be synchronized between peers in one direction.
//   StateKey      - A string identifier that uniquely identifies a unit of state.
//   StateHash     - A hash value computed on the content of a unit of state.
//   HashState     - A map {StateKey : StateHash} that describes all of the state being synchronized to or from a peer.
//   LocalState    - The local state that is intended to be synchronized TO a peer.
//   RemoteState   - The remote state that is intended to be synchronized FROM a peer.
//

var extraTargets = [];
var connections  = {};  // {connectionKey: conn-record}
var peers        = {};  // {peerId: {connectionKey: <key>, peerClass: <class>, localState: {stateKey: hash}, remoteState: {stateKey: hash}}}

const timerDelayMsec = function(floorSec) {
    return (Math.floor(Math.random() * (HEARTBEAT_WINDOW_SECONDS + 1) + floorSec)) * 1000;
}

const sendHeartbeat = function(peerId) {
    let peer = peers[peerId];
    if (!!peer) {
        if (peer.hbTimer) {
            clearTimeout(peer.hbTimer);
        }
        const sender = connections[peer.connectionKey].apiSender;
        const message = protocol.Heartbeat(localId, localClass, peer.localState, addressToUse);
        amqp.SendMessage(sender, message, {}, peer.address);
        peers[peerId].hbTimer = setTimeout(sendHeartbeat, timerDelayMsec(HEARTBEAT_PERIOD_SECONDS), peerId);
        //Log(`SYNC: Sent Heartbeat to ${peerId}`);
        //Log(message);
    }
}

const onHeartbeat = async function(connectionKey, peerClass, peerId, hashset, address) {
    var localState;
    var remoteState;
    //Log(`SYNC: Received Heartbeat from ${peerId}`);
    initialBeacon = false;

    //
    // If this heartbeat comes from a peer we are not tracking, consider this a new-peer.
    //
    if (!peers[peerId]) {
        //Log(`SYNC:   New Peer, id: ${peerId}`);
        [localState, remoteState] = await onNewPeer(peerId, peerClass);
        peers[peerId] = {
            connectionKey : connectionKey,
            peerClass     : peerClass,
            address       : address,
            localState    : localState,
            remoteState   : remoteState,
            hbTimer       : null,
        };

        //
        // Send a heartbeat back to the newly discovered peer with the local hash-state.
        //
        sendHeartbeat(peerId);
    } else {
        onPing(peerId);
    }

    //
    // If the hashset is not present in the heartbeat, there is no synchronization to be done.
    //
    if (!!hashset) {
        //Log('Current Hashset:');
        //Log(peers[peerId].remoteState);
        //Log('Heartbeat Hashset:');
        //Log(hashset);
        //
        // Reconcile the existing remote state against the advertized remote state.
        //
        let toRequestStateKeys = [];
        let toDeleteStateKeys = {};
        for (const key of Object.keys(peers[peerId].remoteState)) {
            toDeleteStateKeys[key] = true;
        }
        for (const [key, hash] of Object.entries(hashset)) {
            toDeleteStateKeys[key] = false;
            if (hash != peers[peerId].remoteState[key]) {
                toRequestStateKeys.push(key);
            }
        }

        //
        // Delete the no-longer-relevant states
        //
        for (const [key, value] of Object.entries(toDeleteStateKeys)) {
            try {
                if (value) {
                    //Log(`SYNC:   Removing state: ${key}`);
                    await onStateChange(peerId, key, null, null);
                    delete peers[peerId].remoteState[key];
                }
            } catch (error) {
                Log(`Exception in state reconciliation for deletion of ${key}: ${error.message}`);
            }
        }

        //
        // Request updates from the peer for changed hashes
        //
        const sender = connections[connectionKey].apiSender;
        for (const key of toRequestStateKeys) {
            try {
                Log(`SYNC:   Requesting state update for key: ${key}, to: ${peers[peerId].address}`);
                const [ap, body] = await amqp.Request(sender, protocol.GetState(localId, key), {}, peers[peerId].address);
                if (body.statusCode == 200) {
                    Log(`SYNC:     New State: hash=${body.hash}, data=`);
                    Log(body.data);
                    await onStateChange(peerId, key, body.hash, body.data);
                    peers[peerId].remoteState[key] = body.hash;
                } else {
                    throw (Error(`Protocol error on GetState: (${body.statusCode}) ${body.statusDescription}`));
                }
            } catch (error) {
                Log(`Exception in state reconciliation for ${key}: ${error.message}`);
                Log(error.stack);
            }
        }
    }
}

const sendInitialBeacon = function() {
    try {
        if (initialBeacon && connections['net']) {
            const sender  = connections['net'].apiSender;
            for (const address of extraTargets) {
                //Log(`Sending beacon heartbeat to ${address}`);
                const message = protocol.Heartbeat(localId, localClass, null, addressToUse);
                amqp.SendMessage(sender, message, {}, address);
            }
        }
    } catch(e) {
        Log(`Exception caught in sendInitialBeacon - ${e.message}`);
    }

    if (initialBeacon) {
        setTimeout(sendInitialBeacon, 5000);
    }
}

const onSendable = function(connectionKey) {
    if (initialBeacon) {
        sendInitialBeacon();
    }
}

const onAddress = function(connectionKey, address) {
    if (connectionKey == 'net') {
        addressToUse = address;
    } else {
        Log(`ERROR: onAddress invoked with connectionKey '${connectionKey}', expected 'net`);
    }
}

const processMessage = async function(connectionKey, body, onReply) {
    try {
        await protocol.DispatchMessage(body,
            async (sclass, site, hashset, address) => { // onHeartbeat
                await onHeartbeat(connectionKey, sclass, site, hashset, address);
            },
            async (site, statekey) => {                 // onGet
                Log(`SYNC: Received state request from ${site} for key ${statekey}`);
                const [hash, data] = await onStateRequest(site, statekey);
                onReply({}, protocol.GetStateResponseSuccess(statekey, hash, data));
            },
            async (claimId, name) => {                  // onClaim
            }
        );
    } catch (error) {
        Log(`Exception in sync message processing: ${error.message}`);
    }
}

var processingContext = {};  // peerId => {workQueue, processing}

const processWorkQueue = async function(siteId) {
    while (processingContext[siteId].processing) {
        const [connectionKey, body, onReply] = processingContext[siteId].workQueue.shift();
        await processMessage(connectionKey, body, onReply);
        processingContext[siteId].processing = processingContext[siteId].workQueue.length > 0;
    }
}

const onMessage = function(connectionKey, application_properties, body, onReply) {
    const siteId = protocol.SourceSite(body);

    if (!processingContext[siteId]) {
        processingContext[siteId] = {
            workQueue  : [],
            processing : false,
        };
    }

    processingContext[siteId].workQueue.push([connectionKey, body, onReply]);
    if (!processingContext[siteId].processing) {
        processingContext[siteId].processing = true;
        processWorkQueue(siteId);
    }
}

//
// Notify a peer that state being synchronized to it has changed.
//
exports.UpdateLocalState = async function(peerId, stateKey, stateHash) {
    if (!peers[peerId]) {
        Log(`UpdateLocalState on nonexisting peerId: ${peerId}`);
    } else {
        if (stateHash) {
            peers[peerId].localState[stateKey] = stateHash;
        } else {
            delete peers[peerId].localState[stateKey];
        }
        sendHeartbeat(peerId);
    }
}

//
// Add a new heartbeat target.  This is optional and is only needed in cases where peers are not
// automatically detected.
//
// This is called by backbone and member sites to target the managment controller, but is not called
// by the management controller, which automatically detects sites.
//
exports.AddTarget = async function(targetAddress) {
    extraTargets.push(targetAddress);
}

//
// Add a new AMQP connection for communication.
//
// backboneId : The identifier of the backbone to which this connection connects - undefined == connected to management-controller
// conn       : The AMQP connection
//
exports.AddConnection = async function(backboneId, conn) {
    const connectionKey = backboneId || 'net';

    //
    // If someone is creating a backbone connection and the local address was not provided in the Start function,
    // throw an error.  This is an unintended use of this module.  If there is a dynamic local address, there shall
    // be no more than one connection in place at a time.
    //
    if (!!backboneId && !localAddress) {
        const error = 'Illegal adding of a backbone connection when no local address has been established';
        Log(`state-sync.AddConnection: ${error}`);
        throw(Error(error));
    }

    let connRecord = {
        conn        : conn,
        apiSender   : amqp.OpenSender('AnonymousSender', conn, undefined, onSendable, connectionKey),
        apiReceiver : null,
    };

    if (!!localAddress) {
        connRecord.apiReceiver = amqp.OpenReceiver(conn, localAddress, onMessage, connectionKey);
        addressToUse = localAddress;
    } else {
        connRecord.apiReceiver = amqp.OpenDynamicReceiver(conn, onMessage, onAddress, connectionKey);
    }

    connRecord.apiReceiver.connectionKey = connectionKey;
    connections[connectionKey] = connRecord;
}

//
// Delete an AMQP connection - This does not affect the lifecycle of known peers.
//
// backboneId : The identifier (or undefined for the management-controller) of the connected backbone
//
exports.DeleteConnection = async function(backboneId) {
    delete connections[backboneId];
}

//
// Initialize the State-Sync module
//
//   Parameters:
//     _class   : 'management' | 'backbone' | 'member'
//     _id      : The ID of the local controller
//     _address : The AMQP address on which this node receives heartbeats.  If undefined, a dynamic address will be used.
//   Callbacks:
//     _onNewPeer(peerId, peerClass) => [LocalStateHash, RemoteStateHash] for the peer
//     _onPeerLost(peerId)
//     _onStateChange(peerId, stateKey, hash, data)   If hash == null, stateKey should be deleted, else updated
//     _onStateRequest(peerId, stateKey) => [hash, data]
//     _onPing(peerId)  Invoked whenever we hear from the peer
//
exports.Start = async function(_class, _id, _address, _onNewPeer, _onPeerLost, _onStateChange, _onStateRequest, _onPing) {
    Log(`State-Sync Module starting: class=${_class}, id=${_id}, address=${_address || '<dynamic>'}`);
    localClass     = _class;
    localId        = _id;
    localAddress   = _address;
    onNewPeer      = _onNewPeer;
    onPeerLost     = _onPeerLost;
    onStateChange  = _onStateChange;
    onStateRequest = _onStateRequest;
    onPing         = _onPing;
}