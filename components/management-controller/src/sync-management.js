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
// This module is the state-sync endpoint for backbone sites.  This module should only be started for
// backbone sites.
//
// The responsibility of this module is simply to synchronize Kubernetes state with the management controller.
//
// Local State (synchronized to the management-controller):
//   - Ingress host/port pairs for each access point
//
// Remote State (synchronized from the management-controller):
//   - Secrets
//   - Access Points
//

const Log     = require('./common/log.js').Log;
const common  = require('./common/common.js');
const db      = require('./db.js');
const sync    = require('./common/state-sync.js');
const bbLinks = require('./backbone-links.js');

var peers = {};  // {peerId: {stuff}}

const onNewPeer = async function(_peerId, peerClass) {
}

const onPeerLost = async function(peerId) {
}

const onStateChange = async function(peerId, stateKey, hash, data) {
}

const onStateRequest = async function(peerId, stateKey) {
}

const onLinkAdded = async function(backboneId, conn) {
    await sync.AddConnection(backboneId, conn);
}

const onLinkDeleted = async function(backboneId) {
    await sync.DeleteConnection(backboneId);
}

exports.Start = async function() {
    await sync.Start(sync.CLASS_MANAGEMENT, 'mc', common.API_CONTROLLER_ADDRESS, onNewPeer, onPeerLost, onStateChange, onStateRequest);
    await bbLinks.RegisterHandler(onLinkAdded, onLinkDeleted);
}
