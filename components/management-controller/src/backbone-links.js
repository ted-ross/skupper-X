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

import { LoadSecret } from "@vms/modules/kube";
import { Log } from "@vms/modules/log";
import { ClientFromPool } from "./db.js";
import { OpenConnection, CloseConnection, OnConnectionClosed } from "@vms/modules/amqp";
import { NotifyTransaction, RegisterNotification } from "./notify.js";
import { overlayDualTrustCa } from "./tls-rotation.js";

const UNEXPECTED_RECONNECT_DELAY_MS = 1000;

let controller_name;
let controller_certificate_id;
let tls_ca;
let tls_cert;
let tls_key;
const manageConnections = {};
const registrations = [];

function connectionNeedsRefresh(existing, row) {
    return existing.host !== row.hostname || String(existing.port) !== String(row.port);
}

function applyTlsSecretData(data) {
    let count = 0;
    if (data?.["ca.crt"]) {
        tls_ca = Buffer.from(data["ca.crt"], "base64");
        count += 1;
    }
    if (data?.["tls.crt"]) {
        tls_cert = Buffer.from(data["tls.crt"], "base64");
        count += 1;
    }
    if (data?.["tls.key"]) {
        tls_key = Buffer.from(data["tls.key"], "base64");
        count += 1;
    }
    if (count != 3) {
        throw new Error(`Unexpected set of values from TLS secret data - expected 3, got ${count}`);
    }
}

async function loadManageClientTls(client) {
    const tls_result = await client.query("SELECT ObjectName FROM TlsCertificates WHERE Id = $1", [
        controller_certificate_id,
    ]);
    if (tls_result.rowCount != 1) {
        throw new Error(
            `Expected to find a TlsCertificate record for ready controller: ${controller_certificate_id}`
        );
    }
    const secret = await LoadSecret(tls_result.rows[0].objectname);
    if (!secret?.data) {
        throw new Error(`Missing TLS secret ${tls_result.rows[0].objectname}`);
    }
    const data = await overlayDualTrustCa(client, controller_certificate_id, secret.data);
    applyTlsSecretData(data);
}

async function createConnection(apid, row) {
    const rec = {
        toDelete: false,
        closing: false,
        host: row.hostname,
        port: row.port,
        colocated: row.colocated,
    };
    manageConnections[apid] = rec;

    Log(`Connecting to Access Point: ${row.hostname}:${row.port}`);
    rec.conn = OpenConnection(
        `Backbone-management-${apid}`,
        row.hostname,
        row.port,
        "tls",
        tls_ca,
        tls_cert,
        tls_key
    );
    OnConnectionClosed(rec.conn, () => {
        void onManageConnectionClosed(apid, rec.conn);
    });

    for (const reg of registrations) {
        await reg.onLinkAdded(apid, rec.conn, {
            colocated: rec.colocated,
        });
    }
}

async function deleteConnection(apid) {
    const rec = manageConnections[apid];
    if (!rec) {
        return;
    }
    rec.closing = true;
    const conn = rec.conn;
    const colocated = rec.colocated;
    CloseConnection(conn);
    delete manageConnections[apid];

    for (const reg of registrations) {
        await reg.onLinkDeleted(apid, { colocated: colocated });
    }
}

async function onManageConnectionClosed(apid, conn) {
    const rec = manageConnections[apid];
    if (!rec || rec.closing || rec.conn !== conn) {
        return;
    }
    Log(`Manage AMQP connection to access point ${apid} closed, reconnecting`);
    await deleteConnection(apid);
    setTimeout(() => {
        void reconcileBackboneConnections();
    }, UNEXPECTED_RECONNECT_DELAY_MS);
}

async function periodicCheck() {
    const normal_period = 30000;
    const startup_period = 2000;
    await reconcileBackboneConnections();
    setTimeout(periodicCheck, tls_cert ? normal_period : startup_period);
}

async function reconcileBackboneConnections() {
    const client = await ClientFromPool("system");
    try {
        await client.query("BEGIN");
        const result = await client.query(
            "SELECT *, InteriorSites.CoLocated FROM BackboneAccessPoints AS ap " +
                "JOIN InteriorSites ON InteriorSites.Id = ap.InteriorSite " +
                "WHERE ap.Lifecycle = 'ready' AND ap.Kind = 'manage'"
        );

        for (const apid of Object.keys(manageConnections)) {
            manageConnections[apid].toDelete = true;
        }

        for (const row of result.rows) {
            const existing = manageConnections[row.id];
            if (existing && connectionNeedsRefresh(existing, row)) {
                Log(`Manage access point ${row.id} endpoint changed, reconnecting AMQP`);
                await deleteConnection(row.id);
                try {
                    await createConnection(row.id, row);
                } catch (error) {
                    Log(`Failed to reconnect to manage access point ${row.id}: ${error.message}`);
                }
            } else if (existing) {
                existing.toDelete = false;
            } else {
                // Fire and forget individual connection promises to prevent a single
                // failure from blocking subsequent access points.
                createConnection(row.id, row);
            }
        }

        for (const apid of Object.keys(manageConnections)) {
            if (manageConnections[apid].toDelete) {
                await deleteConnection(apid);
            }
        }

        await client.query("COMMIT");
    } catch (err) {
        Log(`Rolling back reconcile-backbone-connections transaction: ${err.stack}`);
        await client.query("ROLLBACK");
    } finally {
        client.release();
    }
}

async function resolveTLSData(renewal = false) {
    let reschedule_delay = renewal ? -1 : 1000;
    const client = await ClientFromPool("system");
    try {
        await client.query("BEGIN");
        const result = await client.query(
            "SELECT * FROM ManagementControllers WHERE Name = $1 and LifeCycle = 'ready'",
            [controller_name]
        );
        if (result.rowCount == 1) {
            controller_certificate_id = result.rows[0].certificate;
            await loadManageClientTls(client);
            if (renewal) {
                await reconcileBackboneConnections();
            } else {
                reschedule_delay = -1;
                setTimeout(reconcileBackboneConnections, 0);
            }
        }
        await client.query("COMMIT");
    } catch (err) {
        Log(`Rolling back resolveTLSData transaction: ${err.stack}`);
        await client.query("ROLLBACK");
        if (!renewal) {
            reschedule_delay = 10000;
        }
    } finally {
        client.release();
        if (!renewal && reschedule_delay >= 0) {
            setTimeout(resolveTLSData, reschedule_delay);
        }
    }
}

async function resolveControllerRecord() {
    let reschedule_delay = -1;
    const client = await ClientFromPool("system");
    const notify = new NotifyTransaction();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT * FROM ManagementControllers WHERE Name = $1", [
            controller_name,
        ]);
        if (result.rowCount == 1) {
            setTimeout(resolveTLSData, 0);
        } else {
            const addResult = await client.query(
                "INSERT INTO ManagementControllers (Name) VALUES ($1) RETURNING Id",
                [controller_name]
            );
            notify.add("ManagementControllers", addResult.rows[0].id);
            setTimeout(resolveTLSData, 1000);
            Log(`No management controller found for '${controller_name}', created new record`);
        }
        await client.query("COMMIT");
        await notify.commit();
    } catch (err) {
        Log(`Rolling back resolveControllerRecord transaction: ${err.stack}`);
        await client.query("ROLLBACK");
        reschedule_delay = 10000;
    } finally {
        client.release();
        if (reschedule_delay >= 0) {
            setTimeout(resolveControllerRecord, reschedule_delay);
        }
    }
}

async function onAccessPointChange(action, id) {
    if ((action == "DELETE" || action == "UPDATE") && id in manageConnections) {
        await reconcileBackboneConnections();
    }
}

async function onTlsCertificateChange(action, id) {
    if (action != "ADD" || !tls_cert) {
        return;
    }
    const client = await ClientFromPool("system");
    let currentId;
    try {
        const result = await client.query(
            "SELECT Certificate FROM ManagementControllers WHERE Name = $1",
            [controller_name]
        );
        currentId = result.rows[0]?.certificate;
    } finally {
        client.release();
    }
    if (id != currentId) {
        return;
    }
    Log(`Management controller TLS certificate renewed (${id}), reloading AMQP connections`);
    for (const apid of Object.keys(manageConnections)) {
        await deleteConnection(apid);
    }
    controller_certificate_id = id;
    await resolveTLSData(true);
}

async function onManagementControllerChange(action, _id) {
    if (action != "UPDATE" || !tls_cert) {
        return;
    }
    const client = await ClientFromPool("system");
    let currentId;
    try {
        const result = await client.query(
            "SELECT Certificate FROM ManagementControllers WHERE Name = $1",
            [controller_name]
        );
        currentId = result.rows[0]?.certificate;
    } finally {
        client.release();
    }
    if (!currentId || currentId == controller_certificate_id) {
        return;
    }
    Log(`Management controller certificate changed, reloading AMQP connections`);
    for (const apid of Object.keys(manageConnections)) {
        await deleteConnection(apid);
    }
    controller_certificate_id = currentId;
    await resolveTLSData(true);
}

export async function RegisterHandler(onAdded, onDeleted) {
    for (const [key, value] of Object.entries(manageConnections)) {
        await onAdded(key, value.conn);
    }

    registrations.push({
        onLinkAdded: onAdded,
        onLinkDeleted: onDeleted,
    });
}

export async function Start(name) {
    Log(`[Backbone-links module starting for controller: ${name}]`);
    controller_name = name;
    await resolveControllerRecord();
    RegisterNotification("BackboneAccessPoints", onAccessPointChange, false);
    RegisterNotification("TlsCertificates", onTlsCertificateChange, false);
    RegisterNotification("ManagementControllers", onManagementControllerChange, false);
    setTimeout(periodicCheck, 5000);
}
