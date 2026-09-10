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

vi.mock("./config.js", () => ({
    SiteControllerImage: () => "quay.io/skupper/vms-site-controller:test",
}));

import {
    HashOfData,
    HashOfConfigMap,
    HashOfObjectNoChildren,
    HashOfTlsPayload,
    tlsSyncData,
    Secret,
    BackboneSite,
    NetworkCR,
    NetworkLinkCR,
    AccessPointCR,
    Deployment,
} from "./resource-templates.js";
import {
    META_ANNOTATION_TLS_INJECT,
    META_ANNOTATION_TLS_ORDINAL,
    META_ANNOTATION_TLS_LAST_VALID,
    META_ANNOTATION_STATE_HASH,
    META_ANNOTATION_STATE_KEY,
    INJECT_TYPE_SITE,
} from "@vms/modules/common";

describe("resource-templates", () => {
    it("HashOfData is stable regardless of key order", () => {
        const a = HashOfData({ b: "2", a: "1" });
        const b = HashOfData({ a: "1", b: "2" });
        expect(a).toBe(b);
        expect(a).toMatch(/^[a-f0-9]{40}$/);
    });

    it("HashOfConfigMap hashes data map", () => {
        const hash = HashOfConfigMap({ data: { key: "value" } });
        expect(hash).toBe(HashOfData({ key: "value" }));
    });

    it("HashOfObjectNoChildren ignores nested objects", () => {
        const hash = HashOfObjectNoChildren({ name: "site", spec: { nested: true } });
        expect(hash).toBe(HashOfData({ name: "site" }));
    });

    it("tlsSyncData embeds ordinal metadata in the hashed payload", () => {
        const data = { "tls.crt": "cert" };
        expect(tlsSyncData(data)).toBe(data);
        expect(tlsSyncData(data, { lastValid: 0 })).toBe(data);
        expect(tlsSyncData(data, { ordinal: 2, lastValid: 1 })).toEqual({
            "tls.crt": "cert",
            ordinal: "2",
            lastValid: "1",
        });
    });

    it("HashOfTlsPayload matches HashOfData of the sync payload", () => {
        const data = { "tls.crt": "cert" };
        expect(HashOfTlsPayload(data)).toBe(HashOfData(data));
        expect(HashOfTlsPayload(data, { ordinal: 3, lastValid: 1 })).toBe(
            HashOfData({ "tls.crt": "cert", ordinal: "3", lastValid: "1" })
        );
        expect(HashOfTlsPayload(data, { ordinal: 3, lastValid: 1 })).not.toBe(HashOfData(data));
    });

    it("Secret annotates rotation metadata and hashes the TLS payload", () => {
        const tlsMeta = { ordinal: 2, lastValid: 0 };
        const secret = Secret(
            { data: { "tls.crt": "cert", "tls.key": "key" } },
            "vms-site-1",
            INJECT_TYPE_SITE,
            "tls-site-1",
            tlsMeta
        );

        expect(secret.kind).toBe("Secret");
        expect(secret.metadata.annotations[META_ANNOTATION_TLS_INJECT]).toBe(INJECT_TYPE_SITE);
        expect(secret.metadata.annotations[META_ANNOTATION_TLS_ORDINAL]).toBe("2");
        expect(secret.metadata.annotations[META_ANNOTATION_TLS_LAST_VALID]).toBe("0");
        expect(secret.metadata.annotations[META_ANNOTATION_STATE_KEY]).toBe("tls-site-1");
        expect(secret.metadata.annotations[META_ANNOTATION_STATE_HASH]).toBe(
            HashOfTlsPayload(secret.data, tlsMeta)
        );
    });

    it("BackboneSite produces expected CR shape", () => {
        const site = BackboneSite("backbone-a", "site-uuid-123");
        expect(site.kind).toBe("Site");
        expect(site.metadata.name).toBe("backbone-a");
        expect(site.spec.linkAccess).toBe("none");
    });

    it("NetworkCR embeds network id", () => {
        const cr = NetworkCR("van-network-id");
        expect(cr.kind).toBe("Network");
        expect(cr.spec.networkId).toBe("van-network-id");
    });

    it("NetworkLinkCR parses port as integer", () => {
        const cr = NetworkLinkCR("router.example.com", "443", "tls-secret");
        expect(cr.spec.port).toBe(443);
        expect(cr.spec.hostname).toBe("router.example.com");
    });

    it("AccessPointCR for van kind produces NetworkAccess", () => {
        const cr = AccessPointCR("ap-1", { kind: "van" });
        expect(cr.kind).toBe("NetworkAccess");
    });

    it("AccessPointCR for member kind produces RouterAccess with edge role", () => {
        const cr = AccessPointCR("ap-2", { kind: "member" });
        expect(cr.kind).toBe("RouterAccess");
        expect(cr.spec.roles[0].name).toBe("edge");
    });

    it("Deployment uses SiteControllerImage and Always pull policy by default", () => {
        const deployment = Deployment("site-uuid-1", true, "sk2");

        expect(deployment.kind).toBe("Deployment");
        expect(deployment.spec.template.spec.containers[0].image).toBe(
            "quay.io/skupper/vms-site-controller:test"
        );
        expect(deployment.spec.template.spec.containers[0].imagePullPolicy).toBe("Always");
        expect(deployment.spec.template.spec.containers[0].env).toContainEqual({
            name: "VMS_SITE_ID",
            value: "site-uuid-1",
        });
        expect(deployment.spec.template.spec.containers[0].env).toContainEqual({
            name: "VMS_BACKBONE",
            value: "YES",
        });
    });

    it("Deployment honors imageOverride with IfNotPresent pull policy", () => {
        const deployment = Deployment(
            "site-uuid-2",
            false,
            "sk2",
            "localhost:5001/vms-site-controller:kind-test"
        );

        expect(deployment.spec.template.spec.containers[0].image).toBe(
            "localhost:5001/vms-site-controller:kind-test"
        );
        expect(deployment.spec.template.spec.containers[0].imagePullPolicy).toBe("IfNotPresent");
        expect(deployment.spec.template.spec.containers[0].env).toContainEqual({
            name: "VMS_BACKBONE",
            value: "NO",
        });
    });
});
