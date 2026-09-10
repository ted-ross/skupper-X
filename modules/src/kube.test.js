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
    Annotation,
    Controlled,
    Namespace,
    kubeStatusCode,
    markCertificateForRenewal,
    Start,
    TriggerCertificateRenewal,
    ReplaceCertificate,
    ReplaceSecret,
    LoadCertificate,
} from "./kube.js";
import { META_ANNOTATION_VMS_CONTROLLED, META_ANNOTATION_STATE_ID } from "./common.js";

function createFakeK8s(api) {
    class KubeConfig {
        loadFromCluster() {}
        loadFromDefault() {}
        makeApiClient() {
            return api;
        }
    }
    return {
        KubeConfig,
        KubernetesObjectApi: { makeApiClient: () => api },
        Watch: class {},
        CoreV1Api: {},
        AppsV1Api: {},
        CustomObjectsApi: {},
    };
}

describe("kube helpers", () => {
    it("Annotation reads metadata annotations", () => {
        const obj = {
            metadata: {
                annotations: {
                    [META_ANNOTATION_STATE_ID]: "ap-1",
                },
            },
        };

        expect(Annotation(obj, META_ANNOTATION_STATE_ID)).toBe("ap-1");
        expect(Annotation({}, META_ANNOTATION_STATE_ID)).toBeUndefined();
        expect(Annotation(null, META_ANNOTATION_STATE_ID)).toBeUndefined();
    });

    it("Controlled detects vms-controlled resources", () => {
        expect(
            Controlled({
                metadata: {
                    annotations: {
                        [META_ANNOTATION_VMS_CONTROLLED]: "true",
                    },
                },
            })
        ).toBe(true);

        expect(
            Controlled({
                metadata: {
                    annotations: {
                        [META_ANNOTATION_VMS_CONTROLLED]: "false",
                    },
                },
            })
        ).toBe(false);
    });

    it("Namespace defaults to default before Start", () => {
        expect(Namespace()).toBe("default");
    });
});

describe("kubeStatusCode", () => {
    it("reads numeric status from error fields or HTTP-Code in the message", () => {
        expect(kubeStatusCode({ statusCode: 409 })).toBe(409);
        expect(kubeStatusCode({ code: 404 })).toBe(404);
        expect(kubeStatusCode({ response: { statusCode: 500 } })).toBe(500);
        expect(kubeStatusCode({ message: "HTTP-Code: 409 Conflict" })).toBe(409);
        expect(kubeStatusCode({ message: "no status" })).toBeUndefined();
    });
});

describe("markCertificateForRenewal", () => {
    it("replaces an existing Issuing condition and records observedGeneration", () => {
        const now = new Date("2026-09-08T12:00:00.000Z");
        const cert = {
            metadata: { name: "site-cert", generation: 7 },
            status: {
                notAfter: "2099-01-01T00:00:00Z",
                conditions: [
                    { type: "Ready", status: "True" },
                    { type: "Issuing", status: "False", reason: "Old" },
                ],
            },
        };

        const marked = markCertificateForRenewal(cert, now);

        expect(marked.status.notAfter).toBe("2099-01-01T00:00:00Z");
        expect(marked.status.conditions).toEqual([
            { type: "Ready", status: "True" },
            {
                type: "Issuing",
                status: "True",
                reason: "ManuallyTriggered",
                message: "Certificate re-issuance manually triggered",
                lastTransitionTime: now.toISOString(),
                observedGeneration: 7,
            },
        ]);
        expect(cert.status.conditions).toHaveLength(2);
    });
});

describe("certificate and secret writes", () => {
    let api;

    beforeEach(async () => {
        api = {
            getNamespacedCustomObject: vi.fn(async () => ({
                metadata: { name: "site-cert", generation: 3, namespace: "myns" },
                status: { conditions: [] },
            })),
            replaceNamespacedCustomObjectStatus: vi.fn(async (args) => args.body),
            replaceNamespacedCustomObject: vi.fn(async (args) => args.body),
            replaceNamespacedSecret: vi.fn(async (args) => args.body),
        };
        await Start(createFakeK8s(api), { readFileSync: () => "myns" }, {}, "myns");
    });

    it("TriggerCertificateRenewal patches certificate status", async () => {
        await TriggerCertificateRenewal("site-cert");

        expect(api.getNamespacedCustomObject).toHaveBeenCalledWith(
            expect.objectContaining({
                plural: "certificates",
                name: "site-cert",
                namespace: "myns",
            })
        );
        expect(api.replaceNamespacedCustomObjectStatus).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "site-cert",
                namespace: "myns",
                body: expect.objectContaining({
                    status: expect.objectContaining({
                        conditions: expect.arrayContaining([
                            expect.objectContaining({
                                type: "Issuing",
                                reason: "ManuallyTriggered",
                                observedGeneration: 3,
                            }),
                        ]),
                    }),
                }),
            })
        );
    });

    it("ReplaceCertificate writes the certificate object", async () => {
        const cert = { metadata: { name: "site-cert", namespace: "other-ns" } };
        await ReplaceCertificate(cert);
        expect(api.replaceNamespacedCustomObject).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "site-cert",
                namespace: "other-ns",
                body: cert,
            })
        );
    });

    it("ReplaceSecret uses the provided namespace when set", async () => {
        const secret = { metadata: { name: "tls-secret" } };
        await ReplaceSecret("tls-secret", secret, "colo-ns");
        expect(api.replaceNamespacedSecret).toHaveBeenCalledWith({
            name: "tls-secret",
            namespace: "colo-ns",
            body: secret,
        });
    });

    it("LoadCertificate reads the named certificate", async () => {
        await LoadCertificate("site-cert");
        expect(api.getNamespacedCustomObject).toHaveBeenCalledWith(
            expect.objectContaining({ name: "site-cert", namespace: "myns" })
        );
    });
});
