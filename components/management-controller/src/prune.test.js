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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { META_ANNOTATION_VMS_CONTROLLED } from "@vms/modules/common";

const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
};

vi.mock("./db.js", () => ({
    ClientFromPool: vi.fn(async () => mockClient),
}));

vi.mock("./notify.js", () => ({
    NotifyTransaction: class {
        delete = vi.fn();
        async commit() {}
    },
}));

vi.mock("@vms/modules/kube", () => ({
    GetIssuers: vi.fn(async () => []),
    GetCertificates: vi.fn(async () => []),
    GetSecrets: vi.fn(async () => []),
    DeleteIssuer: vi.fn(),
    DeleteCertificate: vi.fn(),
    DeleteSecret: vi.fn(),
}));

vi.mock("./sync-management.js", () => ({
    SiteCertificateChanged: vi.fn(),
    AccessCertificateChanged: vi.fn(),
}));

vi.mock("./colo-sync.js", () => ({
    SyncColoTlsCertificate: vi.fn(),
}));

import { DeleteOrphanCertificates, Start } from "./prune.js";
import {
    GetIssuers,
    GetCertificates,
    GetSecrets,
    DeleteIssuer,
    DeleteCertificate,
    DeleteSecret,
} from "@vms/modules/kube";
import { SiteCertificateChanged, AccessCertificateChanged } from "./sync-management.js";
import { SyncColoTlsCertificate } from "./colo-sync.js";

function transactionSql(sql) {
    return sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK";
}

describe("DeleteOrphanCertificates", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockClient.query.mockImplementation(async (sql) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("Expiration < CURRENT_TIMESTAMP")) {
                return { rows: [] };
            }
            if (sql.includes("SELECT Id, SignedBy, Supercedes FROM TlsCertificates")) {
                return { rows: [{ id: "orphan-cert", signedby: null, supercedes: null }] };
            }
            if (sql.includes("SELECT Id, Certificate FROM")) {
                return { rows: [] };
            }
            if (sql.startsWith("DELETE FROM TlsCertificates")) {
                return { rowCount: 1 };
            }
            return { rows: [] };
        });
    });

    it("deletes tls certificates not referenced by other tables", async () => {
        await DeleteOrphanCertificates();

        expect(mockClient.query).toHaveBeenCalledWith("DELETE FROM TlsCertificates WHERE Id = $1", [
            "orphan-cert",
        ]);
        expect(mockClient.release).toHaveBeenCalled();
    });

    it("keeps certificates that are still referenced as rotation predecessors", async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("Expiration < CURRENT_TIMESTAMP")) {
                return { rows: [] };
            }
            if (sql.includes("SELECT Id, SignedBy, Supercedes FROM TlsCertificates")) {
                return {
                    rows: [
                        { id: "old-cert", signedby: null, supercedes: null },
                        { id: "new-cert", signedby: null, supercedes: "old-cert" },
                    ],
                };
            }
            if (sql.includes("SELECT Id, Certificate FROM InteriorSites")) {
                return { rows: [{ id: "site-1", certificate: "new-cert" }] };
            }
            if (sql.includes("SELECT Id, Certificate FROM")) {
                return { rows: [] };
            }
            return { rows: [] };
        });

        await DeleteOrphanCertificates();

        expect(mockClient.query).not.toHaveBeenCalledWith(
            "DELETE FROM TlsCertificates WHERE Id = $1",
            ["old-cert"]
        );
        expect(mockClient.query).not.toHaveBeenCalledWith(
            "DELETE FROM TlsCertificates WHERE Id = $1",
            ["new-cert"]
        );
    });

    it("deletes expired superseded certificates before orphan detection", async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("Expiration < CURRENT_TIMESTAMP")) {
                return { rows: [{ id: "expired-old", objectname: "tls-site" }] };
            }
            if (sql.includes("SELECT Id, SignedBy, Supercedes FROM TlsCertificates")) {
                return { rows: [{ id: "current-cert", signedby: null, supercedes: null }] };
            }
            if (sql.includes("SELECT Id, Certificate FROM InteriorSites")) {
                return { rows: [{ id: "site-1", certificate: "current-cert" }] };
            }
            if (sql.includes("SELECT Id, Certificate FROM")) {
                return { rows: [] };
            }
            return { rows: [], rowCount: 1 };
        });

        const expiredNames = await DeleteOrphanCertificates();

        expect(expiredNames).toEqual(["tls-site"]);
        expect(mockClient.query).toHaveBeenCalledWith(
            "UPDATE TlsCertificates SET Supercedes = NULL WHERE Supercedes = $1",
            ["expired-old"]
        );
        expect(mockClient.query).toHaveBeenCalledWith("DELETE FROM TlsCertificates WHERE Id = $1", [
            "expired-old",
        ]);
    });
});

describe("Start", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockClient.query.mockImplementation(async (sql) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("Expiration < CURRENT_TIMESTAMP")) {
                return { rows: [{ id: "expired-old", objectname: "tls-site" }] };
            }
            if (sql.includes("SELECT Id, SignedBy, Supercedes FROM TlsCertificates")) {
                return { rows: [{ id: "current-cert", signedby: null, supercedes: null }] };
            }
            if (sql.includes("SELECT Id, Certificate FROM InteriorSites")) {
                return { rows: [{ id: "site-1", certificate: "current-cert" }] };
            }
            if (sql.includes("SELECT ObjectName FROM TlsCertificates")) {
                return { rows: [{ objectname: "keep-me" }] };
            }
            if (sql.includes("SELECT c.Id FROM TlsCertificates c")) {
                return { rows: [{ id: "current-cert" }] };
            }
            if (sql.includes("SELECT Id, Certificate FROM")) {
                return { rows: [] };
            }
            return { rows: [], rowCount: 1 };
        });
        GetIssuers.mockResolvedValue([
            {
                metadata: {
                    name: "orphan-issuer",
                    annotations: { [META_ANNOTATION_VMS_CONTROLLED]: "true" },
                },
            },
            {
                metadata: {
                    name: "keep-me",
                    annotations: { [META_ANNOTATION_VMS_CONTROLLED]: "true" },
                },
            },
        ]);
        GetCertificates.mockResolvedValue([
            {
                metadata: {
                    name: "orphan-cert",
                    annotations: { [META_ANNOTATION_VMS_CONTROLLED]: "true" },
                },
            },
        ]);
        GetSecrets.mockResolvedValue([
            {
                metadata: {
                    name: "orphan-secret",
                    annotations: { [META_ANNOTATION_VMS_CONTROLLED]: "true" },
                },
            },
        ]);
        DeleteIssuer.mockRejectedValueOnce(new Error("issuer busy"));
    });

    it("reconciles kube objects and advertises lastValid after expired predecessor deletion", async () => {
        await Start();

        expect(DeleteIssuer).toHaveBeenCalledWith("orphan-issuer");
        expect(DeleteIssuer).not.toHaveBeenCalledWith("keep-me");
        expect(DeleteCertificate).toHaveBeenCalledWith("orphan-cert");
        expect(DeleteSecret).toHaveBeenCalledWith("orphan-secret");
        expect(SiteCertificateChanged).toHaveBeenCalledWith("current-cert");
        expect(AccessCertificateChanged).toHaveBeenCalledWith("current-cert");
        expect(SyncColoTlsCertificate).toHaveBeenCalledWith("current-cert");
    });
});
