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

const Log  = require('./log.js').Log;

var fs;
var YAML;
var k8s;
var kc;
var client;
var v1Api;
var v1AppApi;
var customApi;
var secretWatch;
var certificateWatch;
var configMapWatch;
var routeWatch;
var namespace = 'default';

exports.Namespace = function() {
    return namespace;
}

exports.Start = async function (k8s_mod, fs_mod, yaml_mod, in_cluster) {
    k8s  = k8s_mod;
    fs   = fs_mod;
    YAML = yaml_mod;

    kc = new k8s.KubeConfig();
    if (in_cluster) {
        kc.loadFromCluster();
    } else {
        kc.loadFromDefault();
    }

    client    = k8s.KubernetesObjectApi.makeApiClient(kc);
    v1Api     = kc.makeApiClient(k8s.CoreV1Api);
    v1AppApi  = kc.makeApiClient(k8s.AppsV1Api);
    customApi = kc.makeApiClient(k8s.CustomObjectsApi);

    secretWatch      = new k8s.Watch(kc);
    certificateWatch = new k8s.Watch(kc);
    configMapWatch   = new k8s.Watch(kc);
    routeWatch       = new k8s.Watch(kc);

    try {
        if (in_cluster) {
            namespace = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/namespace', 'utf8');
        } else {
            kc.contexts.forEach(context => {
                if (context.name == kc.currentContext) {
                    namespace = context.namespace;
                }
            });
        }
        Log(`Running in namespace: ${namespace}`);
    } catch (err) {
        Log(`Unable to determine namespace, assuming ${namespace}`);
    }
}

exports.GetIssuers = async function() {
    let list = await customApi.listNamespacedCustomObject(
        'cert-manager.io',
        'v1',
        namespace,
        'issuers'
    );
    return list.body.items;
}

exports.LoadIssuer = async function(name) {
    let issuer = await customApi.getNamespacedCustomObject(
        'cert-manager.io',
        'v1',
        namespace,
        'issuers',
        name
    );
    return issuer.body;
}

exports.DeleteIssuer = async function(name) {
    await customApi.deleteNamespacedCustomObject(
        'cert-manager.io',
        'v1',
        namespace,
        'issuers',
        name
    );
}

exports.GetCertificates = async function() {
    let list = await customApi.listNamespacedCustomObject(
        'cert-manager.io',
        'v1',
        namespace,
        'certificates'
    );
    return list.body.items;
}

exports.LoadCertificate = async function(name) {
    let cert = await customApi.getNamespacedCustomObject(
        'cert-manager.io',
        'v1',
        namespace,
        'certificates',
        name
    );
    return cert.body;
}

exports.DeleteCertificate = async function(name) {
    await customApi.deleteNamespacedCustomObject(
        'cert-manager.io',
        'v1',
        namespace,
        'certificates',
        name
    );
}

exports.GetSecrets = async function() {
    let list = await v1Api.listNamespacedSecret(namespace);
    return list.body.items;
}

exports.LoadSecret = async function(name) {
    let secret = await v1Api.readNamespacedSecret(name, namespace);
    return secret.body;
}

exports.DeleteSecret = async function(name) {
    await v1Api.deleteNamespacedSecret(name, namespace);
}

exports.GetConfigmaps = async function() {
    let list = await v1Api.listNamespacedConfigMap(namespace);
    return list.body.items;
}

exports.LoadConfigmap = async function(name) {
    let secret = await v1Api.readNamespacedConfigMap(name, namespace);
    return secret.body;
}

exports.DeleteConfigmap = async function(name) {
    await v1Api.deleteNamespacedConfigMap(name, namespace);
}

exports.GetDeployments = async function() {
    let list = await v1AppApi.listNamespacedDeployment(namespace);
    return list.body.items;
}

exports.GetServices = async function() {
    let list = await v1Api.listNamespacedService(namespace);
    return list.body.items;
}

exports.LoadService = async function(name) {
    let service = await v1Api.readNamespacedService(name, namespace);
    return service.body;
}

exports.DeleteService = async function(name) {
    Log(`Kube - Deleting service ${name}`);
    await v1Api.deleteNamespacedService(name, namespace);
}

exports.GetRoutes = async function() {
    let list = await customApi.listNamespacedCustomObject(
        'route.openshift.io',
        'v1',
        namespace,
        'routes'
    );
    return list.body.items;
}

exports.DeleteRoute = async function(name) {
    Log(`Kube - Deleting route ${name}`);
    await customApi.deleteNamespacedCustomObject(
        'route.openshift.io',
        'v1',
        namespace,
        'routes',
        name
    );
}

exports.LoadDeployment = async function(name) {
    let dep = await v1AppApi.readNamespacedDeployment(name, namespace);
    return dep.body;
}

exports.DeleteDeployment = async function(name) {
    await v1AppApi.deleteNamespacedDeployment(name, namespace);
}

exports.GetPods = async function() {
    let pods = await v1Api.listNamespacedPod(namespace)
    return pods.body.items;
}

var secretWatches = [];

const startWatchSecrets = function() {
    secretWatch.watch(
        `/api/v1/namespaces/${namespace}/secrets`,
        {},
        (type, apiObj, watchObj) => {
            for (const callback of secretWatches) {
                callback(type, apiObj);
            }
        },
        (err) => {
            if (err) {
                Log(`Secret Watch error: ${err}`);
            }
            startWatchSecrets();
        }
    )
}

exports.WatchSecrets = function(callback) {
    secretWatches.push(callback);
    if (secretWatches.length == 1) {
        startWatchSecrets();
    }
}


var configMapWatches = [];

const startWatchConfigMaps = function() {
    configMapWatch.watch(
        `/api/v1/namespaces/${namespace}/configmaps`,
        {},
        (type, apiObj, watchObj) => {
            for (const callback of configMapWatches) {
                callback(type, apiObj);
            }
        },
        (err) => {
            if (err) {
                Log(`Configmap Watch error: ${err}`);
            }
            exports.WatchConfigMaps();
        }
    )
}

exports.WatchConfigMaps = function(callback) {
    configMapWatches.push(callback);
    if (configMapWatches.length == 1) {
        startWatchConfigMaps();
    }
}

var certificateWatches = [];

const startWatchCertificates = function() {
    certificateWatch.watch(
        `/apis/cert-manager.io/v1/namespaces/${namespace}/certificates`,
        {},
        (type, apiObj, watchObj) => {
            for (const callback of certificateWatches) {
                callback(type, apiObj);
            }
        },
        (err) => {
            if (err) {
                Log(`Certificate Watch error: ${err}`);
            }
            exports.WatchCertificates();
        }
    )
}

exports.WatchCertificates = function(callback) {
    certificateWatches.push(callback);
    if (certificateWatches.length == 1) {
        startWatchCertificates();
    }
}

var routeWatches = [];

const startWatchRoutes = function() {
    routeWatch.watch(
        `/apis/route.openshift.io/v1/namespaces/${namespace}/routes`,
        {},
        (type, apiObj, watchObj) => {
            for (callback of routeWatches) {
                callback(type, apiObj);
            }
        },
        (err) => {
            if (err) {
                Log(`Route Watch error: ${err}`);
            }
            exports.WatchRoutes();
        }
    )
}

exports.WatchRoutes = function(callback) {
    routeWatches.push(callback);
    if (routeWatches.length == 1) {
        startWatchRoutes();
    }
}

exports.ApplyObject = function(obj) {
    if (obj.metadata.annotations == undefined) {
        obj.metadata.annotations = {};
    }
    obj.metadata.annotations["skupper.io/skx-controlled"] = "true";
    obj.metadata.namespace = namespace;
    Log(`Creating resource: ${obj.kind} ${obj.metadata.name}`);
    Log(obj);
    return client.create(obj);
}

exports.ApplyYaml = function(yaml) {
    let obj = YAML.parse(yaml);
    return ApplyObject(obj);
}
