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

const OP_HEARTBEAT         = 'HB';
const OP_SOLICIT_HEARTBEAT = 'SH';
const OP_GET               = 'GET';

exports.Heartbeat = function(fromSite, hashSet) {
    return {
        op      : OP_HEARTBEAT,
        site    : fromSite,
        hashset : hashSet,
    };
}

exports.SolicitHeartbeat = function(fromSite) {
    return {
        op   : OP_SOLICIT_HEARTBEAT,
        site : fromSite,
    };
}

exports.GetObject = function(fromSite, objectName) {
    return {
        op         : OP_GET,
        site       : fromSite,
        objectname : objectName,
    };
}

exports.GetObjectResponseSuccess = function(objectName, hash, data) {
    return {
        statusCode        : 200,
        statusDescription : 'OK',
        objectName        : objectName,
        hash              : hash,
        data              : data,
    };
}

exports.GetObjectReponseFailure = function(code, description) {
    return {
        statusCode        : code,
        statusDescription : description,
    };
}

exports.DispatchMessage = function(body, onHeartbeat, onSolicit, onGet) {
    switch (body.op) {
    case OP_HEARTBEAT         : onHeartbeat(body.site, body.hashset);  break;
    case OP_SOLICIT_HEARTBEAT : onSolicit(body.site);                  break;
    case OP_GET               : onGet(body.site, body.objectname);     break;
    default:
        throw Error(`Unknown op-code ${body.op}`);
    }
}