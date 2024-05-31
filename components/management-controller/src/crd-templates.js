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

const common = require('./common/common.js');

exports.BackboneSite = function(name) {
    return {
        apiVersion : common.CRD_API_VERSION,
        kind       : 'Site',
        metadata : {
            name : name,
            [common.META_ANNOTATION_SKUPPERX_CONTROLLED] : true,
        },
        spec : {
            linkAccess : 'none',
        },
    };
}

exports.RouterAccess = function(accessPoint, tlsName) {
    var role = 'normal';
    switch (accessPoint.kind) {
        case 'peer' :
            role = 'inter-router';
            break;
        case 'member' :
            role = 'edge';
            break;
    }

    let obj = {
        apiVersion : common.CRD_API_VERSION,
        kind       : 'LinkAccess',
        metadata : {
            name : `access-${accessPoint.kind}-${accessPoint.id}`,
            [common.META_ANNOTATION_SKUPPERX_CONTROLLED] : true,
        },
        spec : {
            roles : [
                {
                    role : role,
                },
            ],
            tlsCredentials : tlsName,
            bindHost       : accessPoint.bindhost,
        },
    };

    return obj;
}