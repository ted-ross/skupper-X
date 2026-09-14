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

"use strict";

import {
    META_ANNOTATION_VMS_CONTROLLED,
    META_ANNOTATION_TLS_INJECT,
    META_ANNOTATION_STATE_TYPE,
    META_ANNOTATION_STATE_ID,
    META_ANNOTATION_STATE_DIR,
    META_ANNOTATION_STATE_KEY,
    META_ANNOTATION_STATE_HASH,
    STATE_TYPE_LINK,
} from "@vms/modules/common";
import { createHash } from "node:crypto";
import { SiteControllerImage } from "./config.js";

const CRD_API_VERSION = "skupper.io/v2alpha1";
const SA_NAME = "vms-site";
const ROLE_NAME = SA_NAME;
const ROLE_BINDING_NAME = SA_NAME;
const APPLICATION = "vms";
const ROUTER_LABEL = "vms-router";
const CM_NAME = "skupper-internal";
const DEPLOYMENT_NAME = "vms-site";
const COMPONENT_NAME = "site-controller";

export function HashOfData(data) {
    let text = "";
    const keys = Object.keys(data);
    keys.sort();
    for (const key of keys) {
        text += key + data[key];
    }
    return createHash("sha1").update(text).digest("hex");
}

export function HashOfSecret(secret) {
    return HashOfData(secret.data);
}

export function HashOfConfigMap(cm) {
    return HashOfData(cm.data);
}

export function HashOfObjectNoChildren(obj) {
    const data = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value != "object") {
            data[key] = value;
        }
    }

    return HashOfData(data);
}

export function HashOfSpec(obj) {
    return HashOfData(obj.spec);
}

export function BackboneSite(name, _siteId) {
    return {
        apiVersion: CRD_API_VERSION,
        kind: "Site",
        metadata: {
            name: name,
        },
        spec: {
            linkAccess: "none",
        },
    };
}

export function NetworkCR(networkId) {
    return {
        apiVersion: CRD_API_VERSION,
        kind: "Network",
        metadata: {
            name: "network",
        },
        spec: {
            networkId: networkId,
        },
    };
}

export function NetworkLinkCR(host, port, secret) {
    return {
        apiVersion: CRD_API_VERSION,
        kind: "NetworkLink",
        metadata: {
            name: "management-link",
        },
        spec: {
            hostname: host,
            port: parseInt(port, 10),
            tlsCredentials: secret,
        },
    };
}

export function LinkCR(linkId, data, secret) {
    const link = {
        apiVersion: "skupper.io/v2alpha1",
        kind: "Link",
        metadata: {
            name: `vms-link-${linkId}`,
            annotations: {
                [META_ANNOTATION_VMS_CONTROLLED]: "true",
                [META_ANNOTATION_STATE_TYPE]: STATE_TYPE_LINK,
                [META_ANNOTATION_STATE_ID]: linkId,
                [META_ANNOTATION_STATE_DIR]: "remote",
                [META_ANNOTATION_STATE_KEY]: `link-${linkId}`,
            },
        },
        spec: {
            cost: parseInt(data.cost, 10),
            endpoints: [
                {
                    group: "skupper-router",
                    name: "inter-router",
                    host: data.host,
                    port: data.port,
                },
            ],
            tlsCredentials: secret,
        },
    };

    link.metadata.annotations[META_ANNOTATION_STATE_HASH] = HashOfSpec(link);
    return link;
}

export function AccessPointCR(apId, data) {
    switch (data.kind) {
        case "manage":
            return accessPointRouterAccess(apId, data);
        case "van":
            return accessPointNetworkAccess(apId, data);
        case "claim":
            return accessPointRouterAccess(apId, data);
        case "peer":
            return accessPointRouterAccess(apId, data);
        case "member":
            return accessPointRouterAccess(apId, data);
        default:
            throw new Error(`Unknown access kind: ${data.kind}`);
    }
}

const short_access_name = function (name) {
    return name.split("-", 2).join("-");
};

function getRouterAccessRole(kind) {
    switch (kind) {
        case "manage":
            return "normal";
        case "claim":
            return "normal";
        case "peer":
            return "inter-router";
        case "member":
            return "edge";
        default:
            throw new Error(`Unknown kind: ${kind}`);
    }
}

export function RouterAccessColoManage(name, secretName) {
    return {
        apiVersion: "skupper.io/v2alpha1",
        kind: "RouterAccess",
        metadata: {
            name: name,
            annotations: {
                [META_ANNOTATION_VMS_CONTROLLED]: "true",
            },
        },
        spec: {
            tlsCredentials: secretName,
            generateTlsCredentials: false,
            roles: [
                {
                    name: getRouterAccessRole("manage"),
                },
            ],
            accessType: "local",
        },
    };
}

const accessPointRouterAccess = function (apId, data) {
    const name = short_access_name(`${data.kind}-${apId}`);
    const routerAccess = {
        apiVersion: "skupper.io/v2alpha1",
        kind: "RouterAccess",
        metadata: {
            name: name,
            annotations: {
                [META_ANNOTATION_VMS_CONTROLLED]: "true",
                [META_ANNOTATION_STATE_ID]: apId,
                [META_ANNOTATION_STATE_KEY]: `access-${apId}`,
                [META_ANNOTATION_STATE_DIR]: "remote",
            },
        },
        spec: {
            tlsCredentials: `vms-access-${apId}`,
            generateTlsCredentials: false,
            roles: [
                {
                    name: getRouterAccessRole(data.kind),
                },
            ],
            bindHost: "bindHost" in data ? data.bindHost : "",
            accessType: "accessType" in data ? data.accessType : "",
        },
    };
    return routerAccess;
};

const accessPointNetworkAccess = function (apId, data) {
    const name = short_access_name(`${data.kind}-${apId}`);
    const networkAccess = {
        apiVersion: "skupper.io/v2alpha1",
        kind: "NetworkAccess",
        metadata: {
            name: name,
            annotations: {
                [META_ANNOTATION_VMS_CONTROLLED]: "true",
                [META_ANNOTATION_STATE_ID]: apId,
                [META_ANNOTATION_STATE_KEY]: `access-${apId}`,
                [META_ANNOTATION_STATE_DIR]: "remote",
            },
        },
        spec: {
            tlsCredentials: `vms-access-${apId}`,
            generateTlsCredentials: false,
            bindHost: "bindHost" in data ? data.bindHost : "",
            accessType: "accessType" in data ? data.accessType : "",
        },
    };
    return networkAccess;
};

export function ConnectorCR(name, port, routingKey, selector, tlsCredentials) {
    const connector = {
        apiVersion: "skupper.io/v2alpha1",
        kind: "Connector",
        metadata: {
            name: name,
        },
        spec: {
            port: port,
            routingKey: routingKey,
            selector: selector,
            type: "tcp",
            tlsCredentials: tlsCredentials,
        },
    };
    return connector;
}

export function InterNetworkIngressCR(name, routingKey, networkLink = "", networkAccess = "") {
    const ingress = {
        apiVersion: "skupper.io/v2alpha1",
        kind: "InterNetworkIngress",
        metadata: {
            name: name,
        },
        spec: {
            routingKey: routingKey,
        },
    };
    if (networkLink) {
        ingress.spec.networkLink = networkLink;
    } else if (networkAccess) {
        ingress.spec.networkAccess = networkAccess;
    }
    return ingress;
}

export function Secret(certificate, profile_name, inject, stateKey) {
    const secret = {
        apiVersion: "v1",
        kind: "Secret",
        type: "kubernetes.io/tls",
        metadata: {
            name: profile_name,
            annotations: {
                [META_ANNOTATION_VMS_CONTROLLED]: "true",
            },
        },
        data: certificate.data,
    };

    if (inject) {
        secret.metadata.annotations[META_ANNOTATION_TLS_INJECT] = inject;
    }
    if (stateKey) {
        secret.metadata.annotations[META_ANNOTATION_STATE_DIR] = "remote";
        secret.metadata.annotations[META_ANNOTATION_STATE_KEY] = stateKey;
        secret.metadata.annotations[META_ANNOTATION_STATE_HASH] = HashOfSecret(secret);
    }

    return secret;
}

export function BackboneRole() {
    return {
        apiVersion: "rbac.authorization.k8s.io/v1",
        kind: "Role",
        metadata: {
            name: "vms-site",
            labels: {
                application: "vms",
            },
        },
        rules: [
            {
                apiGroups: [""],
                resources: ["secrets", "configmaps", "pods"],
                verbs: ["get", "list", "watch", "create", "update", "delete", "patch"],
            },
            {
                apiGroups: ["apps"],
                resources: ["deployments"],
                verbs: ["get", "list", "watch", "create", "update", "delete", "patch"],
            },
            {
                apiGroups: ["skupper.io"],
                resources: ["sites", "links", "networkaccesses", "routeraccesses", "listeners"],
                verbs: ["get", "list", "watch", "create", "update", "delete", "patch"],
            },
        ],
    };
}

export function ServiceAccount() {
    return {
        apiVersion: "v1",
        kind: "ServiceAccount",
        metadata: {
            name: SA_NAME,
            labels: {
                application: APPLICATION,
            },
        },
    };
}

export function RoleBinding() {
    return {
        apiVersion: "rbac.authorization.k8s.io/v1",
        kind: "RoleBinding",
        metadata: {
            name: ROLE_BINDING_NAME,
            labels: {
                application: APPLICATION,
            },
        },
        subjects: [
            {
                kind: "ServiceAccount",
                name: SA_NAME,
            },
        ],
        roleRef: {
            apiGroup: "rbac.authorization.k8s.io",
            kind: "Role",
            name: ROLE_NAME,
        },
    };
}

export function Deployment(bsid, backboneMode, target, imageOverride) {
    const deployment = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
            labels: {
                "app.kubernetes.io/name": DEPLOYMENT_NAME,
                "app.kubernetes.io/part-of": "vms",
                "skupper.io/component": COMPONENT_NAME,
                application: APPLICATION,
            },
            name: DEPLOYMENT_NAME,
        },
        spec: {
            progressDeadlineSeconds: 600,
            replicas: 1,
            revisionHistoryLimit: 10,
            selector: {
                matchLabels: {
                    "skupper.io/component": COMPONENT_NAME,
                },
            },
            strategy: {
                rollingUpdate: {
                    maxSurge: "25%",
                    maxUnavailable: "25%",
                },
                type: "RollingUpdate",
            },
            template: {
                metadata: {
                    labels: {
                        "app.kubernetes.io/name": DEPLOYMENT_NAME,
                        "app.kubernetes.io/part-of": "vms",
                        application: ROUTER_LABEL,
                        "skupper.io/component": COMPONENT_NAME,
                    },
                },
                spec: {
                    containers: [
                        {
                            image: imageOverride ?? SiteControllerImage(),
                            imagePullPolicy: imageOverride ? "IfNotPresent" : "Always",
                            name: "controller",
                            env: [
                                { name: "VMS_SITE_ID", value: bsid },
                                { name: "VMS_BACKBONE", value: backboneMode ? "YES" : "NO" },
                                { name: "VMS_PLATFORM", value: target },
                                { name: "NODE_ENV", value: "production" },
                                { name: "SIDECAR_MODE", value: "NO" },
                            ],
                            ports: [
                                {
                                    containerPort: 1040,
                                    name: "siteapi",
                                    protocol: "TCP",
                                },
                            ],
                            readinessProbe: {
                                failureThreshold: 3,
                                httpGet: {
                                    path: "/healthz",
                                    port: 1040,
                                    scheme: "HTTP",
                                },
                                initialDelaySeconds: 1,
                                periodSeconds: 10,
                                successThreshold: 1,
                                timeoutSeconds: 1,
                            },
                            resources: {},
                            securityContext: {
                                runAsNonRoot: true,
                            },
                            terminationMessagePath: "/dev/termination-log",
                            terminationMessagePolicy: "File",
                        },
                    ],
                    dnsPolicy: "ClusterFirst",
                    restartPolicy: "Always",
                    schedulerName: "default-scheduler",
                    securityContext: {
                        runAsNonRoot: true,
                    },
                    serviceAccount: SA_NAME,
                    serviceAccountName: SA_NAME,
                    terminationGracePeriodSeconds: 30,
                },
            },
        },
    };

    return deployment;
}
