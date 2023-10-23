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
const db   = require('./db.js');

const processNewNetworks = function() {
    var client;
    db.ClientFromPool()
    .then(result => {
        client = result;
        client.query('BEGIN');
    })
    .then(() => client.query("SELECT * FROM ApplicationNetworks WHERE OperStatus = 'new' LIMIT 1"))
    .then(result => new Promise((resolve, reject) => {
        if (result.rowCount == 1) {
            const row = result.rows[0];
            Log(`New Application Network: ${row.name}`);
            client.query("INSERT INTO CertificateRequests(Id, RequestType, ApplicationNetwork) VALUES(gen_random_uuid(), 'vanCA', $1)", [row.id])
            .then(() => client.query("UPDATE ApplicationNetworks SET OperStatus = 'cert_request_created' WHERE Id = $1", [row.id]))
            .then(() => resolve())
            .catch(reason => reject(reason));
        } else {
            reject();
        }
    }))
    .then(() => client.query('COMMIT'))
    .catch(() => client.query('ROLLBACK'))
    .finally(() => setTimeout(processNewNetworks, 2000))
    .finally(() => client.release());
}

exports.Start = function() {
    Log('[Certificate module starting]');
    setTimeout(processNewNetworks, 1000);
}

