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
// This module allocates and manages ports to be used by the router pod
//

const FIRST_EPHEMERAL_PORT = 1050;
const API_PORT             = 1040;          // The port for the site-controller API
const reserved_ports       = [5672, 9090];  // Ports that must never be allocated

var next_port      = FIRST_EPHEMERAL_PORT;
var free_list      = [];  // Ports that were freed and may be re-allocated
var pre_taken_list = [];  // Ports that were pre-allocated and must not be allocated (ports greater than next_port)

exports.GetApiPort = function() {
    return API_PORT;
}

exports.TakePort = function(port) {
    if (port >= next_port) {
        pre_taken_list.push(port);
    }
}

exports.AllocatePort = function() {
    var new_port;
    if (free_list.length > 0) {
        new_port = free_list.shift();
    } else {
        new_port = next_port;
        while (reserved_ports.includes(new_port) || pre_taken_list.includes(new_port)) {
            next_port += 1;
            new_port = next_port;
        }
        next_port += 1;
    }
    return new_port;
}

exports.FreePort = function(port) {
    if (port >= FIRST_EPHEMERAL_PORT) {
        free_list.push(port);
    }
}
