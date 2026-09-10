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

import { X509Certificate } from "node:crypto";
import { LoadSecret } from "@vms/modules/kube";

export const TLS_CERTIFICATE_PARENT_TABLES = [
    "ManagementControllers",
    "Backbones",
    "BackboneAccessPoints",
    "InteriorSites",
    "ApplicationNetworks",
    "NetworkCredentials",
    "MemberInvitations",
    "MemberSites",
];

const CERT_SELECT =
    "Id, IsCA, ObjectName, SignedBy, Expiration, RenewalTime, RotationOrdinal, Supercedes, Label";

const LIVE_CHILDREN_SQL =
    "SELECT Id, ObjectName, IsCA, SignedBy, Expiration, RenewalTime, RotationOrdinal, Label " +
    "FROM TlsCertificates " +
    "WHERE SignedBy = $1 " +
    "AND NOT EXISTS (SELECT 1 FROM TlsCertificates newer WHERE newer.Supercedes = TlsCertificates.Id)";

export function timestampsEqual(left, right) {
    if (!left && !right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return new Date(left).getTime() === new Date(right).getTime();
}

export function expirationFromTlsSecret(secret) {
    const encoded = secret?.data?.["tls.crt"];
    if (!encoded) {
        return undefined;
    }
    try {
        const pem = Buffer.from(encoded, "base64").toString("utf-8");
        if (!pem.includes("BEGIN CERTIFICATE")) {
            return undefined;
        }
        const x509 = new X509Certificate(pem);
        return new Date(x509.validToDate ?? x509.validTo);
    } catch {
        return undefined;
    }
}

export function joinPemBundle(pems) {
    const parts = (pems || []).map((pem) => (pem || "").trim()).filter(Boolean);
    if (parts.length == 0) {
        return "";
    }
    return `${parts.join("\n")}\n`;
}

export async function loadCertificateRow(client, certId) {
    if (!certId) {
        return undefined;
    }
    const result = await client.query(`SELECT ${CERT_SELECT} FROM TlsCertificates WHERE Id = $1`, [
        certId,
    ]);
    return result.rows[0];
}

export async function lockCurrentCertificate(client, certId) {
    if (!certId) {
        return undefined;
    }
    const result = await client.query(
        `SELECT ${CERT_SELECT} FROM TlsCertificates WHERE Id = $1 FOR UPDATE`,
        [certId]
    );
    return result.rows[0];
}

export async function lockCurrentCertificateByObjectName(client, objectName) {
    if (!objectName) {
        return undefined;
    }
    const result = await client.query(
        `SELECT ${CERT_SELECT} FROM TlsCertificates c ` +
            "WHERE c.ObjectName = $1 " +
            "AND NOT EXISTS (SELECT 1 FROM TlsCertificates s WHERE s.Supercedes = c.Id) " +
            "ORDER BY c.RotationOrdinal DESC LIMIT 1 FOR UPDATE",
        [objectName]
    );
    return result.rows[0];
}

export async function isCertificateSuperseded(client, certId) {
    if (!certId) {
        return false;
    }
    const result = await client.query("SELECT 1 FROM TlsCertificates WHERE Supercedes = $1", [
        certId,
    ]);
    return result.rowCount > 0;
}

export async function loadSupercedesChain(client, certId) {
    const chain = [];
    const seen = new Set();
    let id = certId;
    while (id && !seen.has(id)) {
        seen.add(id);
        const row = await loadCertificateRow(client, id);
        if (!row) {
            break;
        }
        chain.push(row);
        id = row.supercedes;
    }
    return chain;
}

export async function getTlsRotationMeta(client, certId) {
    const chain = await loadSupercedesChain(client, certId);
    if (chain.length == 0) {
        return { ordinal: 0, lastValid: 0 };
    }
    const ordinal = chain[0].rotationordinal ?? 0;
    let lastValid = null;
    const now = Date.now();
    for (const row of chain) {
        const rotationOrdinal = row.rotationordinal ?? 0;
        const expirationMs = row.expiration ? new Date(row.expiration).getTime() : null;
        if (expirationMs == null || expirationMs > now) {
            if (lastValid == null || rotationOrdinal < lastValid) {
                lastValid = rotationOrdinal;
            }
        }
    }
    if (lastValid == null) {
        lastValid = ordinal;
    }
    return { ordinal, lastValid };
}

export async function retargetParentCertificateFks(client, notify, oldId, newId) {
    for (const table of TLS_CERTIFICATE_PARENT_TABLES) {
        const updated = await client.query(
            `UPDATE ${table} SET Certificate = $1 WHERE Certificate = $2 RETURNING Id`,
            [newId, oldId]
        );
        for (const row of updated.rows) {
            notify.update(table, row.id);
        }
    }
}

export async function listLiveChildren(client, caId) {
    const result = await client.query(LIVE_CHILDREN_SQL, [caId]);
    return result.rows;
}

export async function hasLiveChildren(client, caId) {
    const result = await client.query(`${LIVE_CHILDREN_SQL} LIMIT 1`, [caId]);
    return result.rowCount > 0 || result.rows.length > 0;
}

export async function listCurrentLeafChildren(client, caId) {
    const children = await listLiveChildren(client, caId);
    return children.filter((child) => !child.isca);
}

async function pemFromCaSecret(objectName) {
    const secret = await LoadSecret(objectName);
    const encoded = secret?.data?.["tls.crt"];
    if (!encoded) {
        return null;
    }
    return Buffer.from(encoded, "base64").toString("utf-8");
}

export async function overlayDualTrustCa(client, certId, secretData) {
    if (!client || !certId || !secretData) {
        return secretData;
    }
    const cert = await loadCertificateRow(client, certId);
    if (!cert) {
        return secretData;
    }
    const issuerId = cert.isca ? cert.id : cert.signedby;
    if (!issuerId) {
        return secretData;
    }
    const issuer = await loadCertificateRow(client, issuerId);
    if (!issuer) {
        return secretData;
    }

    let oldName;
    let newName;
    if (issuer.supercedes) {
        const predecessor = await loadCertificateRow(client, issuer.supercedes);
        if (predecessor && predecessor.objectname !== issuer.objectname) {
            if (await hasLiveChildren(client, predecessor.id)) {
                oldName = predecessor.objectname;
                newName = issuer.objectname;
            }
        }
    }
    if (!oldName || !newName || oldName === newName) {
        return secretData;
    }

    const pems = [];
    for (const name of [oldName, newName]) {
        const pem = await pemFromCaSecret(name);
        if (pem) {
            pems.push(pem);
        }
    }
    if (pems.length < 2) {
        return secretData;
    }
    return {
        ...secretData,
        "ca.crt": Buffer.from(joinPemBundle(pems), "utf-8").toString("base64"),
    };
}

export async function deleteExpiredSupersededCertificates(client, notify) {
    const expired = await client.query(
        "SELECT c.Id, c.ObjectName FROM TlsCertificates c " +
            "WHERE c.Expiration IS NOT NULL AND c.Expiration < CURRENT_TIMESTAMP " +
            "AND EXISTS (SELECT 1 FROM TlsCertificates newer WHERE newer.Supercedes = c.Id) " +
            "AND NOT EXISTS (SELECT 1 FROM TlsCertificates child WHERE child.SignedBy = c.Id) " +
            "AND NOT EXISTS (SELECT 1 FROM TlsClientRevocations r WHERE r.CertificateId = c.Id) " +
            "ORDER BY c.RotationOrdinal ASC"
    );
    const objectNames = [];
    const seen = new Set();
    for (const row of expired.rows) {
        await client.query("UPDATE TlsCertificates SET Supercedes = NULL WHERE Supercedes = $1", [
            row.id,
        ]);
        await client.query("DELETE FROM TlsCertificates WHERE Id = $1", [row.id]);
        notify.delete("TlsCertificates", row.id);
        if (row.objectname && !seen.has(row.objectname)) {
            seen.add(row.objectname);
            objectNames.push(row.objectname);
        }
    }
    return objectNames;
}
