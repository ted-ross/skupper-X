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

const config = require('./config.js');
const yaml   = require('js-yaml');
const sync   = require('./manage-sync.js');

const SA_NAME           = 'skupperx-site';
const ROLE_NAME         = SA_NAME;
const ROLE_BINDING_NAME = SA_NAME;
const APPLICATION       = 'skupperx';
const ROUTER_LABEL      = 'skx-router';
const CM_NAME           = 'skupper-internal';
const DEPLOYMENT_NAME   = 'skupperx-site';

exports.ServiceAccountYaml = function() {
    return `---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ${SA_NAME}
  labels:
    application: ${APPLICATION}
`;
}

exports.BackboneRoleYaml = function() {
    return `---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ${ROLE_NAME}
  labels:
    application: ${APPLICATION}
rules:
- apiGroups: [""]
  resources: ["configmaps", "pods", "pods/exec", "services", "secrets", "serviceaccounts", "events"]
  verbs: ["get", "list", "watch", "create", "update", "delete", "patch"]
- apiGroups: ["apps"]
  resources: ["deployments", "statefulsets", "daemonsets"]
  verbs: ["get", "list", "watch", "create", "update", "delete"]
- apiGroups: ["route.openshift.io"]
  resources: ["routes"]
  verbs: ["get", "list", "watch", "create", "delete"]
- apiGroups: ["networking.k8s.io"]
  resources: ["ingresses", "networkpolicies"]
  verbs: ["get", "list", "watch", "create", "delete"]
- apiGroups: ["projectcontour.io"]
  resources: ["httpproxies"]
  verbs: ["get", "list", "watch", "create", "delete"]
- apiGroups: ["rbac.authorization.k8s.io"]
  resources: ["rolebindings", "roles"]
  verbs: ["get", "list", "watch", "create", "delete"]
- apiGroups: ["apps.openshift.io"]
  resources: ["deploymentconfigs"]
  verbs: ["get", "list", "watch"]
`;
}

exports.MemberRoleYaml = function() {
  return `---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ${ROLE_NAME}
  labels:
    application: ${APPLICATION}
rules:
- apiGroups: [""]
  resources: ["configmaps", "pods", "pods/exec", "services", "secrets", "serviceaccounts", "events"]
  verbs: ["get", "list", "watch", "create", "update", "delete", "patch"]
- apiGroups: ["apps"]
  resources: ["deployments", "statefulsets", "daemonsets"]
  verbs: ["get", "list", "watch", "create", "update", "delete"]
`;
}

exports.RoleBindingYaml = function() {
    return `---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  labels:
    application: ${APPLICATION}
  name: ${ROLE_BINDING_NAME}
subjects:
- kind: ServiceAccount
  name: ${SA_NAME}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: ${ROLE_NAME}
`;
}

exports.ConfigMapYaml = function(mode) {
    return `---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${CM_NAME}
data:
  skrouterd.json: |-
    [
        [
            "router",
            {
                "id": "skx-\${HOSTNAME}",
                "mode": "${mode}",
                "helloMaxAgeSeconds": "3",
                "metadata": "{\\"version\\":\\"1.4.3\\",\\"platform\\":\\"kubernetes\\"}"
            }
        ],
        [
            "listener",
            {
                "name": "health",
                "role": "normal",
                "port": 9090,
                "http": true,
                "httpRootDir": "disabled",
                "healthz": true,
                "metrics": true
            }
        ],
        [
            "listener",
            {
                "name": "sidecar",
                "host": "localhost",
                "port": 5672
            }
        ],
        [
            "address",
            {
                "prefix": "mc",
                "distribution": "multicast"
            }
        ],
        [
            "log",
            {
                "module": "ROUTER_CORE",
                "enable": "error+"
            }
        ]
    ]
`;
}

exports.DeploymentYaml = function(bsid, backboneMode) {
    return `---
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app.kubernetes.io/name: ${DEPLOYMENT_NAME}
    app.kubernetes.io/part-of: skupperx
    skupper.io/component: router
    application: ${APPLICATION}
  name: ${DEPLOYMENT_NAME}
spec:
  progressDeadlineSeconds: 600
  replicas: 1
  revisionHistoryLimit: 10
  selector:
    matchLabels:
      skupper.io/component: router
  strategy:
    rollingUpdate:
      maxSurge: 25%
      maxUnavailable: 25%
    type: RollingUpdate
  template:
    metadata:
      annotations:
        prometheus.io/port: "9090"
        prometheus.io/scrape: "true"
      labels:
        app.kubernetes.io/name: ${DEPLOYMENT_NAME}
        app.kubernetes.io/part-of: skupperx
        application: ${ROUTER_LABEL}
        skupper.io/component: router
    spec:
      containers:
      - env:
        - name: APPLICATION_NAME
          value: ${APPLICATION}
        - name: POD_NAMESPACE
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: metadata.namespace
        - name: POD_IP
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: status.podIP
        - name: QDROUTERD_AUTO_MESH_DISCOVERY
          value: QUERY
        - name: QDROUTERD_CONF
          value: /etc/skupper-router/config/skrouterd.json
        - name: QDROUTERD_CONF_TYPE
          value: json
        image: ${config.SiteDataplaneImage()}
        imagePullPolicy: Always
        livenessProbe:
          failureThreshold: 3
          httpGet:
            path: /healthz
            port: 9090
            scheme: HTTP
          initialDelaySeconds: 60
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 1
        name: router
        ports:
        - containerPort: 9090
          name: http
          protocol: TCP
        - containerPort: 55671
          name: peer
          protocol: TCP
        - containerPort: 45671
          name: member
          protocol: TCP
        - containerPort: 45670
          name: manage
          protocol: TCP
        - containerPort: 45669
          name: claim
          protocol: TCP
        readinessProbe:
          failureThreshold: 3
          httpGet:
            path: /healthz
            port: 9090
            scheme: HTTP
          initialDelaySeconds: 1
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 1
        resources: {}
        securityContext:
          runAsNonRoot: true
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /etc/skupper-router/config/
          name: router-config
        - mountPath: /etc/skupper-router-certs
          name: skupper-router-certs
      - image: ${config.BackboneControllerImage()}
        imagePullPolicy: Always
        name: controller
        env:
        - name: SKUPPERX_SITE_ID
          value: ${bsid}
        - name: SKX_BACKBONE
          value: "${backboneMode ? 'YES' : 'NO'}"
        ports:
        - containerPort: 8086
          name: http
          protocol: TCP
        readinessProbe:
          failureThreshold: 3
          httpGet:
            path: /healthz
            port: 8086
            scheme: HTTP
          initialDelaySeconds: 1
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 1
        resources: {}
        securityContext:
          runAsNonRoot: true
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /etc/skupper-router-certs
          name: skupper-router-certs
      dnsPolicy: ClusterFirst
      restartPolicy: Always
      schedulerName: default-scheduler
      securityContext:
        runAsNonRoot: true
      serviceAccount: ${SA_NAME}
      serviceAccountName: ${SA_NAME}
      terminationGracePeriodSeconds: 30
      volumes:
      - configMap:
          defaultMode: 420
          name: skupper-internal
        name: router-config
      - emptyDir: {}
        name: skupper-router-certs
`;
}

exports.SecretYaml = function(certificate, profile_name) {
    let secret = {
        apiVersion: 'v1',
        kind: 'Secret',
        type: 'kubernetes.io/tls',
        metadata: {
            name: 'skupperx-' + profile_name,
            annotations: {
                'skupper.io/skx-inject' : profile_name,
            },
        },
        data: certificate.data,
    };

    secret.metadata.annotations['skupper.io/skx-hash'] = sync.HashOfSecret(secret);

    return "---\n" + yaml.dump(secret);
}
