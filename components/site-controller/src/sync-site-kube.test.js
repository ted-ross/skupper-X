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
import {
    INJECT_TYPE_SITE,
    META_ANNOTATION_VMS_CONTROLLED,
    META_ANNOTATION_TLS_INJECT,
    META_ANNOTATION_TLS_ORDINAL,
    META_ANNOTATION_TLS_LAST_VALID,
} from "@vms/modules/common";

/** @type {Record<string, Function>} */
const stateSyncCallbacks = {};

vi.mock("@vms/modules/state-sync", () => ({
    UpdateLocalState: vi.fn(),
    Start: vi.fn(
        (
            _siteClass,
            _siteId,
            _address,
            onNewPeer,
            onPeerLost,
            onStateChange,
            onStateRequest,
            onPing
        ) => {
            stateSyncCallbacks.onNewPeer = onNewPeer;
            stateSyncCallbacks.onPeerLost = onPeerLost;
            stateSyncCallbacks.onStateChange = onStateChange;
            stateSyncCallbacks.onStateRequest = onStateRequest;
            stateSyncCallbacks.onPing = onPing;
        }
    ),
    CLASS_BACKBONE: "backbone",
    CLASS_MEMBER: "member",
    AddTarget: vi.fn(),
    AddConnection: vi.fn(),
}));

vi.mock("@vms/modules/kube", () => ({
    Annotation: vi.fn((obj, key) => obj?.metadata?.annotations?.[key]),
    GetSecrets: vi.fn(async () => []),
    GetConfigmaps: vi.fn(async () => []),
    GetDeployments: vi.fn(async () => []),
    GetPods: vi.fn(async () => []),
    GetListeners: vi.fn(async () => []),
    ApplyObject: vi.fn(),
    DeleteSecret: vi.fn(),
    DeleteConfigmap: vi.fn(),
    DeleteDeployment: vi.fn(),
    LoadSecret: vi.fn(),
    ReplaceSecret: vi.fn(),
    LoadConfigmap: vi.fn(),
    UpdateLink: vi.fn(),
    UpdateNetworkAccess: vi.fn(),
    UpdateRouterAccess: vi.fn(),
    LoadLink: vi.fn(async () => undefined),
    DeleteLink: vi.fn(),
    Controlled: vi.fn(
        (obj) => obj?.metadata?.annotations?.[META_ANNOTATION_VMS_CONTROLLED] === "true"
    ),
    DeleteRouterAccess: vi.fn(),
    DeleteNetworkAccess: vi.fn(),
    LoadRouterAccess: vi.fn(async () => undefined),
    LoadNetworkAccess: vi.fn(async () => undefined),
    LoadListener: vi.fn(async () => undefined),
    DeleteListener: vi.fn(),
}));

vi.mock("./ingress-v2.js", () => ({
    GetInitialState: vi.fn(async () => ({})),
    GetRouterAccessRole: vi.fn((kind) => {
        const roles = { manage: "normal", peer: "inter-router", member: "edge", van: "edge" };
        return roles[kind] ?? "normal";
    }),
    GetAccessPointKind: vi.fn(() => "member"),
}));

import { UpdateLocalState as StateSyncUpdateLocalState } from "@vms/modules/state-sync";
import {
    ApplyObject,
    Controlled,
    DeleteLink,
    GetSecrets,
    UpdateLink,
    LoadSecret,
    ReplaceSecret,
} from "@vms/modules/kube";
import { Start, UpdateLocalState } from "./sync-site-kube.js";

describe("UpdateLocalState", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        for (const key of Object.keys(stateSyncCallbacks)) {
            delete stateSyncCallbacks[key];
        }
        await Start("site-1", { id: "conn" }, false, "sk2");
    });

    it("stores access point state without syncing when no peer is connected", async () => {
        await UpdateLocalState("accessstatus-ap-1", "hash-1", {
            host: "router.example.com",
            port: 9090,
        });

        expect(StateSyncUpdateLocalState).not.toHaveBeenCalled();
    });

    it("clears local state when hash is null", async () => {
        await UpdateLocalState("accessstatus-ap-1", "hash-1", {
            host: "router.example.com",
            port: 9090,
        });
        await UpdateLocalState("accessstatus-ap-1", null, {});

        expect(StateSyncUpdateLocalState).not.toHaveBeenCalled();
    });

    it("forwards local state updates to the connected peer", async () => {
        GetSecrets.mockResolvedValue([]);
        await stateSyncCallbacks.onNewPeer("mgmt-peer", "management");

        await UpdateLocalState("accessstatus-ap-1", "hash-1", {
            host: "router.example.com",
            port: 9090,
        });

        expect(StateSyncUpdateLocalState).toHaveBeenCalledWith(
            "mgmt-peer",
            "accessstatus-ap-1",
            "hash-1"
        );
    });
});

describe("onStateChange", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        for (const key of Object.keys(stateSyncCallbacks)) {
            delete stateSyncCallbacks[key];
        }
        await Start("site-1", { id: "conn" }, true, "sk2");
        GetSecrets.mockResolvedValue([]);
        await stateSyncCallbacks.onNewPeer("mgmt-peer", "management");
    });

    it("creates a Link resource from remote state", async () => {
        GetSecrets.mockResolvedValue([
            {
                metadata: {
                    name: "site-client-secret",
                    annotations: {
                        [META_ANNOTATION_VMS_CONTROLLED]: "true",
                        [META_ANNOTATION_TLS_INJECT]: INJECT_TYPE_SITE,
                    },
                },
            },
        ]);
        Controlled.mockReturnValue(true);

        await stateSyncCallbacks.onStateChange("mgmt-peer", "link-link-1", "hash-link-1", {
            host: "router.example.com",
            port: "443",
            cost: "2",
        });

        expect(ApplyObject).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: "Link",
                metadata: expect.objectContaining({
                    name: expect.stringContaining("link"),
                    annotations: expect.objectContaining({
                        "vms/state-key": "link-link-1",
                    }),
                }),
                spec: expect.objectContaining({
                    cost: 2,
                    endpoints: [
                        expect.objectContaining({
                            host: "router.example.com",
                            port: "443",
                        }),
                    ],
                }),
            })
        );
    });

    it("deletes Link resources when remote hash is cleared", async () => {
        await stateSyncCallbacks.onStateChange("mgmt-peer", "link-link-2", null, {});

        expect(DeleteLink).toHaveBeenCalled();
    });

    it("updates an existing Link when hash changes", async () => {
        GetSecrets.mockResolvedValue([
            {
                metadata: {
                    name: "site-client-secret",
                    annotations: {
                        [META_ANNOTATION_VMS_CONTROLLED]: "true",
                        [META_ANNOTATION_TLS_INJECT]: INJECT_TYPE_SITE,
                    },
                },
            },
        ]);
        Controlled.mockReturnValue(true);
        UpdateLink.mockResolvedValue({});

        const existingLink = {
            apiVersion: "skupper.io/v2alpha1",
            kind: "Link",
            metadata: {
                name: "link-link-3",
                annotations: {
                    "vms/state-hash": "old-hash",
                    "vms/state-key": "link-link-3",
                    "vms/state-dir": "remote",
                },
            },
            spec: {},
        };
        const { LoadLink } = await import("@vms/modules/kube");
        LoadLink.mockResolvedValue(existingLink);

        await stateSyncCallbacks.onStateChange("mgmt-peer", "link-link-3", "new-hash", {
            host: "router.example.com",
            port: "5671",
            cost: "1",
        });

        expect(UpdateLink).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: "Link",
                metadata: expect.objectContaining({
                    annotations: expect.objectContaining({
                        "vms/state-hash": "new-hash",
                    }),
                }),
            })
        );
        expect(ApplyObject).not.toHaveBeenCalled();
    });

    it("creates a TLS secret without ordinal fields in the secret data", async () => {
        LoadSecret.mockResolvedValue(undefined);

        await stateSyncCallbacks.onStateChange("mgmt-peer", "tls-site-site-1", "hash-tls-1", {
            "tls.crt": "cert",
            "tls.key": "key",
            ordinal: "2",
            lastValid: "1",
        });

        expect(ApplyObject).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: "Secret",
                type: "kubernetes.io/tls",
                metadata: expect.objectContaining({
                    name: "vms-site-site-1",
                    annotations: expect.objectContaining({
                        "vms/state-key": "tls-site-site-1",
                        [META_ANNOTATION_TLS_INJECT]: INJECT_TYPE_SITE,
                        [META_ANNOTATION_TLS_ORDINAL]: "2",
                        [META_ANNOTATION_TLS_LAST_VALID]: "1",
                    }),
                }),
                data: {
                    "tls.crt": "cert",
                    "tls.key": "key",
                },
            })
        );
    });

    it("replaces an existing TLS secret when the hash changes", async () => {
        LoadSecret.mockResolvedValue({
            apiVersion: "v1",
            kind: "Secret",
            metadata: {
                name: "vms-site-site-1",
            },
            data: { "tls.crt": "old" },
        });

        await stateSyncCallbacks.onStateChange("mgmt-peer", "tls-site-site-1", "hash-tls-2", {
            "tls.crt": "new-cert",
            ordinal: "3",
            lastValid: "2",
        });

        expect(ReplaceSecret).toHaveBeenCalledWith(
            "vms-site-site-1",
            expect.objectContaining({
                kind: "Secret",
                metadata: expect.objectContaining({
                    annotations: expect.objectContaining({
                        "vms/state-hash": "hash-tls-2",
                        [META_ANNOTATION_TLS_ORDINAL]: "3",
                        [META_ANNOTATION_TLS_LAST_VALID]: "2",
                    }),
                }),
                data: { "tls.crt": "new-cert" },
            })
        );
        expect(ApplyObject).not.toHaveBeenCalled();
    });
});

describe("onStateRequest", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        for (const key of Object.keys(stateSyncCallbacks)) {
            delete stateSyncCallbacks[key];
        }
        await Start("site-1", { id: "conn" }, false, "sk2");
        GetSecrets.mockResolvedValue([]);
        await stateSyncCallbacks.onNewPeer("mgmt-peer", "management");
    });

    it("returns in-memory access point state for local keys", async () => {
        await UpdateLocalState("accessstatus-ap-9", "hash-ap-9", {
            host: "ingress.example.com",
            port: 8443,
        });

        const [hash, data] = await stateSyncCallbacks.onStateRequest(
            "mgmt-peer",
            "accessstatus-ap-9"
        );

        expect(hash).toBe("hash-ap-9");
        expect(data).toEqual({
            host: "ingress.example.com",
            port: 8443,
        });
    });
});
