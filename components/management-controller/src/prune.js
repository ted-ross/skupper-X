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

const kube   = require('./kube.js');
const Log    = require('./log.js').Log;
const db     = require('./db.js');

const reconcileCertificates = async function() {
    const client = await db.ClientFromPool();
    const result = await client.query("SELECT ObjectName FROM TlsCertificates");
    var   db_cert_names = [];
    result.rows.forEach(row => {
        db_cert_names.push(row.objectname);
    });

    const issuer_list = await kube.GetIssuers();
    issuer_list.forEach(issuer => {
        if (!db_cert_names.includes(issuer.metadata.name) && (issuer.metadata.annotations && issuer.metadata.annotations['skupper.io/skx-controlled'] == 'true')) {
            kube.DeleteIssuer(issuer.metadata.name);
            Log(`  Deleted issuer: ${issuer.metadata.name}`);
        }
    });

    const cert_list = await kube.GetCertificates();
    cert_list.forEach(cert => {
        if (!db_cert_names.includes(cert.metadata.name) && (cert.metadata.annotations && cert.metadata.annotations['skupper.io/skx-controlled'] == 'true')) {
            kube.DeleteCertificate(cert.metadata.name);
            Log(`  Deleted certificate: ${cert.metadata.name}`);
        }
    });

    const secret_list = await kube.GetSecrets();
    secret_list.forEach(secret => {
        if (!db_cert_names.includes(secret.metadata.name) && (secret.metadata.annotations && secret.metadata.annotations['skupper.io/skx-controlled'] == 'true')) {
            kube.DeleteSecret(secret.metadata.name);
            Log(`  Deleted secret: ${secret.metadata.name}`);
        }
    });

    client.release();
}

exports.Start = async function() {
    Log('[Prune - Reconciling Kubernetes objects to the database]');
    await reconcileCertificates();
}
