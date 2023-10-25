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
const config = require('./config.js');

//
// processNewBackbones
//
// When new backbones are created, add a certificate request to begin the full setup of the network.
//
const processNewBackbones = async function() {
    var reschedule_delay = 2000;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query("SELECT * FROM Backbones WHERE OperStatus = 'new' LIMIT 1");
        if (result.rowCount == 1) {
            const row = result.rows[0];
            Log(`New Backbone Network: ${row.name}`);
            var expire_time;
            expire_time = new Date();
            expire_time.setTime(Date.now() + db.IntervalMilliseconds(config.BackboneExpiration()));
            await client.query(
                "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, ExpireTime, Backbone) VALUES(gen_random_uuid(), 'backboneCA', now(), now(), $1, $2)",
                [expire_time, row.id]
                );
            await client.query("UPDATE Backbones SET OperStatus = 'cert_request_created' WHERE Id = $1", [row.id]);
            reschedule_delay = 0;
        }
        await client.query('COMMIT');
    } catch (err) {
        Log(`Rolling back new-backbone transaction: ${err.stack}`);
        await client.query('ROLLBACK');
        reschedule_delay = 10000;
    } finally {
        client.release();
        setTimeout(processNewBackbones, reschedule_delay);
    }
}

//
// processNewNetworks
//
// When new networks are created, add a certificate request to begin the full setup of the network.
//
const processNewNetworks = async function() {
    var reschedule_delay = 2000;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query("SELECT * FROM ApplicationNetworks WHERE OperStatus = 'new' LIMIT 1");
        if (result.rowCount == 1) {
            const row = result.rows[0];
            Log(`New Application Network: ${row.name}`);
            var expire_time;
            if (row.endtime) {
                expire_time = new Date();
                expire_time.setTime(row.endtime.getTime() + db.IntervalMilliseconds(row.deletedelay));
            } else {
                expire_time = new Date();
                expire_time.setTime(row.starttime.getTime() + db.IntervalMilliseconds(config.DefaultCaExpiration()));
            }
            await client.query(
                "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, ExpireTime, ApplicationNetwork) VALUES(gen_random_uuid(), 'vanCA', now(), $1, $2, $3)",
                [row.starttime, expire_time, row.id]
                );
            await client.query("UPDATE ApplicationNetworks SET OperStatus = 'cert_request_created' WHERE Id = $1", [row.id]);
            reschedule_delay = 0;
        }
        await client.query('COMMIT');
    } catch (err) {
        Log(`Rolling back new-network transaction: ${err.stack}`);
        await client.query('ROLLBACK');
        reschedule_delay = 10000;
    } finally {
        client.release();
        setTimeout(processNewNetworks, reschedule_delay);
    }
}

//
// processCertificateRequests
//
// When new networks are created, add a certificate request to begin the full setup of the network.
//
const processCertificateRequests = async function() {
    var reschedule_delay = 2000;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query("SELECT * FROM CertificateRequests WHERE RequestTime <= now() and not Processing ORDER BY CreatedTime LIMIT 1");
        if (result.rowCount == 1) {
            const row = result.rows[0];
            Log(`Processing Certificate Request: ${row.id} (${row.requesttype})`);
            // TODO - Create a certificate in k8s with an annotation of this record's ID
            //        When completed, create a TlsCertificate referencing the k8s secret, add the appropriate reference to the cert, and delete the request
            var obj = certificateRequest();
            kube.ApplyObject(obj);
            await client.query("UPDATE CertificateRequests SET Processing = true WHERE Id = $1", [row.id]);
            reschedule_delay = 0;
        }
        await client.query('COMMIT');
    } catch (err) {
        Log(`Rolling back cert-request transaction: ${err.stack}`);
        await client.query('ROLLBACK');
        reschedule_delay = 10000;
    } finally {
        client.release();
        setTimeout(processCertificateRequests, reschedule_delay);
    }
}

//
//
//
const certificateRequest = function() {
    return {
        apiVersion: 'cert-manager.io/v1',
        kind: 'Certificate',
        metadata: {
            name: 'example-com',
            namespace: kube.Namespace()
        },
        spec: {
            secretName: 'example-com-tls',
            secretTemplate: {
                annotations: {
                    mysecretannotation1: "foo",
                    mysecretannotation2: "bar",
                },
                labels: {
                    mysecretlabel: 'foo'
                }
            }
        },
        duration: '2160h',
        renewBefore: '360h',
        subject: {
            organizations: ['jetstack']
        },
        isCA: false,
        privateKey: {
            algorithm: 'RSA',
            encoding: 'PKCS1',
            size: 2048
        },
        usages: ['server auth', 'client auth'],
        dnsNames: ['example.com', 'www.example.com'],
        issuerRef: {
            name: 'ca-issuer',
            kind: 'Issuer',
            group: 'cert-manager.io'
        }
    };
}

exports.Start = function() {
    Log('[Certificate module starting]');
    setTimeout(processNewBackbones, 1000);
    setTimeout(processNewNetworks, 1000);
    setTimeout(processCertificateRequests, 1000);
}

