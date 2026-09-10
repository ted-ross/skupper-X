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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@vms/modules/kube", () => ({
    LoadSecret: vi.fn(),
}));

import { LoadSecret } from "@vms/modules/kube";
import {
    TLS_CERTIFICATE_PARENT_TABLES,
    timestampsEqual,
    expirationFromTlsSecret,
    joinPemBundle,
    loadCertificateRow,
    lockCurrentCertificate,
    lockCurrentCertificateByObjectName,
    isCertificateSuperseded,
    loadSupercedesChain,
    getTlsRotationMeta,
    retargetParentCertificateFks,
    listLiveChildren,
    hasLiveChildren,
    listCurrentLeafChildren,
    overlayDualTrustCa,
    deleteExpiredSupersededCertificates,
} from "./tls-rotation.js";

const TEST_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIDBzCCAe+gAwIBAgIUQN+/jWSwj02BdJAZsQlOzFf7zv0wDQYJKoZIhvcNAQEL
BQAwEzERMA8GA1UEAwwIdm1zLXRlc3QwHhcNMjYwOTA4MTkxOTA4WhcNMjYwOTA5
MTkxOTA4WjATMREwDwYDVQQDDAh2bXMtdGVzdDCCASIwDQYJKoZIhvcNAQEBBQAD
ggEPADCCAQoCggEBAJ11ugUkynmZLiuuILQ18OFN6b2o3/l7xFo3Yu+kPQuTWcF5
/CZnUHq/Ztvpemjx7oRdozKyRkxq79AIY0ZyVeNuaJkY12VjBdLs/JTVe6G1Uqi9
XMojzDCKLItI4khjkmuaeAOBHhfxr6YUy+2OuGY+MxwHuNtkPPmhDF33Um+dGr/d
NcrHlXqGnQq82R5LcB8erhKQ4cJJKAc1vn9UvuO03PXPtvVTRHwbW8Xk+INbQ2t2
w1IWKljDIiALzrPFapmZT5RZMp5XSDtsHxuSTP+BunWQEOk7LsKWy9qe6X+nIInO
qQgtx58EZk12Mw+KZzaF9h4oDkzWjLBAGUXBtdUCAwEAAaNTMFEwHQYDVR0OBBYE
FAt+XxV2e7PKYODezuZVfHWNhNMxMB8GA1UdIwQYMBaAFAt+XxV2e7PKYODezuZV
fHWNhNMxMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAIyc4w1J
AAjpbdd2NjzBg3ZxaC1LycLicaTuB11CgQWa1vsvHDtfZk71TTn6fD3MFKw7f7IQ
kn1YZXMyOtG0tMAR64OE/eYigk4bIP985e8HDb2v/AarNJdRF8Go572l0te6dur1
ZLE6HJlzCgdombHSHxjBa2UTQwmTiNpDIFkZQUPfR0Rw5/C/ek22LH8rJg0cjFa8
hSRGq6AVAGOWVncdSnPmdHOf+m4GXoHUw5cd5YwVb9AzFSP3JXTXwK7aUyDFepAa
GaaHeyOP2mW2NluntZRJ9ui7GVMugHZ/oVzNWnpYj/MIiZgUjwK/cRnmCrW7rzjU
91T2XxO7Av/VcMQ=
-----END CERTIFICATE-----
`;

function certRow(overrides = {}) {
    return {
        id: "cert-1",
        isca: false,
        objectname: "tls-cert-1",
        signedby: "ca-1",
        expiration: new Date("2099-01-01T00:00:00Z"),
        renewaltime: new Date("2098-01-01T00:00:00Z"),
        rotationordinal: 0,
        supercedes: null,
        label: "test",
        ...overrides,
    };
}

function createClient(handler) {
    return {
        query: vi.fn(async (sql, params) => handler(sql, params ?? [])),
    };
}

describe("timestampsEqual", () => {
    it("treats missing values as equal only when both are absent", () => {
        expect(timestampsEqual(null, undefined)).toBe(true);
        expect(timestampsEqual(new Date("2026-01-01"), null)).toBe(false);
        expect(timestampsEqual(null, new Date("2026-01-01"))).toBe(false);
    });

    it("compares instants regardless of Date vs string form", () => {
        const instant = "2026-09-08T12:00:00.000Z";
        expect(timestampsEqual(new Date(instant), instant)).toBe(true);
        expect(timestampsEqual(new Date(instant), "2026-09-08T12:00:01.000Z")).toBe(false);
    });
});

describe("expirationFromTlsSecret", () => {
    it("returns undefined when tls.crt is missing or not a certificate PEM", () => {
        expect(expirationFromTlsSecret(undefined)).toBeUndefined();
        expect(expirationFromTlsSecret({ data: {} })).toBeUndefined();
        expect(
            expirationFromTlsSecret({
                data: { "tls.crt": Buffer.from("not-a-cert").toString("base64") },
            })
        ).toBeUndefined();
        expect(
            expirationFromTlsSecret({
                data: {
                    "tls.crt": Buffer.from("-----BEGIN CERTIFICATE-----\nbad").toString("base64"),
                },
            })
        ).toBeUndefined();
    });

    it("parses notAfter from a TLS secret certificate", () => {
        const expiration = expirationFromTlsSecret({
            data: { "tls.crt": Buffer.from(TEST_CERT_PEM).toString("base64") },
        });
        expect(expiration).toBeInstanceOf(Date);
        expect(expiration.toISOString()).toBe("2026-09-09T19:19:08.000Z");
    });
});

describe("joinPemBundle", () => {
    it("returns an empty string when there are no PEM parts", () => {
        expect(joinPemBundle()).toBe("");
        expect(joinPemBundle(["", "  "])).toBe("");
    });

    it("joins trimmed PEMs with a trailing newline", () => {
        expect(joinPemBundle(["aaa\n", " bbb "])).toBe("aaa\nbbb\n");
    });
});

describe("certificate row helpers", () => {
    it("loadCertificateRow and lockCurrentCertificate return undefined without an id", async () => {
        const client = createClient(() => ({ rows: [] }));
        expect(await loadCertificateRow(client, null)).toBeUndefined();
        expect(await lockCurrentCertificate(client, "")).toBeUndefined();
        expect(client.query).not.toHaveBeenCalled();
    });

    it("loadCertificateRow selects the matching row", async () => {
        const row = certRow();
        const client = createClient(() => ({ rows: [row] }));
        expect(await loadCertificateRow(client, "cert-1")).toEqual(row);
        expect(client.query).toHaveBeenCalledWith(expect.stringContaining("WHERE Id = $1"), [
            "cert-1",
        ]);
        expect(client.query.mock.calls[0][0]).not.toContain("FOR UPDATE");
    });

    it("lockCurrentCertificate locks the row for update", async () => {
        const row = certRow({ id: "cert-2" });
        const client = createClient(() => ({ rows: [row] }));
        expect(await lockCurrentCertificate(client, "cert-2")).toEqual(row);
        expect(client.query).toHaveBeenCalledWith(expect.stringContaining("FOR UPDATE"), [
            "cert-2",
        ]);
    });

    it("lockCurrentCertificateByObjectName returns undefined without a name", async () => {
        const client = createClient(() => ({ rows: [] }));
        expect(await lockCurrentCertificateByObjectName(client, "")).toBeUndefined();
        expect(client.query).not.toHaveBeenCalled();
    });

    it("lockCurrentCertificateByObjectName selects the current tip by object name", async () => {
        const row = certRow({ rotationordinal: 3 });
        const client = createClient(() => ({ rows: [row] }));
        expect(await lockCurrentCertificateByObjectName(client, "tls-cert-1")).toEqual(row);
        expect(client.query).toHaveBeenCalledWith(expect.stringContaining("c.ObjectName = $1"), [
            "tls-cert-1",
        ]);
        expect(client.query.mock.calls[0][0]).toContain("FOR UPDATE");
    });
});

describe("isCertificateSuperseded", () => {
    it("returns false when there is no id or no successor", async () => {
        const client = createClient(() => ({ rowCount: 0, rows: [] }));
        expect(await isCertificateSuperseded(client, null)).toBe(false);
        expect(await isCertificateSuperseded(client, "cert-1")).toBe(false);
    });

    it("returns true when a successor row exists", async () => {
        const client = createClient(() => ({ rowCount: 1, rows: [{ "?column?": 1 }] }));
        expect(await isCertificateSuperseded(client, "cert-1")).toBe(true);
    });
});

describe("loadSupercedesChain", () => {
    it("walks predecessor ids and stops on cycles", async () => {
        const rows = {
            "cert-new": certRow({ id: "cert-new", supercedes: "cert-old", rotationordinal: 1 }),
            "cert-old": certRow({ id: "cert-old", supercedes: "cert-new", rotationordinal: 0 }),
        };
        const client = createClient((sql, params) => ({
            rows: rows[params[0]] ? [rows[params[0]]] : [],
        }));

        const chain = await loadSupercedesChain(client, "cert-new");
        expect(chain.map((row) => row.id)).toEqual(["cert-new", "cert-old"]);
    });

    it("stops when a predecessor row is missing", async () => {
        const client = createClient((sql, params) => {
            if (params[0] === "cert-new") {
                return {
                    rows: [certRow({ id: "cert-new", supercedes: "missing" })],
                };
            }
            return { rows: [] };
        });
        const chain = await loadSupercedesChain(client, "cert-new");
        expect(chain).toHaveLength(1);
        expect(chain[0].id).toBe("cert-new");
    });
});

describe("getTlsRotationMeta", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("returns zeros when the certificate is unknown", async () => {
        const client = createClient(() => ({ rows: [] }));
        expect(await getTlsRotationMeta(client, "missing")).toEqual({ ordinal: 0, lastValid: 0 });
    });

    it("uses the lowest unexpired rotation ordinal as lastValid", async () => {
        const rows = {
            "cert-new": certRow({
                id: "cert-new",
                supercedes: "cert-old",
                rotationordinal: 2,
                expiration: new Date("2099-01-01T00:00:00Z"),
            }),
            "cert-old": certRow({
                id: "cert-old",
                supercedes: null,
                rotationordinal: 1,
                expiration: new Date("2099-01-01T00:00:00Z"),
            }),
        };
        const client = createClient((sql, params) => ({
            rows: rows[params[0]] ? [rows[params[0]]] : [],
        }));
        expect(await getTlsRotationMeta(client, "cert-new")).toEqual({
            ordinal: 2,
            lastValid: 1,
        });
    });

    it("falls back to the current ordinal when every predecessor has expired", async () => {
        const rows = {
            "cert-new": certRow({
                id: "cert-new",
                supercedes: "cert-old",
                rotationordinal: 2,
                expiration: new Date("2099-01-01T00:00:00Z"),
            }),
            "cert-old": certRow({
                id: "cert-old",
                supercedes: null,
                rotationordinal: 1,
                expiration: new Date("2020-01-01T00:00:00Z"),
            }),
        };
        const client = createClient((sql, params) => ({
            rows: rows[params[0]] ? [rows[params[0]]] : [],
        }));
        expect(await getTlsRotationMeta(client, "cert-new")).toEqual({
            ordinal: 2,
            lastValid: 2,
        });
    });

    it("treats a missing expiration as still valid", async () => {
        const client = createClient(() => ({
            rows: [certRow({ rotationordinal: 4, expiration: null, supercedes: null })],
        }));
        expect(await getTlsRotationMeta(client, "cert-1")).toEqual({
            ordinal: 4,
            lastValid: 4,
        });
    });
});

describe("retargetParentCertificateFks", () => {
    it("updates every parent table and notifies changed rows", async () => {
        const notify = { update: vi.fn() };
        const client = createClient((sql) => {
            if (sql.includes("InteriorSites")) {
                return { rows: [{ id: "site-1" }] };
            }
            return { rows: [] };
        });

        await retargetParentCertificateFks(client, notify, "old-id", "new-id");

        expect(client.query).toHaveBeenCalledTimes(TLS_CERTIFICATE_PARENT_TABLES.length);
        for (const table of TLS_CERTIFICATE_PARENT_TABLES) {
            expect(client.query).toHaveBeenCalledWith(
                `UPDATE ${table} SET Certificate = $1 WHERE Certificate = $2 RETURNING Id`,
                ["new-id", "old-id"]
            );
        }
        expect(notify.update).toHaveBeenCalledWith("InteriorSites", "site-1");
        expect(notify.update).toHaveBeenCalledTimes(1);
    });
});

describe("live children", () => {
    it("listLiveChildren returns current children of a CA", async () => {
        const children = [certRow({ id: "leaf-1" }), certRow({ id: "ca-child", isca: true })];
        const client = createClient(() => ({ rows: children }));
        expect(await listLiveChildren(client, "ca-1")).toEqual(children);
        expect(client.query).toHaveBeenCalledWith(expect.stringContaining("SignedBy = $1"), [
            "ca-1",
        ]);
    });

    it("hasLiveChildren is true when rowCount or rows are present", async () => {
        const byCount = createClient(() => ({ rowCount: 1, rows: [] }));
        const byRows = createClient(() => ({ rowCount: 0, rows: [certRow()] }));
        const empty = createClient(() => ({ rowCount: 0, rows: [] }));
        expect(await hasLiveChildren(byCount, "ca-1")).toBe(true);
        expect(await hasLiveChildren(byRows, "ca-1")).toBe(true);
        expect(await hasLiveChildren(empty, "ca-1")).toBe(false);
    });

    it("listCurrentLeafChildren omits CA children", async () => {
        const client = createClient(() => ({
            rows: [certRow({ id: "leaf-1", isca: false }), certRow({ id: "ca-child", isca: true })],
        }));
        const leaves = await listCurrentLeafChildren(client, "ca-1");
        expect(leaves.map((row) => row.id)).toEqual(["leaf-1"]);
    });
});

describe("overlayDualTrustCa", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns the original secret data when overlay is not applicable", async () => {
        const data = { "ca.crt": "old" };
        expect(await overlayDualTrustCa(null, "cert-1", data)).toBe(data);
        expect(await overlayDualTrustCa({ query: vi.fn() }, null, data)).toBe(data);
        expect(await overlayDualTrustCa({ query: vi.fn() }, "cert-1", null)).toBe(null);

        const missing = createClient(() => ({ rows: [] }));
        expect(await overlayDualTrustCa(missing, "cert-1", data)).toBe(data);
    });

    it("bundles old and new CA PEMs while the predecessor still has live children", async () => {
        const oldPem = "-----BEGIN CERTIFICATE-----\nold-ca\n-----END CERTIFICATE-----";
        const newPem = "-----BEGIN CERTIFICATE-----\nnew-ca\n-----END CERTIFICATE-----";
        const leaf = certRow({ id: "leaf-1", isca: false, signedby: "ca-new" });
        const newCa = certRow({
            id: "ca-new",
            isca: true,
            objectname: "new-ca",
            supercedes: "ca-old",
            signedby: null,
        });
        const oldCa = certRow({
            id: "ca-old",
            isca: true,
            objectname: "old-ca",
            supercedes: null,
        });
        const client = createClient((sql, params) => {
            if (sql.includes("WHERE Id = $1")) {
                const rows = { "leaf-1": leaf, "ca-new": newCa, "ca-old": oldCa };
                return { rows: rows[params[0]] ? [rows[params[0]]] : [] };
            }
            if (sql.includes("SignedBy = $1")) {
                return { rowCount: 1, rows: [certRow({ id: "still-on-old" })] };
            }
            return { rows: [], rowCount: 0 };
        });
        LoadSecret.mockImplementation(async (name) => {
            const pems = { "old-ca": oldPem, "new-ca": newPem };
            return { data: { "tls.crt": Buffer.from(pems[name]).toString("base64") } };
        });

        const overlaid = await overlayDualTrustCa(client, "leaf-1", {
            "ca.crt": "leaf-ca",
            "tls.crt": "leaf-crt",
        });

        expect(overlaid["tls.crt"]).toBe("leaf-crt");
        expect(Buffer.from(overlaid["ca.crt"], "base64").toString("utf-8")).toBe(
            joinPemBundle([oldPem, newPem])
        );
        expect(LoadSecret).toHaveBeenCalledWith("old-ca");
        expect(LoadSecret).toHaveBeenCalledWith("new-ca");
    });

    it("does not overlay when the predecessor has no live children", async () => {
        const leaf = certRow({ id: "leaf-1", signedby: "ca-new" });
        const newCa = certRow({
            id: "ca-new",
            isca: true,
            objectname: "new-ca",
            supercedes: "ca-old",
        });
        const oldCa = certRow({ id: "ca-old", objectname: "old-ca" });
        const client = createClient((sql, params) => {
            if (sql.includes("WHERE Id = $1")) {
                const rows = { "leaf-1": leaf, "ca-new": newCa, "ca-old": oldCa };
                return { rows: rows[params[0]] ? [rows[params[0]]] : [] };
            }
            return { rowCount: 0, rows: [] };
        });
        const data = { "ca.crt": "leaf-ca" };
        expect(await overlayDualTrustCa(client, "leaf-1", data)).toBe(data);
        expect(LoadSecret).not.toHaveBeenCalled();
    });
});

describe("deleteExpiredSupersededCertificates", () => {
    it("deletes expired predecessors and returns unique object names", async () => {
        const notify = { delete: vi.fn() };
        const client = createClient((sql) => {
            if (sql.includes("Expiration < CURRENT_TIMESTAMP")) {
                return {
                    rows: [
                        { id: "old-1", objectname: "shared-secret" },
                        { id: "old-2", objectname: "shared-secret" },
                        { id: "old-3", objectname: null },
                    ],
                };
            }
            return { rows: [], rowCount: 1 };
        });

        const names = await deleteExpiredSupersededCertificates(client, notify);

        expect(names).toEqual(["shared-secret"]);
        expect(client.query).toHaveBeenCalledWith(
            "UPDATE TlsCertificates SET Supercedes = NULL WHERE Supercedes = $1",
            ["old-1"]
        );
        expect(client.query).toHaveBeenCalledWith("DELETE FROM TlsCertificates WHERE Id = $1", [
            "old-1",
        ]);
        expect(client.query).toHaveBeenCalledWith("DELETE FROM TlsCertificates WHERE Id = $1", [
            "old-2",
        ]);
        expect(client.query).toHaveBeenCalledWith("DELETE FROM TlsCertificates WHERE Id = $1", [
            "old-3",
        ]);
        expect(notify.delete).toHaveBeenCalledWith("TlsCertificates", "old-1");
        expect(notify.delete).toHaveBeenCalledTimes(3);
    });
});
