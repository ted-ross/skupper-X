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

vi.mock("@vms/modules/state-sync", () => ({
    DeletePeer: vi.fn(),
    UpdateLocalState: vi.fn(),
}));

vi.mock("@vms/modules/kube", () => ({
    LoadSecret: vi.fn(),
}));

vi.mock("./backbone-links.js", () => ({
    RegisterHandler: vi.fn(),
}));

vi.mock("./notify.js", () => ({
    RegisterNotification: vi.fn(),
    NotifyTransaction: class {
        update() {}
        async commit() {}
    },
}));

const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
};

vi.mock("./db.js", () => ({
    ClientFromPool: vi.fn(async () => mockClient),
}));

import {
    GetBackboneLinks_TX,
    GetBackboneAccessPoints_TX,
    SiteDeleted,
    SiteCertificateChanged,
    AccessCertificateChanged,
    SiteIngressChanged,
    _registerPeerForTest,
} from "./sync-management.js";
import { DeletePeer, UpdateLocalState } from "@vms/modules/state-sync";
import { LoadSecret } from "@vms/modules/kube";

describe("GetBackboneLinks_TX", () => {
    it("returns links keyed by id with hostname", async () => {
        const client = {
            query: vi.fn(async () => ({
                rows: [
                    {
                        id: "link-1",
                        hostname: "router.example.com",
                        port: 9090,
                        cost: 2,
                    },
                ],
            })),
        };

        const links = await GetBackboneLinks_TX(client, "site-1");

        expect(links).toEqual({
            "link-1": {
                host: "router.example.com",
                port: 9090,
                cost: "2",
            },
        });
    });

    it("omits links without hostname", async () => {
        const client = {
            query: vi.fn(async () => ({
                rows: [
                    {
                        id: "link-2",
                        hostname: null,
                        port: 9090,
                        cost: 1,
                    },
                ],
            })),
        };

        const links = await GetBackboneLinks_TX(client, "site-1");

        expect(links).toEqual({});
    });
});

describe("GetBackboneAccessPoints_TX", () => {
    it("includes manage access points when initialOnly is true", async () => {
        const client = {
            query: vi.fn(async () => ({
                rows: [
                    {
                        id: "ap-manage",
                        kind: "manage",
                        bindhost: "",
                        accesstype: "local",
                        colocated: false,
                    },
                    {
                        id: "ap-van",
                        kind: "van",
                        bindhost: "",
                        accesstype: "",
                        colocated: false,
                    },
                ],
            })),
        };

        const accessPoints = await GetBackboneAccessPoints_TX(client, "site-1", true);

        expect(Object.keys(accessPoints)).toEqual(["ap-manage"]);
        expect(accessPoints["ap-manage"]).toEqual({ kind: "manage", accessType: "local" });
    });

    it("includes all access points when initialOnly is false", async () => {
        const client = {
            query: vi.fn(async () => ({
                rows: [
                    {
                        id: "ap-manage",
                        kind: "manage",
                        bindhost: "0.0.0.0",
                        accesstype: "",
                        colocated: false,
                    },
                    {
                        id: "ap-van",
                        kind: "van",
                        bindhost: "",
                        accesstype: "",
                        colocated: false,
                    },
                ],
            })),
        };

        const accessPoints = await GetBackboneAccessPoints_TX(client, "site-1", false);

        expect(Object.keys(accessPoints).sort((a, b) => a.localeCompare(b))).toEqual([
            "ap-manage",
            "ap-van",
        ]);
        expect(accessPoints["ap-manage"].bindhost).toBe("0.0.0.0");
    });
});

describe("SiteDeleted", () => {
    it("calls DeletePeer for the site id", async () => {
        await SiteDeleted("site-1");

        expect(DeletePeer).toHaveBeenCalledWith("site-1");
    });
});

describe("SiteCertificateChanged", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
    });

    it("updates tls-site state hash for connected backbone sites", async () => {
        _registerPeerForTest("site-1", "backbone");

        mockClient.query.mockImplementation(async (sql) => {
            if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
                return {};
            }
            if (sql.includes("FROM InteriorSites") && sql.includes("Certificate = $1")) {
                return {
                    rowCount: 1,
                    rows: [{ id: "site-1", objectname: "site-tls-secret" }],
                };
            }
            return { rows: [] };
        });

        LoadSecret.mockResolvedValue({
            data: { "tls.crt": Buffer.from("cert").toString("base64") },
        });

        await SiteCertificateChanged("cert-1");

        expect(LoadSecret).toHaveBeenCalledWith("site-tls-secret");
        expect(UpdateLocalState).toHaveBeenCalledWith(
            "site-1",
            "tls-site-site-1",
            expect.stringMatching(/^[a-f0-9]{40}$/)
        );
        expect(mockClient.release).toHaveBeenCalled();
    });

    it("skips update when site is not connected", async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
                return {};
            }
            if (sql.includes("FROM InteriorSites") && sql.includes("Certificate = $1")) {
                return {
                    rowCount: 1,
                    rows: [{ id: "site-offline", objectname: "site-tls-secret" }],
                };
            }
            return { rows: [] };
        });

        await SiteCertificateChanged("cert-2");

        expect(LoadSecret).not.toHaveBeenCalled();
        expect(UpdateLocalState).not.toHaveBeenCalled();
    });

    it("updates tls-site state hash for connected member sites", async () => {
        _registerPeerForTest("member-1", "member");

        mockClient.query.mockImplementation(async (sql) => {
            if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
                return {};
            }
            if (sql.includes("FROM InteriorSites") && sql.includes("Certificate = $1")) {
                return { rowCount: 0, rows: [] };
            }
            if (sql.includes("FROM MemberSites") && sql.includes("Certificate = $1")) {
                return {
                    rowCount: 1,
                    rows: [{ id: "member-1", objectname: "member-tls-secret" }],
                };
            }
            return { rows: [] };
        });

        LoadSecret.mockResolvedValue({
            data: { "tls.crt": Buffer.from("cert").toString("base64") },
        });

        await SiteCertificateChanged("cert-member");

        expect(LoadSecret).toHaveBeenCalledWith("member-tls-secret");
        expect(UpdateLocalState).toHaveBeenCalledWith(
            "member-1",
            "tls-site-member-1",
            expect.stringMatching(/^[a-f0-9]{40}$/)
        );
    });
});

describe("SiteIngressChanged", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
    });

    it("updates access point hash for connected sites", async () => {
        _registerPeerForTest("site-2", "backbone");

        mockClient.query.mockImplementation(async (sql) => {
            if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
                return {};
            }
            if (sql.includes("FROM BackboneAccessPoints JOIN InteriorSites")) {
                return {
                    rowCount: 1,
                    rows: [
                        {
                            kind: "manage",
                            bindhost: "0.0.0.0",
                            accesstype: "local",
                            certificate: "cert-ap",
                            lifecycle: "ready",
                            colocated: false,
                        },
                    ],
                };
            }
            return { rows: [] };
        });

        await SiteIngressChanged("site-2", "ap-1");

        expect(UpdateLocalState).toHaveBeenCalledWith(
            "site-2",
            "access-ap-1",
            expect.stringMatching(/^[a-f0-9]{40}$/)
        );
        expect(mockClient.release).toHaveBeenCalled();
    });
});

describe("AccessCertificateChanged", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
    });

    it("updates tls-server state hash for connected backbone sites", async () => {
        _registerPeerForTest("site-3", "backbone");

        mockClient.query.mockImplementation(async (sql) => {
            if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
                return {};
            }
            if (sql.includes("FROM BackboneAccessPoints") && sql.includes("Certificate = $1")) {
                return {
                    rowCount: 1,
                    rows: [{ apid: "ap-9", id: "site-3", objectname: "ap-tls-secret" }],
                };
            }
            return { rows: [] };
        });

        LoadSecret.mockResolvedValue({
            data: { "tls.crt": Buffer.from("cert").toString("base64") },
        });

        await AccessCertificateChanged("cert-ap");

        expect(LoadSecret).toHaveBeenCalledWith("ap-tls-secret");
        expect(UpdateLocalState).toHaveBeenCalledWith(
            "site-3",
            "tls-server-ap-9",
            expect.stringMatching(/^[a-f0-9]{40}$/)
        );
        expect(mockClient.release).toHaveBeenCalled();
    });
});
