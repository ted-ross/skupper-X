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

exports.GetDeployments = async function() {
    let list = await v1AppApi.listNamespacedDeployment(namespace);
    return list.body.items;
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

exports.WatchSecrets = function(callback) {
    secretWatch.watch(
        `/api/v1/namespaces/${namespace}/secrets`,
        {},
        (type, apiObj, watchObj) => {
            callback(type, apiObj);
        },
        (err) => {
            if (err) {
                Log(`Secret Watch error: ${err}`);
            }
            exports.WatchSecrets(callback);
        }
    )
}

exports.WatchCertificates = function(callback) {
    certificateWatch.watch(
        `/apis/cert-manager.io/v1/namespaces/${namespace}/certificates`,
        {},
        (type, apiObj, watchObj) => {
            callback(type, apiObj);
        },
        (err) => {
            if (err) {
                Log(`Certificate Watch error: ${err}`);
            }
            exports.WatchCertificates(callback);
        }
    )
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
