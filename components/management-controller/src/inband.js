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

const kube       = require('./common/kube.js');
const Log        = require('./common/log.js').Log;
const db         = require('./db.js');
const siteConfig = require('./bb-site-config.js');
const api        = require('./mc-apiserver.js');

var controller_name;
var container;
var tls_ca;
var tls_cert;
var tls_key;
var bb_connections = {};

const onBackboneHeartbeat = async function(message) {
    const site = message.body.site;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query("SELECT Lifecycle, Name FROM InteriorSites WHERE Id = $1", [site]);
        if (result.rowCount == 1) {
            const row = result.rows[0];
            if (row.lifecycle == 'ready') {
                await client.query("UPDATE InteriorSites SET Lifecycle = 'active', FirstActiveTime = now() WHERE Id = $1", [site]);
                Log(`Backbone site became active: ${site} (${row.name})`);
            }
            await client.query("UPDATE InteriorSites SET LastHeartbeat = now() WHERE Id = $1", [site]);
        } else {
            Log(`Received BB_HEARTBEAT from unknown site: ${site}`);
        }
        await client.query('COMMIT');
    } catch (err) {
        Log(`Rolling back onBackboneHeartbeat transaction: ${err.stack}`);
        await client.query('ROLLBACK');
    } finally {
        client.release();
    }
}

const BackboneForSite = async function(site) {

}

const onBackboneHashRequest = async function(message) {
    const site    = message.body.site;
    const replyTo = message.reply_to;
    const client  = await db.ClientFromPool();
    var found = false;
    var bbid;

    //
    // Start out by recording the replyTo in the InteriorSite record.
    //
    try {
        await client.query('BEGIN');
        const result = await client.query("SELECT InbandAddress, Backbone FROM InteriorSites WHERE Id = $1", [site]);
        if (result.rowCount == 1) {
            found = true;
            const row = result.rows[0];
            bbid = row.backbone; // Needed below to find the outgoing sender.
            if (row.inbandaddress != replyTo) {
                await client.query("UPDATE InteriorSites SET InbandAddress = $1 WHERE Id = $2", [replyTo, site]);
            }
        } else {
            Log(`Received BB_QUERY_HASH from unknown site: ${site}`);
        }
        await client.query('COMMIT');
    } catch (err) {
        Log(`Rolling back onBackboneHashRequest transaction: ${err.stack}`);
        await client.query('ROLLBACK');
        found = false;
    } finally {
        client.release();
    }

    //
    // If the site exists, compute the configuration hash and send it in a reply.
    //
    if (found) {
        const hash = await siteConfig.ComputeConfigHash(site);
        const response = {
            op: 'BB_QUERY_HASH',
            site: site,
            configHash: hash,
        };
        if (bb_connections[bbid]) {
            bb_connections[bbid].anonSender.send({
                to: replyTo,
                correlation_id : message.correlation_id,
                body: response,
            });
        }
    }
}

const onBackbonePostIngress = async function(message) {
    Log(message.body);
    const bundle = message.body.bundle;
    const bsid   = message.body.site;
    let count = 0;
    if (typeof bundle.ingresses == 'object') {
        for (const [key, obj] of Object.entries(bundle.ingresses)) {
            count += await api.AddHostToAccessPoint(bsid, key, obj.host, obj.port);
        }
    }
}

const onBackboneGetConfig = async function(message) {
}

const rheaHandlers = function() {
    container.options.enable_sasl_external = true;

    container.on('connection_open', function(context) {
        Log('Connection to the management access point is open');
    });

    container.on('receiver_open', function(context) {
    });

    container.on('sendable', function(context) {
    });

    container.on('message', function (context) {
        const message = context.message;
        const body = message.body;
        if (body.op && body.site) {
            try {
                Log(`Inband message '${body.op}' from site '${body.site}'`);
                switch (body.op) {
                    case 'BB_HEARTBEAT'    : onBackboneHeartbeat(message);    break;
                    case 'BB_QUERY_HASH'   : onBackboneHashRequest(message);  break;
                    case 'BB_POST_INGRESS' : onBackbonePostIngress(message);  break;
                    case 'BB_GET_CONFIG'   : onBackboneGetConfig(message);    break;
                }
            } catch (err) {
                Log(`Exception in message handling for op ${body.op}: ${err.message}`);
            }
        }
    });
}

const createConnection = function(bbid, row) {
    bb_connections[bbid] = {
        toDelete: false,
        host: row.hostname,
        port: row.port,
    };

    Log(`Connecting to Access Point: ${row.hostname}:${row.port}`);
    bb_connections[bbid].conn = container.connect({
        host: row.hostname,
        hostname: row.hostname,
        transport: 'tls',
        port: row.port,
        ca:   tls_ca,
        key:  tls_key,
        cert: tls_cert,
    });

    bb_connections[bbid].receiver   = bb_connections[bbid].conn.open_receiver('skx/controller/site');
    bb_connections[bbid].anonSender = bb_connections[bbid].conn.open_sender();
    bb_connections[bbid].receiver.bbid = bbid;
}

const deleteConnection = function(bbid) {
    let conn = bb_connections[bbid];
    conn.close();
    delete bb_connections[bbid];
}

const reconcileBackboneConnections = async function() {
    var reschedule_delay = 30000;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query("SELECT * FROM BackboneAccessPoints WHERE Lifecycle = 'ready' and Kind = 'manage'");
        let db_rows = {};
        for (const row of result.rows) {
            if (!db_rows[row.backbone]) {
                db_rows[row.backbone] = row;
            }
        }

        for (const bbid of Object.keys(bb_connections)) {
            bb_connections[bbid].toDelete = true;
        }

        for (const [bbid, row] of Object.entries(db_rows)) {
            if (bb_connections[bbid]) {
                bb_connections[bbid].toDelete = false;
            } else {
                createConnection(bbid, row);
            }
        }

        for (const bbid of Object.keys(bb_connections)) {
            if (bb_connections[bbid].toDelete) {
                deleteConnection(bbid);
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
        Log(`Rolling back resolve-management-controller transaction: ${err.stack}`);
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
        Log(`Rolling back resolve-management-controller transaction: ${err.stack}`);
        await client.query('ROLLBACK');
        reschedule_delay = 10000;
    } finally {
        client.release();
        if (reschedule_delay >= 0) {
            setTimeout(resolveControllerRecord, reschedule_delay);
        }
    }
}

exports.Start = async function(name, rhea) {
    Log(`[In-band communication starting for controller: ${name}]`);
    controller_name = name;
    container       = rhea;
    rheaHandlers();
    await resolveControllerRecord();
}
