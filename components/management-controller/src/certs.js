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

//
// processNewNetworks
//
// When new networks are created, add a certificate request to begin the full setup of the network.
//
const processNewNetworks = async function() {
    var reschedule_delay = 2000;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query("SELECT * FROM ApplicationNetworks WHERE OperStatus = 'new' LIMIT 1");
        if (result.rowCount == 1) {
            const row = result.rows[0];
            Log(`New Application Network: ${row.name}`);
            await client.query("INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, ApplicationNetwork) VALUES(gen_random_uuid(), 'vanCA', now(), $1, $2)", [row.starttime, row.id]);
            await client.query("UPDATE ApplicationNetworks SET OperStatus = 'cert_request_created' WHERE Id = $1", [row.id]);
            reschedule_delay = 0;
        }
        await client.query('COMMIT');
    } catch (err) {
        Log(`Rolling back transaction: ${err.stack}`);
        await client.query('ROLLBACK');
    } finally {
        client.release();
        setTimeout(processNewNetworks, reschedule_delay);
    }
}

//
// processCertificateRequests
//
// When new networks are created, add a certificate request to begin the full setup of the network.
//
const processCertificateRequests = async function() {
  var reschedule_delay = 2000;
  const client = await db.ClientFromPool();
  try {
      await client.query('BEGIN');
      const result = await client.query("SELECT * FROM CertificateRequests WHERE RequestTime <= now() and not Processing ORDER BY CreatedTime LIMIT 1");
      if (result.rowCount == 1) {
          const row = result.rows[0];
          Log(`New Application Network: ${row.name}`);
          await client.query("INSERT INTO CertificateRequests(Id, RequestType, ApplicationNetwork) VALUES(gen_random_uuid(), 'vanCA', $1)", [row.id]);
          await client.query("UPDATE ApplicationNetworks SET OperStatus = 'cert_request_created' WHERE Id = $1", [row.id]);
          reschedule_delay = 0;
      }
      await client.query('COMMIT');
  } catch (e) {
      await client.query('ROLLBACK');
  } finally {
      client.release();
      setTimeout(processNewNetworks, reschedule_delay);
  }
}

exports.Start = function() {
    Log('[Certificate module starting]');
    setTimeout(processNewNetworks, 1000);
    //setTimeout(processCertificateRequests, 1000);
}

