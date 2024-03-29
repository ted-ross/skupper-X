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

//const Log = require('./log.js').Log;

const OP_HEARTBEAT         = 'HB';
const OP_SOLICIT_HEARTBEAT = 'SH';
const OP_GET               = 'GET';
const OP_CLAIM             = 'CLAIM';

exports.Heartbeat = function(fromSite, hashSet, address="") {
    return {
        op      : OP_HEARTBEAT,
        site    : fromSite,
        hashset : hashSet,
        address : address,
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

exports.AssertClaim = function(claimId, name) {
    return {
        op    : OP_CLAIM,
        claim : claimId,
        name  : name,
    };
}

exports.AssertClaimResponseSuccess = function(outgoingLinks, siteClient) {
    return {
        statusCode        : 200,
        statusDescription : 'OK',
        outgoingLinks     : outgoingLinks,
        siteClient        : siteClient,
    };
}

exports.ReponseFailure = function(code, description) {
    return {
        statusCode        : code,
        statusDescription : description,
    };
}

exports.DispatchMessage = function(body, onHeartbeat, onSolicit, onGet, onClaim) {
    switch (body.op) {
    case OP_HEARTBEAT         : onHeartbeat(body.site, body.hashset, body.address);  break;
    case OP_SOLICIT_HEARTBEAT : onSolicit(body.site);                                break;
    case OP_GET               : onGet(body.site, body.objectname);                   break;
    case OP_CLAIM             : onClaim(body.claim, body.name);                      break;
    default:
        throw Error(`Unknown op-code ${body.op}`);
    }
}