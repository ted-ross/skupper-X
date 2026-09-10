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

const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
};

/** @type {Record<string, Function>} */
const notificationHandlers = {};

/** @type {Array<{ method: string, table: string, id: string }>} */
const notifyEvents = [];

vi.mock("@vms/modules/kube", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        ApplyObject: vi.fn(),
        LoadCertificate: vi.fn(),
        LoadSecret: vi.fn(),
        ReplaceCertificate: vi.fn(),
        ReplaceSecret: vi.fn(),
        TriggerCertificateRenewal: vi.fn(),
        WatchSecrets: vi.fn(),
        WatchCertificates: vi.fn(),
        GetIssuers: vi.fn(async () => []),
    };
});

vi.mock("./config.js", () => ({
    BackboneExpiration: vi.fn(() => ({ years: 1 })),
    DefaultCaExpiration: vi.fn(() => ({ days: 30 })),
    DefaultCertExpiration: vi.fn(() => ({ days: 7 })),
    SiteControllerImage: vi.fn(() => "quay.io/skupper/vms-site-controller:latest"),
    RootIssuer: vi.fn(() => "vms-root"),
    CertOrganization: vi.fn(() => "enterprise.com"),
}));

vi.mock("./sync-management.js", () => ({
    SiteCertificateChanged: vi.fn(),
    AccessCertificateChanged: vi.fn(),
}));

vi.mock("./claim-server.js", () => ({
    CompleteMember: vi.fn(),
}));

vi.mock("./colo-sync.js", () => ({
    SyncColoTlsCertificate: vi.fn(),
}));

vi.mock("./site-deployment-state.js", () => ({
    AccessPointCertReady: vi.fn(),
    SiteLifecycleChanged_TX: vi.fn(),
}));

vi.mock("./watch-server.js", () => ({
    WatchNotify: vi.fn(),
}));

vi.mock("./db.js", () => ({
    ClientFromPool: vi.fn(async () => mockClient),
    IntervalMilliseconds: vi.fn(() => 3600000),
}));

vi.mock("./notify.js", () => ({
    RegisterNotification: vi.fn((tableName, handler) => {
        notificationHandlers[tableName] = handler;
    }),
    NotifyTransaction: class {
        add(table, id) {
            notifyEvents.push({ method: "add", table, id });
        }
        update(table, id) {
            notifyEvents.push({ method: "update", table, id });
        }
        delete(table, id) {
            notifyEvents.push({ method: "delete", table, id });
        }
        async commit() {}
    },
}));

import { Start, RotateCertificate } from "./certs.js";
import { RegisterNotification } from "./notify.js";
import {
    ApplyObject,
    LoadCertificate,
    TriggerCertificateRenewal,
    WatchSecrets,
    WatchCertificates,
} from "@vms/modules/kube";
import { IntervalMilliseconds } from "./db.js";
import { DefaultCaExpiration, DefaultCertExpiration } from "./config.js";
import { META_ANNOTATION_VMS_CONTROLLED } from "@vms/modules/common";
import { AccessCertificateChanged, SiteCertificateChanged } from "./sync-management.js";
import { SyncColoTlsCertificate } from "./colo-sync.js";
import { TEST_UUIDS } from "./test-helpers/mock-db.js";

function transactionSql(sql) {
    return sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK";
}

function certificateRequestInserts() {
    return mockClient.query.mock.calls.filter(([sql]) =>
        typeof sql === "string" ? sql.includes("INSERT INTO CertificateRequests") : false
    );
}

function mockCaRotationQueries({
    backboneId,
    van,
    pending = false,
    insertId = "cr-rotate-van",
    signedby = "bb-ca",
} = {}) {
    mockClient.query.mockImplementation(async (sql) => {
        if (transactionSql(sql)) {
            return {};
        }
        if (sql.includes("SELECT Id, ObjectName, IsCA FROM TlsCertificates")) {
            return {
                rowCount: 1,
                rows: [{ id: TEST_UUIDS.cert, objectname: "ca-cert", isca: true }],
            };
        }
        if (sql.includes("FOR UPDATE")) {
            return {
                rows: [{ id: TEST_UUIDS.cert, isca: true, signedby }],
            };
        }
        if (sql.includes("SELECT 1 FROM TlsCertificates WHERE Supercedes")) {
            return { rowCount: 0, rows: [] };
        }
        if (sql.includes("FROM CertificateRequests WHERE Supercedes")) {
            return pending
                ? { rowCount: 1, rows: [{ id: "cr-pending" }] }
                : { rowCount: 0, rows: [] };
        }
        if (sql.includes("FROM Backbones WHERE Certificate")) {
            return backboneId
                ? { rowCount: 1, rows: [{ id: backboneId }] }
                : { rowCount: 0, rows: [] };
        }
        if (sql.includes("AS bbca")) {
            return van ? { rowCount: 1, rows: [van] } : { rowCount: 0, rows: [] };
        }
        if (sql.includes("INSERT INTO CertificateRequests")) {
            return { rows: [{ id: insertId }] };
        }
        return { rowCount: 0, rows: [] };
    });
}

function controlledTlsSecret(name, dblink, issuerlink = "ca-1") {
    return {
        metadata: {
            name,
            annotations: {
                [META_ANNOTATION_VMS_CONTROLLED]: "true",
                "skupper.io/vms-dblink": dblink,
                "skupper.io/vms-issuerlink": issuerlink,
            },
        },
        data: { "tls.crt": "cert" },
    };
}

describe("certs Start", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
        notifyEvents.length = 0;
        for (const key of Object.keys(notificationHandlers)) {
            delete notificationHandlers[key];
        }
    });

    it("registers notification handlers for certificate lifecycle tables", async () => {
        await Start();

        expect(RegisterNotification).toHaveBeenCalledWith(
            "ManagementControllers",
            expect.any(Function),
            true
        );
        expect(RegisterNotification).toHaveBeenCalledWith("Backbones", expect.any(Function), true);
        expect(RegisterNotification).toHaveBeenCalledWith(
            "BackboneAccessPoints",
            expect.any(Function),
            true
        );
        expect(RegisterNotification).toHaveBeenCalledWith(
            "ApplicationNetworks",
            expect.any(Function),
            true
        );
        expect(RegisterNotification).toHaveBeenCalledWith(
            "NetworkCredentials",
            expect.any(Function),
            true
        );
        expect(RegisterNotification).toHaveBeenCalledWith(
            "InteriorSites",
            expect.any(Function),
            true
        );
        expect(RegisterNotification).toHaveBeenCalledWith(
            "MemberInvitations",
            expect.any(Function),
            true
        );
        expect(RegisterNotification).toHaveBeenCalledWith(
            "MemberSites",
            expect.any(Function),
            true
        );
        expect(RegisterNotification).toHaveBeenCalledWith(
            "CertificateRequests",
            expect.any(Function),
            false
        );
    });
});

describe("onManagementControllersChange", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
        notifyEvents.length = 0;
        for (const key of Object.keys(notificationHandlers)) {
            delete notificationHandlers[key];
        }
        await Start();
    });

    it("creates mgmtController certificate request for new controller rows", async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("FROM ManagementControllers WHERE Lifecycle = 'new'")) {
                return {
                    rowCount: 1,
                    rows: [{ id: "mc-uuid-1", name: "management-server-abc" }],
                };
            }
            if (sql.includes("INSERT INTO CertificateRequests")) {
                return { rows: [{ id: "cert-req-1" }] };
            }
            if (sql.includes("UPDATE ManagementControllers SET Lifecycle = 'vms_cr_created'")) {
                return {};
            }
            return {};
        });

        await notificationHandlers.ManagementControllers("UPDATE", "mc-uuid-1");

        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining("'mgmtController'"),
            expect.arrayContaining(["mc-uuid-1"])
        );
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining(
                "UPDATE ManagementControllers SET Lifecycle = 'vms_cr_created'"
            ),
            ["mc-uuid-1"]
        );
        expect(notifyEvents).toContainEqual({
            method: "add",
            table: "CertificateRequests",
            id: "cert-req-1",
        });
        expect(notifyEvents).toContainEqual({
            method: "update",
            table: "ManagementControllers",
            id: "mc-uuid-1",
        });
        expect(mockClient.release).toHaveBeenCalled();
    });

    it("ignores DELETE actions", async () => {
        await notificationHandlers.ManagementControllers("DELETE", "mc-uuid-1");
        expect(mockClient.query).not.toHaveBeenCalled();
    });
});

describe("onBackbonesChange", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
        notifyEvents.length = 0;
        for (const key of Object.keys(notificationHandlers)) {
            delete notificationHandlers[key];
        }
        await Start();
    });

    it("creates backboneCA certificate request for new backbone rows", async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("FROM Backbones WHERE id = $1")) {
                return {
                    rowCount: 1,
                    rows: [{ id: "bb-uuid-1", name: "backbone-a", lifecycle: "new" }],
                };
            }
            if (sql.includes("INSERT INTO CertificateRequests")) {
                return { rows: [{ id: "cert-req-2" }] };
            }
            if (sql.includes("UPDATE Backbones SET Lifecycle = 'vms_cr_created'")) {
                return {};
            }
            return {};
        });

        await notificationHandlers.Backbones("UPDATE", "bb-uuid-1");

        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining("'backboneCA'"),
            expect.arrayContaining(["bb-uuid-1"])
        );
        expect(notifyEvents).toContainEqual({
            method: "add",
            table: "CertificateRequests",
            id: "cert-req-2",
        });
        expect(notifyEvents).toContainEqual({
            method: "update",
            table: "Backbones",
            id: "bb-uuid-1",
        });
    });

    it("notifies dependents when backbone lifecycle is ready", async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("FROM Backbones WHERE id = $1")) {
                return {
                    rowCount: 1,
                    rows: [{ id: "bb-uuid-1", name: "backbone-a", lifecycle: "ready" }],
                };
            }
            if (sql.includes("FROM BackboneAccessPoints AS ap")) {
                return { rows: [{ id: "ap-1" }] };
            }
            if (sql.includes("FROM ApplicationNetworks WHERE Backbone = $1")) {
                return { rows: [{ id: "van-1" }] };
            }
            if (sql.includes("FROM InteriorSites WHERE Backbone = $1")) {
                return { rows: [{ id: "site-1" }] };
            }
            if (sql.includes("FROM NetworkCredentials AS cred")) {
                return { rows: [{ id: "cred-1" }] };
            }
            return {};
        });

        await notificationHandlers.Backbones("UPDATE", "bb-uuid-1");

        expect(mockClient.query).not.toHaveBeenCalledWith(
            expect.stringContaining("INSERT INTO CertificateRequests"),
            expect.anything()
        );
        expect(notifyEvents).toEqual([
            { method: "update", table: "BackboneAccessPoints", id: "ap-1" },
            { method: "update", table: "ApplicationNetworks", id: "van-1" },
            { method: "update", table: "InteriorSites", id: "site-1" },
            { method: "update", table: "NetworkCredentials", id: "cred-1" },
        ]);
    });
});

describe("onCertificateRequestsChange", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
        notifyEvents.length = 0;
        for (const key of Object.keys(notificationHandlers)) {
            delete notificationHandlers[key];
        }
        await Start();
    });

    it("processes due certificate requests on ADD", async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("FROM CertificateRequests WHERE RequestTime")) {
                return {
                    rowCount: 1,
                    rows: [
                        {
                            id: "cert-req-3",
                            requesttype: "mgmtController",
                            durationhours: 8760,
                        },
                    ],
                };
            }
            if (sql.includes("UPDATE CertificateRequests SET Lifecycle = 'cm_cert_created'")) {
                return {};
            }
            return {};
        });

        await notificationHandlers.CertificateRequests("ADD", "cert-req-3");

        expect(ApplyObject).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: "Certificate",
                metadata: expect.objectContaining({
                    name: "vms-mgmt-controller-cert-req-3",
                }),
            })
        );
        expect(notifyEvents).toContainEqual({
            method: "update",
            table: "CertificateRequests",
            id: "cert-req-3",
        });
    });

    it("ignores non-ADD actions", async () => {
        await notificationHandlers.CertificateRequests("UPDATE", "cert-req-3");
        expect(mockClient.query).not.toHaveBeenCalled();
        expect(ApplyObject).not.toHaveBeenCalled();
    });
});

describe("onBackboneAccessPointsChange", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
        notifyEvents.length = 0;
        for (const key of Object.keys(notificationHandlers)) {
            delete notificationHandlers[key];
        }
        await Start();
    });

    it("creates accessPoint certificate request for new access points on ready backbones", async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("FROM BackboneAccessPoints") && sql.includes("Lifecycle = 'new'")) {
                return {
                    rowCount: 1,
                    rows: [
                        {
                            id: "ap-uuid-1",
                            name: "manage-ap",
                            hostname: "router.example.com",
                            starttime: null,
                            endtime: null,
                            deletedelay: null,
                        },
                    ],
                };
            }
            if (sql.includes("INSERT INTO CertificateRequests")) {
                return { rows: [{ id: "cert-req-ap-1" }] };
            }
            if (sql.includes("UPDATE BackboneAccessPoints SET Lifecycle = 'vms_cr_created'")) {
                return {};
            }
            return {};
        });

        await notificationHandlers.BackboneAccessPoints("UPDATE", "ap-uuid-1");

        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining("'accessPoint'"),
            expect.arrayContaining(["ap-uuid-1"])
        );
        expect(notifyEvents).toContainEqual({
            method: "add",
            table: "CertificateRequests",
            id: "cert-req-ap-1",
        });
        expect(DefaultCertExpiration).toHaveBeenCalled();
        expect(IntervalMilliseconds).toHaveBeenCalledWith({ days: 7 });
    });
});

describe("onApplicationNetworksChange", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
        notifyEvents.length = 0;
        for (const key of Object.keys(notificationHandlers)) {
            delete notificationHandlers[key];
        }
        await Start();
    });

    it("creates vanCA certificate request for new application networks", async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("FROM ApplicationNetworks") && sql.includes("Backbones.Lifecycle")) {
                return {
                    rowCount: 1,
                    rows: [
                        {
                            id: "van-uuid-1",
                            name: "van-a",
                            lifecycle: "new",
                            starttime: new Date("2026-01-01T00:00:00Z"),
                            endtime: null,
                            deletedelay: null,
                            bbca: "bb-ca-1",
                        },
                    ],
                };
            }
            if (sql.includes("INSERT INTO CertificateRequests")) {
                return { rows: [{ id: "cert-req-van-1" }] };
            }
            if (sql.includes("UPDATE ApplicationNetworks SET Lifecycle = 'vms_cr_created'")) {
                return {};
            }
            return {};
        });

        await notificationHandlers.ApplicationNetworks("UPDATE", "van-uuid-1");

        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining("'vanCA'"),
            expect.arrayContaining(["van-uuid-1"])
        );
        expect(notifyEvents).toContainEqual({
            method: "add",
            table: "CertificateRequests",
            id: "cert-req-van-1",
        });
    });

    it("notifies member invitations and sites when network becomes ready", async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("FROM ApplicationNetworks") && sql.includes("Backbones.Lifecycle")) {
                return {
                    rowCount: 1,
                    rows: [
                        {
                            id: "van-uuid-2",
                            name: "van-b",
                            lifecycle: "ready",
                            bbca: "bb-ca-1",
                        },
                    ],
                };
            }
            if (sql.includes("FROM MemberInvitations WHERE MemberOf")) {
                return { rows: [{ id: "invite-1" }] };
            }
            if (sql.includes("FROM MemberSites WHERE MemberOf")) {
                return { rows: [{ id: "member-1" }] };
            }
            return {};
        });

        await notificationHandlers.ApplicationNetworks("UPDATE", "van-uuid-2");

        expect(notifyEvents).toEqual([
            { method: "update", table: "MemberInvitations", id: "invite-1" },
            { method: "update", table: "MemberSites", id: "member-1" },
        ]);
    });
});

describe("onInteriorSitesChange", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
        notifyEvents.length = 0;
        for (const key of Object.keys(notificationHandlers)) {
            delete notificationHandlers[key];
        }
        await Start();
    });

    it("creates interiorRouter certificate request for new interior sites", async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("FROM InteriorSites") && sql.includes("Lifecycle = 'new'")) {
                return {
                    rowCount: 1,
                    rows: [
                        {
                            id: "site-uuid-1",
                            name: "backbone-site-a",
                            bbca: "bb-ca-1",
                        },
                    ],
                };
            }
            if (sql.includes("INSERT INTO CertificateRequests")) {
                return { rows: [{ id: "cert-req-site-1" }] };
            }
            if (sql.includes("UPDATE InteriorSites SET Lifecycle = 'vms_cr_created'")) {
                return {};
            }
            return {};
        });

        await notificationHandlers.InteriorSites("UPDATE", "site-uuid-1");

        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining("'interiorRouter'"),
            expect.arrayContaining(["site-uuid-1"])
        );
        expect(notifyEvents).toContainEqual({
            method: "add",
            table: "CertificateRequests",
            id: "cert-req-site-1",
        });
    });
});

describe("RotateCertificate", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
        notifyEvents.length = 0;
        IntervalMilliseconds.mockImplementation(() => 3600000);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("rejects a malformed certificate id", async () => {
        await expect(RotateCertificate("not-a-uuid")).rejects.toMatchObject({
            statusCode: 400,
            message: expect.stringContaining("Malformed certificate ID"),
        });
        expect(mockClient.query).not.toHaveBeenCalled();
    });

    it("returns 404 when the certificate does not exist", async () => {
        mockClient.query.mockResolvedValue({ rowCount: 0, rows: [] });
        await expect(RotateCertificate(TEST_UUIDS.cert)).rejects.toMatchObject({
            statusCode: 404,
            message: "Certificate not found",
        });
        expect(mockClient.release).toHaveBeenCalled();
    });

    it("returns 409 when the certificate has already been superseded", async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (sql.includes("SELECT Id, ObjectName, IsCA FROM TlsCertificates")) {
                return {
                    rowCount: 1,
                    rows: [{ id: TEST_UUIDS.cert, objectname: "site-cert", isca: false }],
                };
            }
            if (sql.includes("WHERE Supercedes = $1")) {
                return { rowCount: 1, rows: [{ "?column?": 1 }] };
            }
            return { rowCount: 0, rows: [] };
        });

        await expect(RotateCertificate(TEST_UUIDS.cert)).rejects.toMatchObject({
            statusCode: 409,
            message: "Certificate has been superseded",
        });
        expect(TriggerCertificateRenewal).not.toHaveBeenCalled();
    });

    it("triggers cert-manager renewal for a current leaf certificate", async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (sql.includes("SELECT Id, ObjectName, IsCA FROM TlsCertificates")) {
                return {
                    rowCount: 1,
                    rows: [{ id: TEST_UUIDS.cert, objectname: "site-cert", isca: false }],
                };
            }
            return { rowCount: 0, rows: [] };
        });
        TriggerCertificateRenewal.mockResolvedValue({});

        await expect(RotateCertificate(TEST_UUIDS.cert)).resolves.toEqual({ id: TEST_UUIDS.cert });
        expect(TriggerCertificateRenewal).toHaveBeenCalledWith("site-cert");
    });

    it("maps a missing certificate object to 404", async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (sql.includes("SELECT Id, ObjectName, IsCA FROM TlsCertificates")) {
                return {
                    rowCount: 1,
                    rows: [{ id: TEST_UUIDS.cert, objectname: "site-cert", isca: false }],
                };
            }
            return { rowCount: 0, rows: [] };
        });
        TriggerCertificateRenewal.mockRejectedValue({ statusCode: 404 });

        await expect(RotateCertificate(TEST_UUIDS.cert)).rejects.toMatchObject({
            statusCode: 404,
            message: "Certificate object site-cert not found",
        });
    });

    it("enqueues a backbone CA rotation request", async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("SELECT Id, ObjectName, IsCA FROM TlsCertificates")) {
                return {
                    rowCount: 1,
                    rows: [{ id: TEST_UUIDS.cert, objectname: "bb-ca", isca: true }],
                };
            }
            if (sql.includes("FOR UPDATE")) {
                return {
                    rows: [{ id: TEST_UUIDS.cert, isca: true, signedby: "root-ca" }],
                };
            }
            if (sql.includes("WHERE Supercedes = $1")) {
                return { rowCount: 0, rows: [] };
            }
            if (sql.includes("FROM CertificateRequests WHERE Supercedes")) {
                return { rowCount: 0, rows: [] };
            }
            if (sql.includes("FROM Backbones WHERE Certificate")) {
                return { rowCount: 1, rows: [{ id: "bb-1" }] };
            }
            if (sql.includes("INSERT INTO CertificateRequests")) {
                return { rows: [{ id: "cr-rotate-1" }] };
            }
            return { rowCount: 0, rows: [] };
        });

        await expect(RotateCertificate(TEST_UUIDS.cert)).resolves.toEqual({ id: TEST_UUIDS.cert });
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining("'backboneCA'"),
            expect.arrayContaining(["bb-1", "root-ca", TEST_UUIDS.cert])
        );
        expect(TriggerCertificateRenewal).not.toHaveBeenCalled();
    });

    it("enqueues a van CA rotation request using default CA expiration", async () => {
        IntervalMilliseconds.mockImplementation((interval) =>
            interval?.days ? interval.days * 24 * 3600000 : 3600000
        );
        mockCaRotationQueries({
            van: {
                id: TEST_UUIDS.van,
                starttime: new Date("2026-01-01T00:00:00Z"),
                endtime: null,
                deletedelay: null,
                bbca: "bb-ca",
            },
        });

        await expect(RotateCertificate(TEST_UUIDS.cert)).resolves.toEqual({ id: TEST_UUIDS.cert });
        expect(DefaultCaExpiration).toHaveBeenCalled();
        expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("'vanCA'"), [
            720,
            TEST_UUIDS.van,
            "bb-ca",
            TEST_UUIDS.cert,
        ]);
        expect(TriggerCertificateRenewal).not.toHaveBeenCalled();
    });

    it("enqueues a van CA rotation request for the VAN remaining lifetime", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
        mockCaRotationQueries({
            van: {
                id: TEST_UUIDS.van,
                starttime: new Date("2026-01-01T00:00:00Z"),
                endtime: new Date("2026-01-02T00:00:00Z"),
                deletedelay: { hours: 1 },
                bbca: "bb-ca",
            },
        });

        await expect(RotateCertificate(TEST_UUIDS.cert)).resolves.toEqual({ id: TEST_UUIDS.cert });
        expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("'vanCA'"), [
            25,
            TEST_UUIDS.van,
            "bb-ca",
            TEST_UUIDS.cert,
        ]);
    });

    it("uses remaining VAN lifetime on rotate instead of the original span", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
        mockCaRotationQueries({
            van: {
                id: TEST_UUIDS.van,
                starttime: new Date("2025-01-01T00:00:00Z"),
                endtime: new Date("2030-01-01T00:00:00Z"),
                deletedelay: { hours: 1 },
                bbca: "bb-ca",
            },
        });

        await expect(RotateCertificate(TEST_UUIDS.cert)).resolves.toEqual({ id: TEST_UUIDS.cert });
        const remainingHours = Math.trunc(
            (new Date("2030-01-01T00:00:00Z").getTime() -
                new Date("2026-01-01T00:00:00Z").getTime() +
                3600000) /
                3600000
        );
        const originalSpanHours = Math.trunc(
            (new Date("2030-01-01T00:00:00Z").getTime() -
                new Date("2025-01-01T00:00:00Z").getTime() +
                3600000) /
                3600000
        );
        expect(remainingHours).toBeLessThan(originalSpanHours);
        expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("'vanCA'"), [
            remainingHours,
            TEST_UUIDS.van,
            "bb-ca",
            TEST_UUIDS.cert,
        ]);
    });

    it("floors van CA rotation duration when the VAN end time has passed", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-09T00:00:00Z"));
        mockCaRotationQueries({
            van: {
                id: TEST_UUIDS.van,
                starttime: new Date("2026-01-01T00:00:00Z"),
                endtime: new Date("2026-01-02T00:00:00Z"),
                deletedelay: { hours: 1 },
                bbca: "bb-ca",
            },
        });

        await expect(RotateCertificate(TEST_UUIDS.cert)).resolves.toEqual({ id: TEST_UUIDS.cert });
        expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("'vanCA'"), [
            1,
            TEST_UUIDS.van,
            "bb-ca",
            TEST_UUIDS.cert,
        ]);
    });

    it("returns 409 when CA rotation is already in progress", async () => {
        mockCaRotationQueries({ pending: true, van: { id: TEST_UUIDS.van, bbca: "bb-ca" } });

        await expect(RotateCertificate(TEST_UUIDS.cert)).rejects.toMatchObject({
            statusCode: 409,
            message: "Certificate rotation already in progress",
        });
        expect(certificateRequestInserts()).toHaveLength(0);
    });

    it("rejects rotation of a CA that is not a backbone or VAN certificate", async () => {
        mockCaRotationQueries();

        await expect(RotateCertificate(TEST_UUIDS.cert)).rejects.toMatchObject({
            statusCode: 400,
            message: "Certificate rotation of this CA is not supported",
        });
    });
});

describe("secret and certificate watches", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
        notifyEvents.length = 0;
        IntervalMilliseconds.mockImplementation(() => 3600000);
        for (const key of Object.keys(notificationHandlers)) {
            delete notificationHandlers[key];
        }
        await Start();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("records a new interior-site certificate when the TLS secret is added", async () => {
        LoadCertificate.mockResolvedValue({
            status: {
                notAfter: "2099-01-01T00:00:00Z",
                renewalTime: "2098-01-01T00:00:00Z",
            },
        });
        mockClient.query.mockImplementation(async (sql) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("FROM CertificateRequests WHERE Id = $1")) {
                return {
                    rowCount: 1,
                    rows: [
                        {
                            id: "req-1",
                            interiorsite: "site-1",
                            supercedes: null,
                            issuer: "ca-1",
                        },
                    ],
                };
            }
            if (sql.includes("SELECT name FROM InteriorSites")) {
                return { rows: [{ name: "backbone-site-a" }] };
            }
            if (sql.includes("INSERT INTO TlsCertificates")) {
                return {};
            }
            if (sql.includes("UPDATE InteriorSites SET Certificate")) {
                return {};
            }
            if (sql.includes("DELETE FROM CertificateRequests")) {
                return {};
            }
            return { rows: [], rowCount: 0 };
        });

        const onSecretWatch = WatchSecrets.mock.calls[0][0];
        await onSecretWatch("ADDED", {
            metadata: {
                name: "vms-site-cert",
                annotations: {
                    [META_ANNOTATION_VMS_CONTROLLED]: "true",
                    "skupper.io/vms-dblink": "req-1",
                    "skupper.io/vms-issuerlink": "ca-1",
                },
            },
            data: { "tls.crt": "cert" },
        });

        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining("INSERT INTO TlsCertificates"),
            expect.arrayContaining(["req-1", false, "vms-site-cert"])
        );
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining(
                "UPDATE InteriorSites SET Certificate = $1, Lifecycle = 'ready'"
            ),
            ["req-1", "site-1"]
        );
        expect(SiteCertificateChanged).toHaveBeenCalledWith("req-1");
    });

    it("ignores secret add events that are not VMS-controlled", async () => {
        const onSecretWatch = WatchSecrets.mock.calls[0][0];
        await onSecretWatch("ADDED", {
            metadata: { name: "other", annotations: {} },
        });
        expect(mockClient.query).not.toHaveBeenCalled();
    });

    it("persists certificate times from a certificate watch", async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("WHERE Supercedes = $1")) {
                return { rowCount: 0, rows: [] };
            }
            if (sql.includes("UPDATE TlsCertificates SET RenewalTime")) {
                return { rows: [{ id: "cert-1" }] };
            }
            return { rows: [], rowCount: 0 };
        });

        const onCertificateWatch = WatchCertificates.mock.calls[0][0];
        await onCertificateWatch("MODIFIED", {
            metadata: {
                name: "vms-site-cert",
                annotations: {
                    [META_ANNOTATION_VMS_CONTROLLED]: "true",
                    "skupper.io/vms-dblink": "cert-1",
                },
            },
            status: {
                notAfter: "2099-01-01T00:00:00Z",
                renewalTime: "2098-01-01T00:00:00Z",
            },
        });

        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining("UPDATE TlsCertificates SET RenewalTime"),
            [expect.any(Date), expect.any(Date), "cert-1"]
        );
        expect(notifyEvents).toContainEqual({
            method: "update",
            table: "TlsCertificates",
            id: "cert-1",
        });
    });

    it("enqueues VAN CA and credential children after a backbone CA rotation", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
        LoadCertificate.mockResolvedValue({
            status: {
                notAfter: "2099-01-01T00:00:00Z",
                renewalTime: "2098-01-01T00:00:00Z",
            },
        });
        const newCaId = "req-bb-ca";
        mockClient.query.mockImplementation(async (sql, params) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("FROM CertificateRequests WHERE Id = $1")) {
                return {
                    rowCount: 1,
                    rows: [
                        {
                            id: newCaId,
                            backbone: "bb-1",
                            supercedes: "old-bb-ca",
                            issuer: "root-ca",
                        },
                    ],
                };
            }
            if (sql.includes("SELECT name FROM Backbones")) {
                return { rows: [{ name: "backbone-a" }] };
            }
            if (sql.includes("FOR UPDATE")) {
                return { rows: [{ id: "old-bb-ca", rotationordinal: 0 }] };
            }
            if (sql.includes("INSERT INTO TlsCertificates")) {
                return {};
            }
            if (sql.includes("SET Certificate = $1 WHERE Certificate = $2")) {
                return { rows: [], rowCount: 0 };
            }
            if (sql.includes("DELETE FROM CertificateRequests")) {
                return {};
            }
            if (sql.includes("SELECT Id FROM Backbones WHERE Certificate")) {
                return { rowCount: 1, rows: [{ id: "bb-1" }] };
            }
            if (sql.includes("FROM InteriorSites s")) {
                return { rows: [{ id: "site-1", certificate: "site-cert-old" }] };
            }
            if (sql.includes("FROM BackboneAccessPoints ap")) {
                return {
                    rows: [
                        {
                            id: "ap-peer",
                            kind: "peer",
                            hostname: "peer.example.com",
                            certificate: "ap-peer-old",
                        },
                        {
                            id: "ap-manage",
                            kind: "manage",
                            hostname: "manage.example.com",
                            certificate: "ap-manage-old",
                        },
                    ],
                };
            }
            if (sql.includes("FROM ApplicationNetworks an") && sql.includes("an.Certificate")) {
                return {
                    rows: [
                        {
                            id: "van-1",
                            certificate: "van-ca-old",
                            starttime: new Date("2026-01-01T00:00:00Z"),
                            endtime: new Date("2026-01-02T00:00:00Z"),
                            deletedelay: { hours: 1 },
                        },
                    ],
                };
            }
            if (sql.includes("FROM NetworkCredentials cred")) {
                return { rows: [{ id: "cred-1", certificate: "cred-old" }] };
            }
            if (
                sql.includes("FROM CertificateRequests WHERE Supercedes") ||
                sql.includes("FROM TlsCertificates WHERE Supercedes")
            ) {
                return { rowCount: 0, rows: [] };
            }
            if (sql.includes("INSERT INTO CertificateRequests")) {
                return { rows: [{ id: `cr-${params[0]}-${params[3]}` }] };
            }
            return { rows: [], rowCount: 0 };
        });

        const onSecretWatch = WatchSecrets.mock.calls[0][0];
        await onSecretWatch("ADDED", controlledTlsSecret("vms-bb-ca", newCaId, "root"));

        const inserts = certificateRequestInserts();
        expect(inserts.map(([, insertParams]) => insertParams[0])).toEqual([
            "interiorRouter",
            "accessPoint",
            "vanCA",
            "vanCredential",
            "accessPoint",
        ]);
        expect(inserts[2][1]).toEqual([
            "vanCA",
            expect.any(Date),
            25,
            "van-1",
            newCaId,
            "van-ca-old",
            null,
        ]);
        expect(inserts[3][1][0]).toBe("vanCredential");
        expect(inserts[3][1][3]).toBe("cred-1");
        expect(ApplyObject).toHaveBeenCalledWith(expect.objectContaining({ kind: "Issuer" }));
    });

    it("enqueues member site rotations after a van CA secret is added and skips pending children", async () => {
        LoadCertificate.mockResolvedValue({
            status: {
                notAfter: "2099-01-01T00:00:00Z",
                renewalTime: "2098-01-01T00:00:00Z",
            },
        });
        const newCaId = "req-van-ca";
        mockClient.query.mockImplementation(async (sql, params) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("FROM CertificateRequests WHERE Id = $1")) {
                return {
                    rowCount: 1,
                    rows: [
                        {
                            id: newCaId,
                            applicationnetwork: "van-1",
                            supercedes: "old-van-ca",
                            issuer: "bb-ca",
                        },
                    ],
                };
            }
            if (sql.includes("SELECT name FROM ApplicationNetworks")) {
                return { rows: [{ name: "van-a" }] };
            }
            if (sql.includes("FOR UPDATE")) {
                return { rows: [{ id: "old-van-ca", rotationordinal: 1 }] };
            }
            if (sql.includes("INSERT INTO TlsCertificates")) {
                return {};
            }
            if (sql.includes("SET Certificate = $1 WHERE Certificate = $2")) {
                return { rows: [], rowCount: 0 };
            }
            if (sql.includes("DELETE FROM CertificateRequests")) {
                return {};
            }
            if (sql.includes("SELECT Id FROM ApplicationNetworks WHERE Certificate")) {
                return { rowCount: 1, rows: [{ id: "van-1" }] };
            }
            if (sql.includes("FROM MemberSites m")) {
                return {
                    rows: [
                        { id: "member-pending", certificate: "member-cert-pending" },
                        { id: "member-ready", certificate: "member-cert-ready" },
                    ],
                };
            }
            if (sql.includes("FROM CertificateRequests WHERE Supercedes")) {
                if (params[0] === "member-cert-pending") {
                    return { rowCount: 1, rows: [{ id: "cr-pending" }] };
                }
                return { rowCount: 0, rows: [] };
            }
            if (sql.includes("FROM TlsCertificates WHERE Supercedes")) {
                return { rowCount: 0, rows: [] };
            }
            if (sql.includes("INSERT INTO CertificateRequests")) {
                return { rows: [{ id: "cr-van-site" }] };
            }
            return { rows: [], rowCount: 0 };
        });

        const onSecretWatch = WatchSecrets.mock.calls[0][0];
        await onSecretWatch("ADDED", controlledTlsSecret("vms-van-ca", newCaId));

        const inserts = certificateRequestInserts();
        expect(inserts).toHaveLength(1);
        expect(inserts[0][0]).toContain("Site");
        expect(inserts[0][1]).toEqual([
            "vanSite",
            expect.any(Date),
            1,
            "member-ready",
            newCaId,
            "member-cert-ready",
            null,
        ]);
        expect(ApplyObject).toHaveBeenCalledWith(expect.objectContaining({ kind: "Issuer" }));
    });

    it("notifies sibling leaves when a rotated cert is the last child of the old issuer", async () => {
        LoadCertificate.mockResolvedValue({
            status: {
                notAfter: "2099-01-01T00:00:00Z",
                renewalTime: "2098-01-01T00:00:00Z",
            },
        });
        const newCertId = "req-leaf";
        mockClient.query.mockImplementation(async (sql, params) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("FROM CertificateRequests WHERE Id = $1")) {
                return {
                    rowCount: 1,
                    rows: [
                        {
                            id: newCertId,
                            interiorsite: "site-1",
                            supercedes: "old-leaf",
                            issuer: "new-ca",
                        },
                    ],
                };
            }
            if (sql.includes("SELECT name FROM InteriorSites")) {
                return { rows: [{ name: "backbone-site-a" }] };
            }
            if (sql.includes("FOR UPDATE")) {
                return { rows: [{ id: "old-leaf", rotationordinal: 0 }] };
            }
            if (sql.includes("INSERT INTO TlsCertificates")) {
                return {};
            }
            if (sql.includes("SET Certificate = $1 WHERE Certificate = $2")) {
                return { rows: [], rowCount: 0 };
            }
            if (sql.includes("DELETE FROM CertificateRequests")) {
                return {};
            }
            if (sql.includes("WHERE SignedBy = $1") && sql.includes("LIMIT 1")) {
                return { rowCount: 0, rows: [] };
            }
            if (sql.includes("WHERE SignedBy = $1")) {
                return {
                    rows: [
                        { id: "sibling-1", isca: false },
                        { id: newCertId, isca: false },
                    ],
                };
            }
            if (sql.includes("FROM TlsCertificates WHERE Id = $1")) {
                if (params[0] === newCertId) {
                    return { rows: [{ id: newCertId, signedby: "new-ca" }] };
                }
                if (params[0] === "new-ca") {
                    return { rows: [{ id: "new-ca", supercedes: "old-ca" }] };
                }
                return { rows: [] };
            }
            return { rows: [], rowCount: 0 };
        });

        const onSecretWatch = WatchSecrets.mock.calls[0][0];
        await onSecretWatch("ADDED", controlledTlsSecret("vms-site-cert", newCertId, "new-ca"));

        expect(SiteCertificateChanged).toHaveBeenCalledWith(newCertId);
        expect(SiteCertificateChanged).toHaveBeenCalledWith("sibling-1");
        expect(AccessCertificateChanged).toHaveBeenCalledWith("sibling-1");
        expect(SyncColoTlsCertificate).toHaveBeenCalledWith("sibling-1");
        expect(ApplyObject).not.toHaveBeenCalled();
    });
});
