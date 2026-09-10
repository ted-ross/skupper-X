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

import { describe, it, expect, vi } from "vitest";
import { createMockClient } from "./test-helpers/mock-db.js";

const mockClient = createMockClient();

vi.mock("@vms/modules/kube", () => ({
    LoadSecret: vi.fn(),
}));

vi.mock("@vms/modules/amqp", () => ({
    OpenReceiver: vi.fn(),
    OpenSender: vi.fn(),
}));

vi.mock("./backbone-links.js", () => ({
    RegisterHandler: vi.fn(),
}));

vi.mock("./db.js", () => ({
    ClientFromPool: vi.fn(async () => mockClient),
}));

vi.mock("./notify.js", () => ({
    NotifyTransaction: class {
        add() {}
        update() {}
        delete() {}
        async commit() {}
    },
}));

vi.mock("./tls-rotation.js", () => ({
    overlayDualTrustCa: vi.fn(async (_client, _certId, data) => data),
    getTlsRotationMeta: vi.fn(async () => ({ ordinal: 2, lastValid: 1 })),
}));

import { LoadSecret } from "@vms/modules/kube";
import { CompleteMember, _registerMemberCompletionForTest } from "./claim-server.js";
import {
    INJECT_TYPE_SITE,
    META_ANNOTATION_TLS_INJECT,
    META_ANNOTATION_TLS_ORDINAL,
    META_ANNOTATION_TLS_LAST_VALID,
    META_ANNOTATION_STATE_KEY,
} from "@vms/modules/common";

describe("CompleteMember", () => {
    it("handles unknown member id without throwing", async () => {
        await expect(CompleteMember("unknown-member-id")).resolves.toBeUndefined();
    });

    it("stores completion result and invokes callback for pending member", async () => {
        const callback = vi.fn();
        const completion = _registerMemberCompletionForTest("member-1", { callback });

        mockClient.query.mockImplementation(async (sql) => {
            if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
                return {};
            }
            if (sql.includes("FROM MemberSites")) {
                return {
                    rowCount: 1,
                    rows: [
                        {
                            certificate: "cert-1",
                            invitation: "inv-1",
                            objectname: "tls-secret",
                        },
                    ],
                };
            }
            if (sql.includes("FROM EdgeLinks")) {
                return { rows: [] };
            }
            return { rows: [] };
        });

        LoadSecret.mockResolvedValue({
            data: {
                "tls.crt": Buffer.from("cert").toString("base64"),
                "tls.key": Buffer.from("key").toString("base64"),
            },
        });

        await CompleteMember("member-1");

        expect(callback).toHaveBeenCalled();
        expect(LoadSecret).toHaveBeenCalledWith("tls-secret");
        expect(mockClient.release).toHaveBeenCalled();
        const siteClient = completion.result[1];
        expect(siteClient.metadata.name).toBe("vms-site-member-1");
        expect(siteClient.metadata.annotations[META_ANNOTATION_TLS_INJECT]).toBe(INJECT_TYPE_SITE);
        expect(siteClient.metadata.annotations[META_ANNOTATION_STATE_KEY]).toBe(
            "tls-site-member-1"
        );
        expect(siteClient.metadata.annotations[META_ANNOTATION_TLS_ORDINAL]).toBe("2");
        expect(siteClient.metadata.annotations[META_ANNOTATION_TLS_LAST_VALID]).toBe("1");
    });
});
