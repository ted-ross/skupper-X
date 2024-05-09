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

var localClass;
var localId;
var address;
var addressToUse;
var onNewPeer;
var onPeerLost;
var onStateChange;
var onStateRequest;

//
// Concepts:
//
//   Class         - Describes the peer endpoint as a management-controller, a backbone-controller, or a member-controller
//   PeerId        - Either 'mc' for the management-controller or the UUID identifier of the site
//   ConnectionKey - Either 'net' for the site's network or the backbone-id (UUID).  Identifies a connection to a network
//   State         - A unit of configuration that will be synchronized between peers.
//   StateKey      - A string identifier that uniquely identifies a unit of state.
//   StateHash     - A hash value computed on the content of a unit of state.
//   HashState     - A map {StateKey : StateHash} that describes all of the state being synchronized to or from a peer.
//   LocalState    - The local state that is intended to be synchronized TO a peer.
//   RemoteState   - The remote state that is intended to be synchronized FROM a peer.
//

var connections    = {};  // {connectionKey: conn-record}
var peers          = {};  // {peerId: {peerClass: <class>, localHashState: {stateKey: hash}}}

const onHeartbeat = async function() {
}

const onSendable = function(connectionKey) {
}

const onAddress = function(connectionKey, address) {
    addressToUse = address;
}

const onMessage = function(connectionKey, application_properties, body, onReply) {
    try {
        protocol.DispatchMessage(body,
            async (site, hashset, address) => { // onHeartbeat
                await onHeartbeat(connectionKey, site, hashset, address);
            },
            async (site, objectname) => {       // onGet
            },
            async (claimId, name) => {          // onClaim
            }
        );
    } catch (error) {
        Log(`Exception in onMessage: ${error.message}`);
    }
}

//
// Notify a peer that state being synchronized to it has changed.
//
exports.UpdateLocalState = async function(peerId, stateKey, stateHash) {
}

//
// Add a new heartbeat target.  This is optional and is only needed in cases where peers are not
// automatically detected.
//
// This is called by backbone and member sites to target the managment controller, but is not called
// by the management controller, which automatically detects sites.
//
exports.AddTarget = async function(targetAddress) {
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
    if (!!backboneId && !address) {
        const error = 'Illegal adding of a backbone connection when no local address has been established';
        Log(`state-sync.AddConnection: ${error}`);
        throw(Error(error));
    }

    let connRecord = {
        conn        : conn,
        apiSender   : amqp.OpenSender('AnonymousSender', conn, undefined, onSendable),
        apiReceiver : null,
    };

    if (!!address) {
        connRecord.apiReceiver = amqp.OpenReceiver(conn, address, onMessage, connectionKey);
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
//
exports.Start = async function(_class, _id, _address, _onNewPeer, _onPeerLost, _onStateChange, _onStateRequest) {
    Log(`State-Sync Module starting: class=${_class}, id=${_id}, address=${_address || '<dynamic>'}`);
    localClass     = _class;
    localId        = _id;
    address        = _address;
    onNewPeer      = _onNewPeer;
    onPeerLost     = _onPeerLost;
    onStateChange  = _onStateChange;
    onStateRequest = _onStateRequest;
}