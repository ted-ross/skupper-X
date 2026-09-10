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

vi.mock("@vms/modules/kube", () => ({
    GetNamespaces: vi.fn(async () => []),
    createNamespace: vi.fn(),
    deleteNamespace: vi.fn(),
    LoadSecret: vi.fn(),
    ApplyObject: vi.fn(),
    ReplaceSecret: vi.fn(),
    GetSites: vi.fn(async () => [{ metadata: { name: "colo-site" } }]),
    LoadRouterAccess: vi.fn(async () => ({ metadata: { name: "vms-colo-manage" } })),
}));

vi.mock("./db.js", () => ({
    ClientFromPool: vi.fn(async () => mockClient),
}));

vi.mock("./notify.js", () => ({
    RegisterNotification: vi.fn((tableName, handler) => {
        notificationHandlers[tableName] = handler;
    }),
    NotifyTransaction: class {
        add() {}
        update() {}
        delete() {}
        async commit() {}
    },
}));

vi.mock("./tls-rotation.js", () => ({
    overlayDualTrustCa: vi.fn(async (_client, _certId, data) => data),
    getTlsRotationMeta: vi.fn(async () => ({ ordinal: 1, lastValid: 0 })),
}));

import { Start, SyncColoTlsCertificate } from "./colo-sync.js";
import { RegisterNotification } from "./notify.js";
import { GetNamespaces, LoadSecret, ApplyObject, ReplaceSecret } from "@vms/modules/kube";
import { META_ANNOTATION_TLS_ORDINAL } from "@vms/modules/common";

function tlsSecretData(ca = "ca") {
    return {
        "ca.crt": Buffer.from(ca).toString("base64"),
        "tls.crt": Buffer.from("cert").toString("base64"),
        "tls.key": Buffer.from("key").toString("base64"),
    };
}

describe("colo-sync Start", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        for (const key of Object.keys(notificationHandlers)) {
            delete notificationHandlers[key];
        }
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("loads namespaces and registers change handlers", async () => {
        GetNamespaces.mockResolvedValue([
            {
                metadata: {
                    name: "colo-ns-1",
                    annotations: { "skupper.io/vms-controlled": "true" },
                },
            },
        ]);

        await Start();

        expect(GetNamespaces).toHaveBeenCalled();
        expect(RegisterNotification).toHaveBeenCalledWith("Backbones", expect.any(Function), true);
        expect(RegisterNotification).toHaveBeenCalledWith(
            "InteriorSites",
            expect.any(Function),
            false
        );
        expect(RegisterNotification).toHaveBeenCalledWith(
            "BackboneAccessPoints",
            expect.any(Function),
            false
        );
        expect(vi.getTimerCount()).toBe(1);
    });
});

describe("SyncColoTlsCertificate", () => {
    beforeEach(async () => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        for (const key of Object.keys(notificationHandlers)) {
            delete notificationHandlers[key];
        }
        mockClient.query.mockReset();
        GetNamespaces.mockResolvedValue([
            {
                metadata: {
                    name: "colo-ns-1",
                    annotations: { "skupper.io/vms-controlled": "true" },
                },
            },
        ]);
        await Start();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("does nothing when certId is missing", async () => {
        await SyncColoTlsCertificate();
        expect(mockClient.query).not.toHaveBeenCalled();
    });

    it("applies a missing site TLS secret and replaces it when the payload changes", async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (sql.includes("FROM InteriorSites WHERE CoLocated = true AND Backbone")) {
                return {
                    rowCount: 1,
                    rows: [
                        {
                            id: "site-1",
                            certificate: "cert-1",
                            lifecycle: "ready",
                            deploymentstate: "deployed",
                        },
                    ],
                };
            }
            if (sql.includes("FROM BackboneAccessPoints WHERE InteriorSite")) {
                return {
                    rowCount: 1,
                    rows: [{ id: "ap-1", kind: "manage", lifecycle: "partial" }],
                };
            }
            if (sql.includes("FROM InteriorSites WHERE CoLocated = true AND Certificate")) {
                return { rowCount: 1, rows: [{ id: "site-1" }] };
            }
            if (sql.includes("SELECT objectname FROM TlsCertificates")) {
                return { rows: [{ objectname: "mc-tls-secret" }] };
            }
            return { rows: [], rowCount: 0 };
        });

        await notificationHandlers.Backbones("EXISTS", "bb-1", "Backbones", {
            id: "bb-1",
            colocatednamespace: "colo-ns-1",
        });
        LoadSecret.mockImplementation(async (name, ns) => {
            if (name === "mc-tls-secret") {
                return { data: tlsSecretData("ca-v1") };
            }
            if (name === "vms-site-site-1" && ns === "colo-ns-1") {
                return undefined;
            }
            return undefined;
        });
        await notificationHandlers.Backbones("EXISTS_COMPLETE", null, "Backbones");

        expect(ApplyObject).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: "Secret",
                metadata: expect.objectContaining({
                    name: "vms-site-site-1",
                    annotations: expect.objectContaining({
                        [META_ANNOTATION_TLS_ORDINAL]: "1",
                    }),
                }),
            }),
            "colo-ns-1"
        );

        ApplyObject.mockClear();
        LoadSecret.mockImplementation(async (name, ns) => {
            if (name === "mc-tls-secret") {
                return { data: tlsSecretData("ca-v2") };
            }
            if (name === "vms-site-site-1" && ns === "colo-ns-1") {
                return {
                    metadata: { resourceVersion: "11" },
                    data: tlsSecretData("ca-v1"),
                };
            }
            return undefined;
        });

        await SyncColoTlsCertificate("cert-1");

        expect(ReplaceSecret).toHaveBeenCalledWith(
            "vms-site-site-1",
            expect.objectContaining({
                metadata: expect.objectContaining({
                    resourceVersion: "11",
                    annotations: expect.objectContaining({
                        [META_ANNOTATION_TLS_ORDINAL]: "1",
                    }),
                }),
            }),
            "colo-ns-1"
        );
        expect(ApplyObject).not.toHaveBeenCalled();
    });

    it("skips replace when colo TLS data is already current", async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (sql.includes("FROM InteriorSites WHERE CoLocated = true AND Backbone")) {
                return {
                    rowCount: 1,
                    rows: [
                        {
                            id: "site-1",
                            certificate: "cert-1",
                            lifecycle: "ready",
                            deploymentstate: "deployed",
                        },
                    ],
                };
            }
            if (sql.includes("FROM BackboneAccessPoints WHERE InteriorSite")) {
                return {
                    rowCount: 1,
                    rows: [{ id: "ap-1", kind: "manage", lifecycle: "partial" }],
                };
            }
            if (sql.includes("FROM InteriorSites WHERE CoLocated = true AND Certificate")) {
                return { rowCount: 1, rows: [{ id: "site-1" }] };
            }
            if (sql.includes("SELECT objectname FROM TlsCertificates")) {
                return { rows: [{ objectname: "mc-tls-secret" }] };
            }
            return { rows: [], rowCount: 0 };
        });

        const data = tlsSecretData("ca-same");
        LoadSecret.mockResolvedValue({
            metadata: { resourceVersion: "7" },
            data,
        });

        await notificationHandlers.Backbones("EXISTS", "bb-1", "Backbones", {
            id: "bb-1",
            colocatednamespace: "colo-ns-1",
        });
        await notificationHandlers.Backbones("EXISTS_COMPLETE", null, "Backbones");
        ApplyObject.mockClear();
        ReplaceSecret.mockClear();

        LoadSecret.mockImplementation(async (name) => {
            if (name === "mc-tls-secret") {
                return { data };
            }
            return { metadata: { resourceVersion: "7" }, data };
        });

        await SyncColoTlsCertificate("cert-1");

        expect(ReplaceSecret).not.toHaveBeenCalled();
        expect(ApplyObject).not.toHaveBeenCalled();
    });
});
