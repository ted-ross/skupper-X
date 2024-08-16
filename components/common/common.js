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
// AMQP addresses
//
exports.API_CONTROLLER_ADDRESS = 'skx/sync/mgmtcontroller';

//
// Selector labels
//
exports.APPLICATION_ROUTER_LABEL = 'skx-router';

//
// Kubernetes annotation keys
//
exports.META_ANNOTATION_SKUPPERX_CONTROLLED = 'skupper.io/skupperx-controlled';
exports.META_ANNOTATION_STATE_HASH          = 'skx/state-hash';
exports.META_ANNOTATION_STATE_TYPE          = 'skx/state-type';
exports.META_ANNOTATION_STATE_ID            = 'skx/state-id';
exports.META_ANNOTATION_TLS_INJECT          = 'skx/tls-inject';

//
// State types
//
exports.STATE_TYPE_LINK          = 'link';
exports.STATE_TYPE_ACCESS_POINT  = 'accesspoint';
exports.INJECT_TYPE_ACCESS_POINT = 'accesspoint';
exports.INJECT_TYPE_SITE         = 'site';

//
// Kubernetes object names
//
exports.ROUTER_SERVICE_NAME = 'skx-router';

//
// Skupper CRD constants
//
exports.CRD_API_VERSION = 'skupper.io/v1alpha1';
