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
// This module manages short identifiers for objects.  It starts with 5-characters and expands to react to collisions.
//

var inUseIdentities = [];

exports.NewIdentity = function() {
    const value = crypto.randomUUID();
    var   size  = 5;

    var ident = value.slice(0-size);
    while (inUseIdentities.indexOf(ident) >= 0) {
        size += 1;
        ident = value.slice(0-size);
    }

    inUseIdentities.push(ident);
    return ident;
}

exports.RecordIdentity = function(ident) {
    inUseIdentities.push(ident);
}
