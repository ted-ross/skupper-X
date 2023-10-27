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
        const result = await client.query("SELECT * FROM Backbones WHERE Lifecycle = 'new' LIMIT 1");
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
            await client.query("UPDATE Backbones SET Lifecycle = 'skx_cr_created' WHERE Id = $1", [row.id]);
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
        const result = await client.query("SELECT * FROM ApplicationNetworks WHERE Lifecycle = 'new' LIMIT 1");
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
            await client.query("UPDATE ApplicationNetworks SET Lifecycle = 'skx_cr_created' WHERE Id = $1", [row.id]);
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
const processNewCertificateRequests = async function() {
    var reschedule_delay = 2000;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query("SELECT * FROM CertificateRequests WHERE RequestTime <= now() and Lifecycle = 'new' ORDER BY CreatedTime LIMIT 1");
        if (result.rowCount == 1) {
            const row = result.rows[0];
            Log(`Processing Certificate Request: ${row.id} (${row.requesttype})`);
            var name;
            var is_ca;
            var issuer;
            switch (row.requesttype) {
                case 'backboneCA':
                    name   = `skx-bb-ca-${row.id}`;
                    is_ca  = true;
                    issuer = config.RootIssuer();
                    break;
                case 'vanCA':
                    name   = `skx-van-ca-${row.id}`;
                    is_ca  = true;
                    issuer = row.issuer;
            }
            var cert_obj = certificateObject(name, 3600, is_ca, issuer, row.id);
            kube.ApplyObject(cert_obj);
            await client.query("UPDATE CertificateRequests SET Lifecycle = 'cm_cert_created' WHERE Id = $1", [row.id]);
            reschedule_delay = 0;
        }
        await client.query('COMMIT');
    } catch (err) {
        Log(`Rolling back cert-request transaction: ${err.stack}`);
        await client.query('ROLLBACK');
        reschedule_delay = 10000;
    } finally {
        client.release();
        setTimeout(processNewCertificateRequests, reschedule_delay);
    }
}

//
// Generate a cert-manager Certificate object from a template.
//
const certificateObject = function(name, duration_hours, is_ca, issuer, db_link) {
    return {
        apiVersion: 'cert-manager.io/v1',
        kind: 'Certificate',
        metadata: {
            name: name,
            annotations: {
                'skupper.io/skx-dblink': db_link,
            },
        },
        spec: {
            secretName: name,
            secretTemplate: {
                annotations: {
                    'skupper.io/skx-controlled': 'true',
                    'skupper.io/skx-dblink': db_link,
                },
                //labels: {
                //    mysecretlabel: 'foo',
                //},
            },
            duration: `${duration_hours}h`,
            //renewBefore: '360h',
            subject: {
                organizations: ['redhat.com'],
            },
            isCA: is_ca,
            privateKey: {
                algorithm: 'RSA',
                encoding: 'PKCS1',
                size: 2048,
            },
            usages: ['server auth', 'client auth'],
            dnsNames: ['example.com', 'www.example.com'],
            issuerRef: {
                name: issuer,
                kind: 'Issuer',
                group: 'cert-manager.io',
            },
        },
    };
}

//
// Generate a cert-manager Issuer object from a template.
//
const issuerObject = function(name, secret, db_link) {
    return {
        apiVersion: 'cert-manager.io/v1',
        kind: 'Issuer',
        metadata: {
            name: name,
            annotations: {
                'skupper.io/skx-dblink': db_link,
            },
        },
        spec: {
            ca: {
                secretName: secret,
            },
            secretName: name,
        },
    };
}

exports.Start = function() {
    Log('[Certificate module starting]');
    setTimeout(processNewBackbones, 1000);
    setTimeout(processNewNetworks, 1000);
    setTimeout(processNewCertificateRequests, 1000);

    kube.WatchSecrets((t, secret) => {
        Log(`Secret watch fired: ${t}`);
        Log(secret.metadata.annotations);
    })
}

