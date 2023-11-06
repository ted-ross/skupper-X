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

const db   = require('./db.js');
const Log  = require('./log.js').Log

var config;
var changeListeners = [];

exports.RootIssuer            = () => config.rootissuer;
exports.DefaultCaExpiration   = () => config.defaultcaexpiration;
exports.DefaultCertExpiration = () => config.defaultcertexpiration;
exports.BackboneExpiration    = () => config.backbonecaexpiration;
exports.SiteDataplaneImage    = () => config.sitedataplaneimage;
exports.SiteControllerImage   = () => config.sitecontrollerimage;

const updateConfiguration = function() {
    return db.QueryConfig()
    .then(draft => config = draft)
    .then(() => {
        Log("Agent configuration:");
        Log(config);
        changeListeners.forEach(onConfigChange => onConfigChange());
    });
}

exports.Start = function() {
    Log('[Config module starting]');
    return db.QueryConfig()
    .then(result => config = result)
    .then(() => Log(config));
}

exports.Register = function(onConfigChange) {
    changeListeners.push(onConfigChange);
}