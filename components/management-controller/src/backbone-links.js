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
// The responsibility of this module is to maintain an AMQP connection to each backbone network.
//

const kube = require('./common/kube.js');
const Log  = require('./common/log.js').Log;
const db   = require('./db.js');
const amqp = require('./common/amqp.js');

var controller_name;
var tls_ca;
var tls_cert;
var tls_key;
var bbConnections = {};
var registrations = [];

const createConnection = async function(bbid, row) {
    bbConnections[bbid] = {
        toDelete:   false,
        host:       row.hostname,
        port:       row.port,
        management: row.managementbackbone,
    };

    Log(`Connecting to Access Point: ${row.hostname}:${row.port}`);
    bbConnections[bbid].conn = amqp.OpenConnection(
        `Backbone-management-${bbid}`,
        row.hostname,
        row.port,
        'tls',
        tls_ca,
        tls_cert,
        tls_key);

    for (const reg of registrations) {
        if ((row.managementbackbone && reg.management) || (!row.managementbackbone && reg.non_management)) {
            await reg.onLinkAdded(bbid, bbConnections[bbid].conn);
        }
    }
}

const deleteConnection = async function(bbid) {
    let conn = bbConnections[bbid].conn;
    const managementbackbone = bbConnections[bbid].managementbackbone;
    amqp.CloseConnection(conn);
    delete bbConnections[bbid];

    for (const reg of registrations) {
        if ((managementbackbone && reg.management) || (!managementbackbone && reg.non_management)) {
            await reg.onLinkDeleted(bbid);
        }
    }
}

const reconcileBackboneConnections = async function() {
    var reschedule_delay = 30000;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            "SELECT BackboneAccessPoints.*, InteriorSites.Backbone, Backbones.ManagementBackbone " +
            "FROM BackboneAccessPoints " +
            "JOIN InteriorSites ON InteriorSites.Id = InteriorSite " + 
            "JOIN Backbones ON Backbones.Id = InteriorSites.Backbone " +
            "WHERE BackboneAccessPoints.Lifecycle = 'ready' and Kind = 'manage'");
        let db_rows = {};
        for (const row of result.rows) {
            if (!db_rows[row.backbone]) {
                db_rows[row.backbone] = row;
            }
        }

        for (const bbid of Object.keys(bbConnections)) {
            bbConnections[bbid].toDelete = true;
        }

        for (const [bbid, row] of Object.entries(db_rows)) {
            if (bbConnections[bbid]) {
                bbConnections[bbid].toDelete = false;
            } else {
                await createConnection(bbid, row);
            }
        }

        for (const bbid of Object.keys(bbConnections)) {
            if (bbConnections[bbid].toDelete) {
                await deleteConnection(bbid);
            }
        }

        await client.query('COMMIT');
    } catch (err) {
        Log(`Rolling back reconcile-backbone-connections transaction: ${err.stack}`);
        await client.query('ROLLBACK');
        reschedule_delay = 10000;
    } finally {
        client.release();
        setTimeout(reconcileBackboneConnections, reschedule_delay);
    }
}

const resolveTLSData = async function() {
    var reschedule_delay = 1000;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query("SELECT * FROM ManagementControllers WHERE Name = $1 and LifeCycle = 'ready'", [controller_name]);
        if (result.rowCount == 1) {
            const tls_result = await client.query("SELECT ObjectName FROM TlsCertificates WHERE Id = $1", [result.rows[0].certificate]);
            if (tls_result.rowCount == 1) {
                const secret = await kube.LoadSecret(tls_result.rows[0].objectname);
                let   count  = 0;
                for (const [key, value] of Object.entries(secret.data)) {
                    if (key == 'ca.crt') {
                        tls_ca = Buffer.from(value, 'base64');
                        count += 1;
                    } else if (key == 'tls.crt') {
                        tls_cert = Buffer.from(value, 'base64');
                        count += 1;
                    } else if (key == 'tls.key') {
                        tls_key = Buffer.from(value, 'base64');
                        count += 1;
                    }
                }

                if (count != 3) {
                    throw(Error(`Unexpected set of values from TLS secret data - expected 3, got ${count}`));
                }

                reschedule_delay = -1;
                setTimeout(reconcileBackboneConnections, 0);
            } else {
                throw(Error(`Expected to find a TlsCertificate record for ready controller: ${result.rows[0].certificate}`));
            }
        }
        await client.query('COMMIT');
    } catch (err) {
        Log(`Rolling back resolveTLSData transaction: ${err.stack}`);
        await client.query('ROLLBACK');
        reschedule_delay = 10000;
    } finally {
        client.release();
        if (reschedule_delay >= 0) {
            setTimeout(resolveTLSData, reschedule_delay);
        }
    }
}

const resolveControllerRecord = async function() {
    var reschedule_delay = -1;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query("SELECT * FROM ManagementControllers WHERE Name = $1", [controller_name]);
        if (result.rowCount == 1) {
            setTimeout(resolveTLSData, 0);
        } else {
            client.query("INSERT INTO ManagementControllers (Name) VALUES ($1)", [controller_name]);
            setTimeout(resolveTLSData, 1000);
            Log(`No management controller found for '${controller_name}', created new record`);
        }
        await client.query('COMMIT');
    } catch (err) {
        Log(`Rolling back resolveControllerRecord transaction: ${err.stack}`);
        await client.query('ROLLBACK');
        reschedule_delay = 10000;
    } finally {
        client.release();
        if (reschedule_delay >= 0) {
            setTimeout(resolveControllerRecord, reschedule_delay);
        }
    }
}

exports.RegisterHandler = async function(onAdded, onDeleted, management=true, non_management=true) {
    for (const [key, value] of Object.entries(bbConnections)) {
        if ((value.managementbackbone && management) || (!value.managementbackbone && non_management)) {
            await onAdded(key, value.conn);
        }
    }
    registrations.push({
        onLinkAdded    : onAdded,
        onLinkDeleted  : onDeleted,
        management     : management,
        non_management : non_management,
    });
}

exports.Start = async function(name) {
    Log(`[Backbone-links module starting for controller: ${name}]`);
    controller_name = name;
    await resolveControllerRecord();
}
