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
// This is a standalone module (no API besides the Start function).  It is a reconciliation loop that monitors
// ConfigMaps for "accept" interfaces and Pods looking for selector matches.  Matching pods have router connectors
// configured to reach them.
//

const Log    = require('./common/log.js').Log;
const kube   = require('./common/kube.js');
const router = require('./common/router.js');

var accept_interfaces = {};
var select_pods       = {};
var router_connectors = {};

//
// Reconcile the local state.  The only tool available to this function is to add and remove router_connectors.
//
const reconcile = async function() {
}

//
// Maintain the accept_interfaces list and reconcile if there are any changes.
//
const onConfigMapWatch = async function(action, apiObj) {
}

//
// Maintain the select_pods list and reconcile if there are any changes.
//
const onPodWatch = async function(action, apiObj) {
}

exports.Start = async function() {
    kube.WatchConfigMaps(onConfigMapWatch);
    kube.WatchPods(onPodWatch);
    Log('[Pod/Connector reconciliation module started]');
}
