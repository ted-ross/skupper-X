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
import request from "supertest";
import { createMockClient, TEST_UUIDS } from "./test-helpers/mock-db.js";
import { buildApiApp } from "./test-helpers/build-api-app.js";
import { RotateCertificate } from "./certs.js";
import { LoadSecret } from "@vms/modules/kube";
import { getTlsRotationMeta, overlayDualTrustCa } from "./tls-rotation.js";
import { META_ANNOTATION_TLS_LAST_VALID, META_ANNOTATION_TLS_ORDINAL } from "@vms/modules/common";

const mockClient = createMockClient();
let mockFormFields = {};

vi.mock("formidable", () => {
    class MockForm {
        parse() {
            return Promise.resolve([mockFormFields, {}]);
        }
    }
    const formidable = () => new MockForm();
    formidable.IncomingForm = MockForm;
    return {
        default: formidable,
        IncomingForm: MockForm,
    };
});

vi.mock("./watch-server.js", () => ({
    WatchNotify: vi.fn(),
}));

vi.mock("./certs.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        RotateCertificate: vi.fn(),
    };
});

vi.mock("./sync-management.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
    };
});

vi.mock("./db.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        ClientFromPool: vi.fn(async () => mockClient),
    };
});

vi.mock("@vms/modules/kube", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        LoadSecret: vi.fn(),
    };
});

vi.mock("./tls-rotation.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        overlayDualTrustCa: vi.fn(actual.overlayDualTrustCa),
        getTlsRotationMeta: vi.fn(actual.getTlsRotationMeta),
    };
});

describe("mc-apiserver routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        overlayDualTrustCa.mockImplementation(async (_client, _id, data) => data);
        getTlsRotationMeta.mockResolvedValue({ ordinal: 0, lastValid: 0 });
        mockClient.query.mockImplementation(async (sql) => {
            if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
                return {};
            }
            if (sql.includes("INSERT INTO Users")) {
                return { rows: [{ id: "internal-user-1" }] };
            }
            if (sql.includes("set_config")) {
                return {};
            }
            if (sql.includes("SELECT ShortName, LongName FROM TargetPlatforms")) {
                return {
                    rows: [{ shortname: "sk2", longname: "Skupper 2" }],
                };
            }
            if (sql.includes("SELECT VanId FROM ApplicationNetworks")) {
                return {
                    rowCount: 1,
                    rows: [{ vanid: "van-network-id" }],
                };
            }
            if (
                sql.includes("SELECT Id, Lifecycle, Hostname, Port, Kind FROM BackboneAccessPoints")
            ) {
                return {
                    rowCount: 1,
                    rows: [
                        {
                            id: TEST_UUIDS.accessPoint,
                            lifecycle: "partial",
                            hostname: null,
                            port: null,
                            kind: "peer",
                        },
                    ],
                };
            }
            if (sql.includes("UPDATE BackboneAccessPoints SET Hostname")) {
                return { rowCount: 1 };
            }
            if (sql.includes("InterRouterLinks")) {
                return {
                    rows: [
                        {
                            id: "link-1",
                            hostname: "router.example.com",
                            port: 5671,
                            cost: 1,
                        },
                    ],
                };
            }
            if (sql.includes("AS superseded")) {
                return {
                    rows: [{ id: TEST_UUIDS.cert, superseded: false }],
                };
            }
            if (sql.includes("TlsCertificates.Id AS certificate FROM ApplicationNetworks")) {
                return {
                    rowCount: 1,
                    rows: [
                        {
                            vanid: "van-network-id",
                            objectname: "van-cred-secret",
                            certificate: TEST_UUIDS.cert,
                        },
                    ],
                };
            }
            if (sql.includes("SELECT hostname, port FROM BackboneAccessPoints")) {
                return {
                    rowCount: 1,
                    rows: [{ hostname: "edge.example.com", port: 443 }],
                };
            }
            return { rows: [], rowCount: 0 };
        });
    });

    it("GET /targetplatforms returns platform list", async () => {
        const { app } = await buildApiApp({
            includeAdmin: false,
            includeUser: false,
            includeMcRoutes: true,
        });

        const res = await request(app)
            .get("/api/v1alpha1/targetplatforms")
            .set("x-test-auth", "1")
            .expect(200);

        expect(res.body).toEqual([{ shortname: "sk2", longname: "Skupper 2" }]);
    });

    it("GET /user/profile returns authenticated user name", async () => {
        const { app } = await buildApiApp({
            includeAdmin: false,
            includeUser: false,
            includeMcRoutes: true,
        });

        const res = await request(app)
            .get("/api/v1alpha1/user/profile")
            .set("x-test-auth", "1")
            .expect(200);

        expect(res.body).toEqual({ name: "Test User" });
    });

    it("GET /user/groups returns client groups", async () => {
        const { app } = await buildApiApp({
            includeAdmin: false,
            includeUser: false,
            includeMcRoutes: true,
        });

        const res = await request(app)
            .get("/api/v1alpha1/user/groups")
            .set("x-test-auth", "1")
            .expect(200);

        expect(res.body).toEqual([{ id: "group-a", name: "group-a" }]);
    });

    it("GET /certs rejects malformed signedby query", async () => {
        const { app } = await buildApiApp({
            includeAdmin: false,
            includeUser: false,
            includeMcRoutes: true,
        });

        const res = await request(app)
            .get("/api/v1alpha1/certs")
            .query({ signedby: "not-a-uuid" })
            .set("x-test-auth", "1")
            .expect(400);

        expect(res.text).toContain("Malformed signedby reference");
    });

    it("GET /vans/:vid/config/nonconnecting returns network yaml", async () => {
        const { app } = await buildApiApp({
            includeAdmin: false,
            includeUser: false,
            includeMcRoutes: true,
        });

        const res = await request(app)
            .get(`/api/v1alpha1/vans/${TEST_UUIDS.van}/config/nonconnecting`)
            .set("x-test-auth", "1")
            .expect(200);

        expect(res.text).toContain("van-network-id");
    });

    it("GET /backbonesite/:bsid/links/outgoing/kube returns outgoing links as a ConfigMap manifest", async () => {
        const { app } = await buildApiApp({
            includeAdmin: false,
            includeUser: false,
            includeMcRoutes: true,
        });

        const res = await request(app)
            .get(`/api/v1alpha1/backbonesite/${TEST_UUIDS.site}/links/outgoing/kube`)
            .set("x-test-auth", "1")
            .expect(200);

        expect(res.text).toContain("kind: ConfigMap");
        expect(res.text).toContain("router.example.com");
        expect(res.text).toContain("5671");
    });

    it("POST /backbonesite/:bsid/ingress updates partial access points", async () => {
        mockFormFields = {
            [TEST_UUIDS.accessPoint]: {
                host: "ingress.example.com",
                port: "5671",
            },
        };
        const { app } = await buildApiApp({
            includeAdmin: false,
            includeUser: false,
            includeMcRoutes: true,
        });

        const res = await request(app)
            .post(`/api/v1alpha1/backbonesite/${TEST_UUIDS.site}/ingress`)
            .set("x-test-auth", "1")
            .expect(201);

        expect(res.body).toEqual({ processed: 1 });
    });

    it("GET /certs returns certificates with a superseded flag", async () => {
        const { app } = await buildApiApp({
            includeAdmin: false,
            includeUser: false,
            includeMcRoutes: true,
        });

        const res = await request(app)
            .get("/api/v1alpha1/certs")
            .set("x-test-auth", "1")
            .expect(200);

        expect(res.body).toEqual([{ id: TEST_UUIDS.cert, superseded: false }]);
        expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("AS superseded"));
    });

    it("POST /certs/:cid/rotate returns 202", async () => {
        RotateCertificate.mockResolvedValue({ id: TEST_UUIDS.cert });
        const { app } = await buildApiApp({
            includeAdmin: false,
            includeUser: false,
            includeMcRoutes: true,
        });

        const res = await request(app)
            .post(`/api/v1alpha1/certs/${TEST_UUIDS.cert}/rotate`)
            .set("x-test-auth", "1")
            .expect(202);

        expect(res.body).toEqual({ id: TEST_UUIDS.cert });
        expect(RotateCertificate).toHaveBeenCalledWith(TEST_UUIDS.cert);
    });

    it("POST /certs/:cid/rotate rejects a malformed id", async () => {
        const { app } = await buildApiApp({
            includeAdmin: false,
            includeUser: false,
            includeMcRoutes: true,
        });

        const res = await request(app)
            .post("/api/v1alpha1/certs/not-a-uuid/rotate")
            .set("x-test-auth", "1")
            .expect(400);

        expect(res.text).toContain("Malformed certificate ID");
        expect(RotateCertificate).not.toHaveBeenCalled();
    });

    it("POST /certs/:cid/rotate forwards certificate-manager errors", async () => {
        RotateCertificate.mockRejectedValue(
            Object.assign(new Error("Certificate has been superseded"), { statusCode: 409 })
        );
        const { app } = await buildApiApp({
            includeAdmin: false,
            includeUser: false,
            includeMcRoutes: true,
        });

        const res = await request(app)
            .post(`/api/v1alpha1/certs/${TEST_UUIDS.cert}/rotate`)
            .set("x-test-auth", "1")
            .expect(409);

        expect(res.text).toBe("Certificate has been superseded");
    });

    it("GET /vans/:vid/config/connecting/:apid overlays dual-trust CA and TLS rotation metadata", async () => {
        LoadSecret.mockResolvedValue({
            data: {
                "ca.crt": "b2xkLWNh",
                "tls.crt": "Y2VydA==",
                "tls.key": "a2V5",
            },
            metadata: { name: "van-cred-secret" },
        });
        overlayDualTrustCa.mockResolvedValue({
            "ca.crt": "ZHVhbC10cnVzdA==",
            "tls.crt": "Y2VydA==",
            "tls.key": "a2V5",
        });
        getTlsRotationMeta.mockResolvedValue({ ordinal: 3, lastValid: 1 });

        const { app } = await buildApiApp({
            includeAdmin: false,
            includeUser: false,
            includeMcRoutes: true,
        });

        const res = await request(app)
            .get(`/api/v1alpha1/vans/${TEST_UUIDS.van}/config/connecting/${TEST_UUIDS.accessPoint}`)
            .set("x-test-auth", "1")
            .expect(200);

        expect(LoadSecret).toHaveBeenCalledWith("van-cred-secret");
        expect(overlayDualTrustCa).toHaveBeenCalledWith(
            mockClient,
            TEST_UUIDS.cert,
            expect.objectContaining({ "ca.crt": "b2xkLWNh" })
        );
        expect(getTlsRotationMeta).toHaveBeenCalledWith(mockClient, TEST_UUIDS.cert);
        expect(res.text).toContain("van-network-id");
        expect(res.text).toContain("edge.example.com");
        expect(res.text).toContain("ZHVhbC10cnVzdA==");
        expect(res.text).toContain(META_ANNOTATION_TLS_ORDINAL);
        expect(res.text).toContain(META_ANNOTATION_TLS_LAST_VALID);
        expect(res.text).toContain("3");
        expect(res.text).toContain("1");
    });
});
