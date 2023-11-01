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
            var duration_ms;
            duration_ms = db.IntervalMilliseconds(config.BackboneExpiration());
            await client.query(
                "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, Backbone) VALUES(gen_random_uuid(), 'backboneCA', now(), now(), $1, $2)",
                [duration_ms / 3600000, row.id]
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
        const result = await client.query(
            "SELECT ApplicationNetworks.*, Backbones.Lifecycle as bblc, Backbones.CertificateAuthority as bbca FROM ApplicationNetworks " + 
            "JOIN Backbones ON ApplicationNetworks.Backbone = Backbones.Id WHERE ApplicationNetworks.Lifecycle = 'new' and Backbones.Lifecycle = 'ready' LIMIT 1"
        );
        if (result.rowCount == 1) {
            const row = result.rows[0];
            Log(`New Application Network: ${row.name}`);
            var duration_ms;
            if (row.endtime) {
                duration_ms = row.endtime.getTime() - row.starttime.getTime() + db.IntervalMilliseconds(row.deletedelay);
            } else {
                duration_ms = db.IntervalMilliseconds(config.DefaultCaExpiration());
            }
            await client.query(
                "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, ApplicationNetwork, Issuer) VALUES(gen_random_uuid(), 'vanCA', now(), $1, $2, $3, $4)",
                [row.starttime, duration_ms / 3600000, row.id, row.bbca]
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
                    break;
                case 'vanCA':
                    name   = `skx-van-ca-${row.id}`;
                    is_ca  = true;
                    issuer = row.issuer;
            }

            var issuer_name;
            if (!issuer) {
                issuer_name = config.RootIssuer();
            } else {
                const issuer_result = await client.query("SELECT ObjectName FROM TlsCertificates WHERE Id = $1", [issuer]);
                if (issuer_result.rowCount == 1) {
                    issuer_name = issuer_result.rows[0].objectname;
                } else {
                    // TODO - Go to 'failed' state and store error
                }
            }

            var cert_obj = certificateObject(name, row.durationhours, is_ca, issuer_name, row.id, row.issuer ? row.issuer : 'root');
            await kube.ApplyObject(cert_obj);
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
// A secret that is controlled by this controller and has a database link has been added.  Update the database
// to register the completion of the creation of a certificate or a CA.
//
const secretAdded = async function(dblink, secret) {
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query("SELECT * FROM CertificateRequests WHERE Id = $1", [dblink]);
        var ref_table;
        var ref_id;
        var ref_column;
        var is_ca = false;

        if (result.rowCount == 1) {
            const cert_request = result.rows[0];

            if (cert_request.backbone) {
                ref_table  = 'Backbones';
                ref_id     = cert_request.backbone;
                ref_column = 'CertificateAuthority';
                is_ca      = true;
            } else if (cert_request.interiorsite) {
                ref_table  = 'InteriorSites';
                ref_id     = cert_request.interiorsite;
                ref_column = 'InterRouterCertificate';
            } else if (cert_request.applicationnetwork) {
                ref_table  = 'ApplicationNetworks';
                ref_id     = cert_request.applicationnetwork;
                ref_column = 'CertificateAuthority';
                is_ca      = true;
            } else if (cert_request.invitation) {
                ref_table  = 'MemberInvitations';
                ref_id     = cert_request.invitation;
                ref_column = 'ClaimCertificate';
            } else if (cert_request.site) {
                ref_table  = 'MemberSites';
                ref_id     = cert_request.site;
                ref_column = 'ClientCertificate';
            } else {
                throw new Error('Unknown Target');
            }
            const cert_object = await kube.LoadCertificate(secret.metadata.name);
            const expiration  = cert_object.status.notAfter    ? new Date(cert_object.status.notAfter) : undefined;
            const renewal     = cert_object.status.renewalTime ? new Date(cert_object.status.renewalTime) : undefined;
            const signed_by   = secret.metadata.annotations['skupper.io/skx-issuerlink'];
            if (signed_by == 'root') {
                await client.query(
                    "INSERT INTO TlsCertificates (Id, IsCA, ObjectName, Expiration, RenewalTime) VALUES ($1, $2, $3, $4, $5)",
                    [dblink, is_ca, secret.metadata.name, expiration, renewal]
                );
            } else {
                await client.query(
                    "INSERT INTO TlsCertificates (Id, IsCA, ObjectName, Expiration, RenewalTime, SignedBy) VALUES ($1, $2, $3, $4, $5, $6)",
                    [dblink, is_ca, secret.metadata.name, expiration, renewal, signed_by]
                );
            }
            await client.query(`UPDATE ${ref_table} SET ${ref_column} = $1, Lifecycle = 'ready' WHERE Id = $2`, [dblink, ref_id]);
            await client.query('DELETE FROM CertificateRequests WHERE Id = $1', [dblink]);
            if (is_ca) {
                var issuer_obj = issuerObject(secret.metadata.name, secret.metadata.annotations['skupper.io/skx-dblink']);
                await kube.ApplyObject(issuer_obj);
            }
            Log(`Certificate${is_ca ? ' Authority' : ''} created: ${secret.metadata.name}`)
            await client.query('COMMIT');
        }
    } catch (err) {
        Log(`Rolling back secret-added transaction: ${err.stack}`);
        await client.query('ROLLBACK');
    } finally {
        client.release();
    }
}

//
// Handle watch events on Secrets
//
const onSecretWatch = function(action, secret) {
    switch (action) {
    case 'ADDED':
        const anno = secret.metadata.annotations;
        if (anno && anno['skupper.io/skx-controlled'] == 'true') {
            var dblink = anno['skupper.io/skx-dblink'];
            if (dblink) {
                secretAdded(dblink, secret);
            }
        }
    }
}

//
// Handle watch events on Certificates
//
const onCertificateWatch = async function(action, cert) {
    if (action == 'MODIFIED'
        && cert.metadata.annotations
        && cert.metadata.annotations['skupper.io/skx-controlled'] == 'true'
        && cert.status
        && cert.status.notAfter
        && cert.status.renewalTime) {
        const client      = await db.ClientFromPool();
        const expiration  = new Date(cert.status.notAfter);
        const renewal     = new Date(cert.status.renewalTime);
        await client.query(
            "UPDATE TlsCertificates SET expiration = $1, renewalTime = $2 WHERE ObjectName = $3",
            [expiration, renewal, cert.metadata.name]
        );
        client.release();
    }
}

//
// Generate a cert-manager Certificate object from a template.
//
const certificateObject = function(name, duration_hours, is_ca, issuer, db_link, issuer_link) {
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
                    'skupper.io/skx-issuerlink': issuer_link,
                },
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
const issuerObject = function(name, db_link) {
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
                secretName: name,
            },
            secretName: name,
        },
    };
}

exports.Start = async function() {
    Log('[Certificate module starting]');
    setTimeout(processNewBackbones, 1000);
    setTimeout(processNewNetworks, 1000);
    setTimeout(processNewCertificateRequests, 1000);

    kube.WatchSecrets(onSecretWatch);
    kube.WatchCertificates(onCertificateWatch);
}

