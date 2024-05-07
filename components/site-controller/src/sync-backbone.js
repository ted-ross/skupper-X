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
// Local State (synchronized to the management-controller):
//   - Ingress host/port pairs for each access point
//
// Remote State (synchronized from the management-controller):
//   - Secrets
//   - Access Points
//

const Log      = require('./common/log.js').Log;
const common   = require('./common/common.js');
const kube     = require('./common/kube.js');
const ingress  = require('./ingress.js');
const sync     = require('./common/state-sync.js');


const onNewPeer = async function(peerId, peerClass) {
}

const onPeerLost = async function(peerId) {
}

const onStateChange = async function(peerId, stateKey, hash, data) {
}

const onStateRequest = async function(peerId, stateKey) {
}

exports.Start = async function(siteId, conn) {
    await sync.Start(sync.CLASS_BACKBONE, siteId, undefined, onNewPeer, onPeerLost, onStateChange, onStateRequest);
    await sync.AddTarget(common.API_CONTROLLER_ADDRESS);
    await sync.AddConnection(undefined, conn);
}
