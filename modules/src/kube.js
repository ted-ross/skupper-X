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

import { Log } from "./log.js";
import * as common from "./common.js";

const WATCH_ERROR_THRESHOLD = 10; // Log if threshold is exceeded in a minute's time.

let fs;
let YAML;
let k8s;
let kc;
let client;
let v1Api;
let v1AppApi;
let customApi;
let secretWatch;
let certificateWatch;
let configMapWatch;
let routeWatch;
let serviceWatch;
let podWatch;
let routerAccessWatch;
let networkAccessWatch;
let watchErrorCount = 0;
let lastWatchError;
let namespace = "default";

export function Annotation(obj, key) {
    if (obj?.metadata?.annotations) {
        return obj.metadata.annotations[key];
    }

    return undefined;
}

export function Controlled(obj) {
    return Annotation(obj, common.META_ANNOTATION_VMS_CONTROLLED) == "true";
}

export function Namespace() {
    return namespace;
}

export async function Start(k8s_mod, fs_mod, yaml_mod, standalone_namespace) {
    k8s = k8s_mod;
    fs = fs_mod;
    YAML = yaml_mod;

    kc = new k8s.KubeConfig();
    if (!standalone_namespace) {
        kc.loadFromCluster();
    } else {
        kc.loadFromDefault();
    }

    client = k8s.KubernetesObjectApi.makeApiClient(kc);
    v1Api = kc.makeApiClient(k8s.CoreV1Api);
    v1AppApi = kc.makeApiClient(k8s.AppsV1Api);
    customApi = kc.makeApiClient(k8s.CustomObjectsApi);

    secretWatch = new k8s.Watch(kc);
    certificateWatch = new k8s.Watch(kc);
    configMapWatch = new k8s.Watch(kc);
    routeWatch = new k8s.Watch(kc);
    serviceWatch = new k8s.Watch(kc);
    podWatch = new k8s.Watch(kc);
    routerAccessWatch = new k8s.Watch(kc);
    networkAccessWatch = new k8s.Watch(kc);

    try {
        if (standalone_namespace) {
            namespace = standalone_namespace;
        } else {
            namespace = fs.readFileSync(
                "/var/run/secrets/kubernetes.io/serviceaccount/namespace",
                "utf8"
            );
        }
        Log(`Running in namespace: ${namespace}`);
    } catch {
        Log(`Unable to determine namespace, assuming ${namespace}`);
    }
}

export async function GetIssuers() {
    const list = await customApi.listNamespacedCustomObject({
        group: "cert-manager.io",
        version: "v1",
        namespace: namespace,
        plural: "issuers",
    });
    return list.items;
}

export async function LoadIssuer(name) {
    return await customApi.getNamespacedCustomObject({
        group: "cert-manager.io",
        version: "v1",
        namespace: namespace,
        plural: "issuers",
        name: name,
    });
}

export async function DeleteIssuer(name) {
    await customApi.deleteNamespacedCustomObject({
        group: "cert-manager.io",
        version: "v1",
        namespace: namespace,
        plural: "issuers",
        name: name,
    });
}

export async function GetCertificates() {
    const list = await customApi.listNamespacedCustomObject({
        group: "cert-manager.io",
        version: "v1",
        namespace: namespace,
        plural: "certificates",
    });
    return list.items;
}

export async function LoadCertificate(name) {
    return await customApi.getNamespacedCustomObject({
        group: "cert-manager.io",
        version: "v1",
        namespace: namespace,
        plural: "certificates",
        name: name,
    });
}

export function kubeStatusCode(err) {
    const direct = err?.statusCode || err?.code || err?.response?.statusCode;
    if (typeof direct === "number") {
        return direct;
    }
    const match = /HTTP-Code:\s*(\d+)/.exec(err?.message || "");
    return match ? Number(match[1]) : direct;
}

export function markCertificateForRenewal(cert, now = new Date()) {
    const issuing = {
        type: "Issuing",
        status: "True",
        reason: "ManuallyTriggered",
        message: "Certificate re-issuance manually triggered",
        lastTransitionTime: now.toISOString(),
    };
    if (cert.metadata?.generation !== undefined) {
        issuing.observedGeneration = cert.metadata.generation;
    }
    const existing = Array.isArray(cert.status?.conditions) ? cert.status.conditions : [];
    const conditions = existing.filter((condition) => condition.type !== "Issuing");
    conditions.push(issuing);
    return {
        ...cert,
        status: {
            ...cert.status,
            conditions,
        },
    };
}

export async function TriggerCertificateRenewal(name) {
    const cert = await LoadCertificate(name);
    const body = markCertificateForRenewal(cert);
    return await customApi.replaceNamespacedCustomObjectStatus({
        group: "cert-manager.io",
        version: "v1",
        namespace: namespace,
        plural: "certificates",
        name: name,
        body,
    });
}

export async function ReplaceCertificate(obj) {
    return await customApi.replaceNamespacedCustomObject({
        group: "cert-manager.io",
        version: "v1",
        namespace: obj.metadata?.namespace || namespace,
        plural: "certificates",
        name: obj.metadata.name,
        body: obj,
    });
}

export async function DeleteCertificate(name) {
    await customApi.deleteNamespacedCustomObject({
        group: "cert-manager.io",
        version: "v1",
        namespace: namespace,
        plural: "certificates",
        name: name,
    });
}

export async function GetSecrets() {
    const list = await v1Api.listNamespacedSecret({ namespace: namespace });
    return list.items;
}

export async function LoadSecret(name, ns) {
    try {
        return await v1Api.readNamespacedSecret({
            name: name,
            namespace: ns || namespace,
        });
    } catch {
        return undefined;
    }
}

export async function ReplaceSecret(name, obj, ns) {
    await v1Api.replaceNamespacedSecret({
        name: name,
        namespace: ns || namespace,
        body: obj,
    });
}

export async function DeleteSecret(name) {
    Log(`Deleting Secret: ${name}`);
    await v1Api.deleteNamespacedSecret({ name: name, namespace: namespace });
}

export async function GetConfigmaps() {
    const list = await v1Api.listNamespacedConfigMap({ namespace: namespace });
    return list.items;
}

export async function LoadConfigmap(name) {
    try {
        return await v1Api.readNamespacedConfigMap({
            name: name,
            namespace: namespace,
        });
    } catch {
        return undefined;
    }
}

export async function ReplaceConfigmap(name, obj) {
    await v1Api.replaceNamespacedConfigMap({
        name: name,
        namespace: namespace,
        body: obj,
    });
}

export async function DeleteConfigmap(name) {
    await v1Api.deleteNamespacedConfigMap({ name: name, namespace: namespace });
}

export async function GetNamespaces() {
    try {
        return await v1Api.listNamespace().then((data) => data.items);
    } catch {
        Log("Error listing namespaces");
    }
}

export async function createNamespace(name) {
    try {
        await v1Api.createNamespace({
            body: {
                metadata: {
                    name: name,
                    annotations: {
                        [common.META_ANNOTATION_VMS_CONTROLLED]: "true",
                    },
                },
            },
        });
    } catch (err) {
        Log(`Error creating namespace ${name}: ${err.message}`);
    }
}

export async function deleteNamespace(name) {
    try {
        await v1Api.deleteNamespace({ name: name });
    } catch (err) {
        Log(`Error deleting namespace ${name}: ${err.message}`);
    }
}

export async function GetPods() {
    const list = await v1Api.listNamespacedPod({ namespace: namespace });
    return list.items;
}

export async function getPodsByLabel(ns, labelSelector) {
    try {
        const response = await v1Api.listNamespacedPod({
            namespace: ns,
            labelSelector: labelSelector,
        });
        return response.items;
    } catch {
        return [];
    }
}

export async function waitPodsRunning(ns, label, interval = 1000, attempts = 30) {
    for (let i = 0; i < attempts; i++) {
        let all_running = true;
        try {
            const pods = await getPodsByLabel(ns, label);
            if (pods.length == 0) {
                all_running = false;
            }
            for (const pod of pods) {
                if (pod.status.phase != "Running") {
                    all_running = false;
                    break;
                }
            }
        } catch (err) {
            console.error("Error fetching pod status:", err.message);
            all_running = false;
        }
        if (all_running) {
            return true;
        }
        if (i + 1 < attempts) {
            await new Promise((resolve) => setTimeout(resolve, interval));
        }
    }
    return false;
}

export async function LoadPod(name) {
    try {
        return await v1Api.readNamespacedPod({ name: name, namespace: namespace });
    } catch {
        return undefined;
    }
}

export async function ReplacePod(name, obj) {
    await v1Api.ReplaceNamespacedPod({
        name: name,
        namespace: namespace,
        body: obj,
    });
}

export async function DeletePod(name) {
    await v1Api.DeleteNamespacedPod({ name: name, namespace: namespace });
}

export async function GetDeployments() {
    const list = await v1AppApi.listNamespacedDeployment({ namespace: namespace });
    return list.items;
}

export async function GetServices() {
    const list = await v1Api.listNamespacedService({ namespace: namespace });
    return list.items;
}

export async function LoadService(name) {
    try {
        return await v1Api.readNamespacedService({
            name: name,
            namespace: namespace,
        });
    } catch {
        return undefined;
    }
}

export async function ReplaceService(name, obj) {
    await v1Api.replaceNamespacedService({
        name: name,
        namespace: namespace,
        body: obj,
    });
}

export async function DeleteService(name) {
    await v1Api.deleteNamespacedService({ name: name, namespace: namespace });
}

export async function GetRoutes() {
    const list = await customApi.listNamespacedCustomObject({
        group: "route.openshift.io",
        version: "v1",
        namespace: namespace,
        plural: "routes",
    });
    return list.items;
}

export async function DeleteRoute(name) {
    await customApi.deleteNamespacedCustomObject({
        group: "route.openshift.io",
        version: "v1",
        namespace: namespace,
        plural: "routes",
        name: name,
    });
}

export async function LoadDeployment(name) {
    return await v1AppApi.readNamespacedDeployment({
        name: name,
        namespace: namespace,
    });
}

export async function DeleteDeployment(name) {
    await v1AppApi.deleteNamespacedDeployment({
        name: name,
        namespace: namespace,
    });
}

export async function GetSites(ns) {
    const list = await customApi.listNamespacedCustomObject({
        group: "skupper.io",
        version: "v2alpha1",
        namespace: ns || namespace,
        plural: "sites",
    });
    return list.items;
}

export async function GetNetworkAccesses() {
    const list = await customApi.listNamespacedCustomObject({
        group: "skupper.io",
        version: "v2alpha1",
        namespace: namespace,
        plural: "networkaccesses",
    });
    return list.items;
}

export async function LoadNetworkAccess(name) {
    const resource = await customApi.getNamespacedCustomObject({
        group: "skupper.io",
        version: "v2alpha1",
        name: name,
        namespace: namespace,
        plural: "networkaccesses",
    });
    return resource;
}

export async function GetRouterAccesses(ns) {
    const list = await customApi.listNamespacedCustomObject({
        group: "skupper.io",
        version: "v2alpha1",
        namespace: ns || namespace,
        plural: "routeraccesses",
    });
    return list.items;
}

export async function LoadRouterAccess(name, ns) {
    try {
        const resource = await customApi.getNamespacedCustomObject({
            group: "skupper.io",
            version: "v2alpha1",
            name: name,
            namespace: ns || namespace,
            plural: "routeraccesses",
        });
        return resource;
    } catch {
        return undefined;
    }
}

export async function GetListeners(ns) {
    const list = await customApi.listNamespacedCustomObject({
        group: "skupper.io",
        version: "v2alpha1",
        namespace: ns || namespace,
        plural: "listeners",
    });
    return list.items;
}

export async function LoadListener(name, ns) {
    return await customApi.getNamespacedCustomObject({
        group: "skupper.io",
        version: "v2alpha1",
        namespace: ns || namespace,
        plural: "listeners",
        name: name,
    });
}

export async function DeleteListener(name) {
    await DeleteSkupperResource("listeners", name);
}

export async function DeleteSkupperResource(plural, name) {
    await customApi.deleteNamespacedCustomObject({
        group: "skupper.io",
        version: "v2alpha1",
        namespace: namespace,
        plural: plural,
        name: name,
    });
}

export async function UpdateSkupperResource(plural, name, obj) {
    return await customApi.replaceNamespacedCustomObject({
        group: "skupper.io",
        version: "v2alpha1",
        namespace: namespace,
        plural: plural,
        name: name,
        body: obj,
    });
}

export async function DeleteRouterAccess(name) {
    await DeleteSkupperResource("routeraccesses", name);
}

export async function DeleteNetworkAccess(name) {
    await DeleteSkupperResource("networkaccesses", name);
}

export async function UpdateLink(obj) {
    return await UpdateSkupperResource("links", obj.metadata.name, obj);
}

export async function UpdateRouterAccess(obj) {
    return await UpdateSkupperResource("routeraccesses", obj.metadata.name, obj);
}

export async function UpdateNetworkAccess(obj) {
    return await UpdateSkupperResource("networkaccesses", obj.metadata.name, obj);
}

export async function LoadLink(name) {
    return await customApi.getNamespacedCustomObject({
        group: "skupper.io",
        version: "v2alpha1",
        namespace: namespace,
        plural: "links",
        name: name,
    });
}

export async function GetLinks() {
    const list = await customApi.listNamespacedCustomObject({
        group: "skupper.io",
        version: "v2alpha1",
        namespace: namespace,
        plural: "links",
    });
    return list.items;
}

export async function DeleteLink(name) {
    await DeleteSkupperResource("links", name);
}

const secretWatches = [];

const startWatchSecrets = function () {
    secretWatch.watch(
        `/api/v1/namespaces/${namespace}/secrets`,
        {},
        (type, apiObj, _watchObj) => {
            for (const callback of secretWatches) {
                callback(type, apiObj);
            }
        },
        (err) => {
            if (err) {
                watchErrorCount++;
                lastWatchError = `Secrets: ${err}`;
            }
            startWatchSecrets();
        }
    );
};

export function WatchSecrets(callback) {
    secretWatches.push(callback);
    if (secretWatches.length == 1) {
        startWatchSecrets();
    }
}

const configMapWatches = [];

const startWatchConfigMaps = function () {
    configMapWatch.watch(
        `/api/v1/namespaces/${namespace}/configmaps`,
        {},
        (type, apiObj, _watchObj) => {
            for (const callback of configMapWatches) {
                callback(type, apiObj);
            }
        },
        (err) => {
            if (err) {
                watchErrorCount++;
                lastWatchError = `ConfigMaps: ${err}`;
            }
            startWatchConfigMaps();
        }
    );
};

export function WatchConfigMaps(callback) {
    configMapWatches.push(callback);
    if (configMapWatches.length == 1) {
        startWatchConfigMaps();
    }
}

const certificateWatches = [];

const startWatchCertificates = function () {
    certificateWatch.watch(
        `/apis/cert-manager.io/v1/namespaces/${namespace}/certificates`,
        {},
        (type, apiObj, _watchObj) => {
            for (const callback of certificateWatches) {
                callback(type, apiObj);
            }
        },
        (err) => {
            if (err) {
                watchErrorCount++;
                lastWatchError = `Certificates: ${err}`;
            }
            startWatchCertificates();
        }
    );
};

export function WatchCertificates(callback) {
    certificateWatches.push(callback);
    if (certificateWatches.length == 1) {
        startWatchCertificates();
    }
}

const routeWatches = [];

const startWatchRoutes = function () {
    routeWatch.watch(
        `/apis/route.openshift.io/v1/namespaces/${namespace}/routes`,
        {},
        (type, apiObj, _watchObj) => {
            for (const callback of routeWatches) {
                callback(type, apiObj);
            }
        },
        (err) => {
            if (err) {
                watchErrorCount++;
                lastWatchError = `Routes: ${err}`;
            }
            startWatchRoutes();
        }
    );
};

export function WatchRoutes(callback) {
    routeWatches.push(callback);
    if (routeWatches.length == 1) {
        startWatchRoutes();
    }
}

const serviceWatches = [];

const startWatchServices = function () {
    serviceWatch.watch(
        `/api/v1/namespaces/${namespace}/services`,
        {},
        (type, apiObj, _watchObj) => {
            for (const callback of serviceWatches) {
                callback(type, apiObj);
            }
        },
        (err) => {
            if (err) {
                watchErrorCount++;
                lastWatchError = `Services: ${err}`;
            }
            startWatchServices();
        }
    );
};

export function WatchServices(callback) {
    serviceWatches.push(callback);
    if (serviceWatches.length == 1) {
        startWatchServices();
    }
}

const podWatches = [];

const startWatchPods = function () {
    podWatch.watch(
        `/api/v1/namespaces/${namespace}/pods`,
        {},
        (type, apiObj, _watchObj) => {
            for (const callback of podWatches) {
                callback(type, apiObj);
            }
        },
        (err) => {
            if (err) {
                watchErrorCount++;
                lastWatchError = `Pods: ${err}`;
            }
            startWatchPods();
        }
    );
};

export function WatchPods(callback) {
    podWatches.push(callback);
    if (podWatches.length == 1) {
        startWatchPods();
    }
}

const routerAccessWatches = {}; // {namespace => list of watches}
const startWatchRouterAccesses = function (ns) {
    routerAccessWatch.watch(
        `/apis/skupper.io/v2alpha1/namespaces/${ns}/routeraccesses`,
        {},
        (type, apiObj, _watchObj) => {
            const toDelete = [];
            for (const callback of routerAccessWatches[ns]) {
                if (callback(type, apiObj) === "cancel") {
                    toDelete.push(callback);
                }
            }
            routerAccessWatches[ns] = routerAccessWatches[ns].filter(
                (item) => !toDelete.includes(item)
            );
        },
        (err) => {
            if (err) {
                watchErrorCount++;
                lastWatchError = `RouterAccesses: ${err}`;
            }
            if (routerAccessWatches[ns].length > 0) {
                startWatchRouterAccesses(ns);
            }
        }
    );
};

export function startWatchRouterAccessesFn(callback, ns) {
    ns = ns || namespace;
    if (!routerAccessWatches[ns]) {
        routerAccessWatches[ns] = [];
    }
    routerAccessWatches[ns].push(callback);
    if (routerAccessWatches[ns].length == 1) {
        startWatchRouterAccesses(ns);
    }
}

// Keep the old export name for compatibility
export { startWatchRouterAccessesFn as startWatchRouterAccesses };

const networkAccessWatches = [];
export function startWatchNetworkAccesses() {
    networkAccessWatch.watch(
        `/apis/skupper.io/v2alpha1/namespaces/${namespace}/networkaccesses`,
        {},
        (type, apiObj, _watchObj) => {
            for (const callback of networkAccessWatches) {
                callback(type, apiObj);
            }
        },
        (err) => {
            if (err) {
                watchErrorCount++;
                lastWatchError = `NetworkAccesses: ${err}`;
            }
            startWatchNetworkAccesses();
        }
    );
}

export function WatchNetworkAccesses(callback) {
    networkAccessWatches.push(callback);
    if (networkAccessWatches.length == 1) {
        startWatchNetworkAccesses();
    }
}

export async function ApplyObject(obj, ns = "") {
    try {
        if (obj.metadata.annotations == undefined) {
            obj.metadata.annotations = {};
        }
        obj.metadata.annotations[common.META_ANNOTATION_VMS_CONTROLLED] = "true";
        obj.metadata.namespace = ns || namespace;
        Log(`Creating resource: ${obj.kind} ${obj.metadata.name}`);
        return await client.create(obj);
    } catch (error) {
        Log(
            `Exception in kube.ApplyObject: kind: ${obj.kind}, name: ${obj.metadata.name}:  ${error.message}`
        );
    }
}

//
// Watchers normally fail (are aborted) after a number of minutes, depending on the configuration of the platform.
// We do not wish to pollute the log with benign watch-fail indications.  However, there are failure modes like
// lack of watch permissions that will fail immediately.  We do need to see these in the logs to know that the role
// rights need to be fixed.  This mechanism will provide legit watch errors every minute.
//
const logWatchErrors = function () {
    if (watchErrorCount > WATCH_ERROR_THRESHOLD) {
        Log(
            `Watch error rate exceeded threshold:  ${watchErrorCount} in the last minute - ${lastWatchError}`
        );
    }
    watchErrorCount = 0;
    setTimeout(logWatchErrors, 60 * 1000);
};

export async function ApplyYaml(yaml) {
    setTimeout(logWatchErrors, 60 * 1000); // TODO - Check this.  It's probably not right
    const obj = YAML.parse(yaml);
    return await ApplyObject(obj);
}
