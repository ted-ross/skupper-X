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

const kube   = require('./common/kube.js');
const Log    = require('./common/log.js').Log;
const common = require('./common/common.js');
const db     = require('./db.js');

const reconcileCertificates = async function() {
    const client = await db.ClientFromPool();
    try {
        const result = await client.query("SELECT ObjectName FROM TlsCertificates");
        var   db_cert_names = [];
        result.rows.forEach(row => {
            db_cert_names.push(row.objectname);
        });

        const issuer_list = await kube.GetIssuers();
        issuer_list.forEach(issuer => {
            if (!db_cert_names.includes(issuer.metadata.name) && (issuer.metadata.annotations && issuer.metadata.annotations[common.META_ANNOTATION_SKUPPERX_CONTROLLED] == 'true')) {
                kube.DeleteIssuer(issuer.metadata.name);
                Log(`  Deleted issuer: ${issuer.metadata.name}`);
            }
        });

        const cert_list = await kube.GetCertificates();
        cert_list.forEach(cert => {
            if (!db_cert_names.includes(cert.metadata.name) && (cert.metadata.annotations && cert.metadata.annotations[common.META_ANNOTATION_SKUPPERX_CONTROLLED] == 'true')) {
                kube.DeleteCertificate(cert.metadata.name);
                Log(`  Deleted certificate: ${cert.metadata.name}`);
            }
        });

        const secret_list = await kube.GetSecrets();
        secret_list.forEach(secret => {
            if (!db_cert_names.includes(secret.metadata.name) && (secret.metadata.annotations && secret.metadata.annotations[common.META_ANNOTATION_SKUPPERX_CONTROLLED] == 'true')) {
                kube.DeleteSecret(secret.metadata.name);
                Log(`  Deleted secret: ${secret.metadata.name}`);
            }
        });
    } catch (error) {
        Log(`Exception in reconcileCertificates: ${error.stack}`);
    } finally {
        client.release();
    }
}

exports.DeleteOrphanCertificates = async function() {
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        var deleteMap = {};
        const tlsResult = await client.query("SELECT Id, SignedBy FROM TlsCertificates");
        for (const tlsRow of tlsResult.rows) {
            if (tlsRow.signedby) {
                if (!deleteMap[tlsRow.signedby]) {
                    deleteMap[tlsRow.signedby] = {
                        pleaseDelete : false,
                        children     : [],
                    };
                }
                deleteMap[tlsRow.signedby].children.push(tlsRow.id);
            }
            if (!deleteMap[tlsRow.id]) {
                deleteMap[tlsRow.id] = {
                    pleaseDelete : true,
                    children     : [],
                };
            } else {
                deleteMap[tlsRow.id].pleaseDelete = true;
            }
        }

        for (const table of ['ManagementControllers', 'Backbones', 'BackboneAccessPoints', 'InteriorSites', 'ApplicationNetworks', 'NetworkCredentials', 'MemberInvitations', 'MemberSites']) {
            const result = await client.query(`SELECT Id, Certificate FROM ${table}`);
            for (const row of result.rows) {
                if (row.certificate) {
                    if (deleteMap[row.certificate]) {
                        deleteMap[row.certificate].pleaseDelete = false;
                    } else {
                        Log(`Record ${table}[${row.id}] references a non-exist TlsCertificate`);
                    }
                }
            }
        }

        const depthFirstDelete = async function(client, certId) {
            const record = deleteMap[certId];
            for (const childId of record.children) {
                await depthFirstDelete(client, childId);
            }
            if (record.pleaseDelete) {
                await client.query("DELETE FROM TlsCertificates WHERE Id = $1", [certId]);
                Log(`Orphan TlsCertificate ${certId} to be deleted`);
                record.pleaseDelete = false;
            }
        }

        for (const certId of Object.keys(deleteMap)) {
            await depthFirstDelete(client, certId);
        }

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`Exception in DeleteOrphanCertificates: ${error.message}`);
        Log(error.stack);
    } finally {
        client.release();
    }
}

exports.Start = async function() {
    Log('[Prune - Reconciling Kubernetes objects to the database]');
    await exports.DeleteOrphanCertificates();
    await reconcileCertificates();
}
