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

const kube = require('./kube.js');
const Log  = require('./log.js').Log;
const Pool = require('pg').Pool;

var appConfig;
var db;
var observer1;
var observer2;
var observer3;
var observer4;
const USER_ID  = process.env.NH_USER       || '';
const AGENT_ID = process.env.NH_ROUTER_KEY || '';
var cloudId;
var networkId;
var lastStatus = {status : 'UNKNOWN'};
var selfCallbacks = [];
var selfDoc;
var dbConnected = false;

var connectionPool;

exports.Start = function() {
    Log('[Database module starting]');
    connectionPool = new Pool();
}

exports.QueryConfig = function () {
    return connectionPool.query('SELECT * FROM configuration WHERE id = 0')
    .then(result => result.rows[0]);
}