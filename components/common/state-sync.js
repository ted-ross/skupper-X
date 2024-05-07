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

const Log      = require('./common/log.js').Log;
const amqp     = require('./common/amqp.js');
const protocol = require('./common/protocol.js');

var localClass;
var localId;
var address;
var onNewPeer;
var onPeerLost;
var onStateChange;
var onStateRequest;

//
// Notify a peer that state being synchronized to it has changed.
//
exports.PeerStateChanged = async function(peerId, stateId, stateHash) {
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
// Initialize the State-Sync module
//
//   Parameters:
//     _class   : {'manage-controller', 'backbone-controller', 'member-controller'}
//     _id      : The ID of the local controller
//     _address : The AMQP address on which this node receives heartbeats.  If undefined, a dynamic address will be used.
//   Callbacks:
//     _onNewPeer(peerId, peerClass)
//     _onPeerLost(peerId)
//     _onStateChange(peerId, stateId, hash, data)
//     _onStateRequest(peerId, stateId) => [hash, data]
//
exports.Start = async function(_class, _id, _address, _onNewPeer, _onPeerLost, _onStateChange, _onStateRequest) {
    Log('State-Sync Module starting');
    localClass     = _class;
    localId        = _id;
    address        = _address;
    onNewPeer      = _onNewPeer;
    onPeerLost     = _onPeerLost;
    onStateChange  = _onStateChange;
    onStateRequest = _onStateRequest;
}