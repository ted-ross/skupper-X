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

const kube       = require('./common/kube.js');
const Log        = require('./common/log.js').Log;
const db         = require('./db.js');
const config     = require('./config.js');
const sync       = require('./sync-management.js');
const claims     = require('./claim-server.js');
const deployment = require('./site-deployment-state.js');
const common     = require('./common/common.js');

//
// processNewManagementControllers
//
// When new management controllers are created, add a certificate request.
//
const processNewManagementControllers = async function() {
    var reschedule_delay = 5000;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query("SELECT * FROM ManagementControllers WHERE Lifecycle = 'new' LIMIT 1");
        if (result.rowCount == 1) {
            const row = result.rows[0];
            Log(`New Management Controller: ${row.name}`);
            var duration_ms;
            duration_ms = db.IntervalMilliseconds(config.BackboneExpiration());
            await client.query(
                "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, ManagementController) VALUES(gen_random_uuid(), 'mgmtController', now(), now(), $1, $2)",
                [duration_ms / 3600000, row.id]
                );
            await client.query("UPDATE ManagementControllers SET Lifecycle = 'skx_cr_created' WHERE Id = $1", [row.id]);
            reschedule_delay = 0;
        }
        await client.query('COMMIT');
    } catch (err) {
        Log(`Rolling back new-management-controller transaction: ${err.stack}`);
        await client.query('ROLLBACK');
        reschedule_delay = 10000;
    } finally {
        client.release();
        setTimeout(processNewManagementControllers, reschedule_delay);
    }
}

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
//
//
const processNewAccessPoints = async function() {
    var reschedule_delay = 2000;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            "SELECT BackboneAccessPoints.*, Backbones.Lifecycle as bblc, Backbones.Certificate as bbca FROM BackboneAccessPoints " +
            "JOIN InteriorSites ON BackboneAccessPoints.InteriorSite = InteriorSites.Id " +
            "JOIN Backbones ON InteriorSites.Backbone = Backbones.Id WHERE BackboneAccessPoints.Lifecycle = 'new' and Backbones.Lifecycle = 'ready' LIMIT 1"
        );
        if (result.rowCount == 1) {
            const row = result.rows[0];
            Log(`New Backbone Access Point: ${row.name}`);
            var duration_ms;

            if (row.endtime) {
                duration_ms = row.endtime.getTime() - row.starttime.getTime() + db.IntervalMilliseconds(row.deletedelay);
            } else {
                duration_ms = db.IntervalMilliseconds(config.DefaultCaExpiration());
            }
            await client.query(
                "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, AccessPoint, Issuer, Hostname) VALUES(gen_random_uuid(), 'accessPoint', now(), now(), $1, $2, $3, $4)",
                [duration_ms / 3600000, row.id, row.bbca, row.hostname]
            );
            await client.query("UPDATE BackboneAccessPoints SET Lifecycle = 'skx_cr_created' WHERE Id = $1", [row.id]);
            reschedule_delay = 0;
        }
        await client.query('COMMIT');
    } catch (err) {
        Log(`Rolling back new-access-point transaction: ${err.stack}`);
        await client.query('ROLLBACK');
        reschedule_delay = 10000;
    } finally {
        client.release();
        setTimeout(processNewAccessPoints, reschedule_delay);
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
            "SELECT ApplicationNetworks.*, Backbones.Lifecycle as bblc, Backbones.Certificate as bbca FROM ApplicationNetworks " + 
            "JOIN Backbones ON ApplicationNetworks.Backbone = Backbones.Id WHERE ApplicationNetworks.Lifecycle = 'new' and Backbones.Lifecycle = 'ready' LIMIT 1"
        );
        if (result.rowCount == 1) {
            const row = result.rows[0];
            Log(`New Application Network: ${row.name}`);
            const van_id = row.id.substr(-5);
            var   duration_ms;

            if (row.endtime) {
                duration_ms = row.endtime.getTime() - row.starttime.getTime() + db.IntervalMilliseconds(row.deletedelay);
                // TODO - if duration is greater than the default CA expiration, reduce it to the default.
            } else {
                duration_ms = db.IntervalMilliseconds(config.DefaultCaExpiration());
            }
            await client.query(
                "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, ApplicationNetwork, Issuer) VALUES(gen_random_uuid(), 'vanCA', now(), $1, $2, $3, $4)",
                [row.starttime, Math.trunc(duration_ms / 3600000), row.id, row.bbca]
            );
            await client.query("UPDATE ApplicationNetworks SET Lifecycle = 'skx_cr_created', VanId = $1 WHERE Id = $2", [van_id, row.id]);
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
// processNewInteriorSites
//
const processNewInteriorSites = async function() {
    var reschedule_delay = 2000;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            "SELECT InteriorSites.*, Backbones.Lifecycle as bblc, Backbones.Certificate as bbca FROM InteriorSites " + 
            "JOIN Backbones ON InteriorSites.Backbone = Backbones.Id WHERE InteriorSites.Lifecycle = 'new' and Backbones.Lifecycle = 'ready' LIMIT 1"
        );
        if (result.rowCount == 1) {
            const row = result.rows[0];
            Log(`New Interior Site: ${row.name}`);
            var duration_ms = db.IntervalMilliseconds(config.DefaultCertExpiration());
            await client.query(
                "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, InteriorSite, Issuer) VALUES(gen_random_uuid(), 'interiorRouter', now(), now(), $1, $2, $3)",
                [duration_ms / 3600000, row.id, row.bbca]
            );
            await client.query("UPDATE InteriorSites SET Lifecycle = 'skx_cr_created' WHERE Id = $1", [row.id]);
            reschedule_delay = 0;
        }
        await client.query('COMMIT');
    } catch (err) {
        Log(`Rolling back new-interior-site transaction: ${err.stack}`);
        await client.query('ROLLBACK');
        reschedule_delay = 10000;
    } finally {
        client.release();
        setTimeout(processNewInteriorSites, reschedule_delay);
    }
}

//
// processNewInvitations
//
const processNewInvitations = async function() {
    var reschedule_delay = 2000;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            "SELECT MemberInvitations.*, ApplicationNetworks.Lifecycle as vanlc, ApplicationNetworks.Certificate as vanca FROM MemberInvitations " + 
            "JOIN ApplicationNetworks ON MemberInvitations.MemberOf = ApplicationNetworks.Id WHERE MemberInvitations.Lifecycle = 'new' and ApplicationNetworks.Lifecycle = 'ready' LIMIT 1"
        );
        if (result.rowCount == 1) {
            const row = result.rows[0];
            Log(`New Invitation: ${row.name}`);
            var duration_ms = db.IntervalMilliseconds(config.DefaultCertExpiration());
            await client.query(
                "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, Invitation, Issuer) VALUES(gen_random_uuid(), 'memberClaim', now(), now(), $1, $2, $3)",
                [duration_ms / 3600000, row.id, row.vanca]
            );
            await client.query("UPDATE MemberInvitations SET Lifecycle = 'skx_cr_created' WHERE Id = $1", [row.id]);
            reschedule_delay = 0;
        }
        await client.query('COMMIT');
    } catch (err) {
        Log(`Rolling back new-invitation transaction: ${err.stack}`);
        await client.query('ROLLBACK');
        reschedule_delay = 10000;
    } finally {
        client.release();
        setTimeout(processNewInvitations, reschedule_delay);
    }
}

//
// processNewMemberSites
//
const processNewMemberSites = async function() {
    var reschedule_delay = 2000;
    const client = await db.ClientFromPool();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            "SELECT MemberSites.*, ApplicationNetworks.Lifecycle as vanlc, ApplicationNetworks.Certificate as vanca FROM MemberSites " + 
            "JOIN ApplicationNetworks ON MemberSites.MemberOf = ApplicationNetworks.Id WHERE MemberSites.Lifecycle = 'new' and ApplicationNetworks.Lifecycle = 'ready' LIMIT 1"
        );
        if (result.rowCount == 1) {
            const row = result.rows[0];
            Log(`New Member Site: ${row.name}`);
            var duration_ms = db.IntervalMilliseconds(config.DefaultCertExpiration());
            await client.query(
                "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, Site, Issuer) VALUES(gen_random_uuid(), 'vanSite', now(), now(), $1, $2, $3)",
                [duration_ms / 3600000, row.id, row.vanca]
            );
            await client.query("UPDATE MemberSites SET Lifecycle = 'skx_cr_created' WHERE Id = $1", [row.id]);
            reschedule_delay = 0;
        }
        await client.query('COMMIT');
    } catch (err) {
        Log(`Rolling back new-member-site transaction: ${err.stack}`);
        await client.query('ROLLBACK');
        reschedule_delay = 10000;
    } finally {
        client.release();
        setTimeout(processNewMemberSites, reschedule_delay);
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
            var extra_annotations = {};
            var dns_name;
            var usage;
            switch (row.requesttype) {
                case 'mgmtController':
                    name   = `skx-mgmt-controller-${row.id}`;
                    usage  = 'client auth';
                    break;
                case 'backboneCA':
                    name   = `skx-bb-ca-${row.id}`;
                    is_ca  = true;
                    usage  = 'signing';
                    break;
                case 'accessPoint':
                    name     = `skx-access-${row.id}`;
                    issuer   = row.issuer;
                    usage    = 'server auth';
                    dns_name = row.hostname;
                    break;
                case 'vanCA':
                    name   = `skx-van-ca-${row.id}`;
                    is_ca  = true;
                    issuer = row.issuer;
                    usage  = 'signing';
                    break;
                case 'interiorRouter':
                    name   = `skx-interior-${row.id}`;
                    is_ca  = false;
                    issuer = row.issuer;
                    usage  = 'client auth';
                    break;
                case 'memberClaim':
                    name   = `skx-claim-${row.id}`;
                    is_ca  = false;
                    issuer = row.issuer;
                    usage  = 'client auth';
                    extra_annotations['skupper.io/skx-dataplane-image']  = config.SiteDataplaneImage();
                    extra_annotations['skupper.io/skx-controller-image'] = config.SiteControllerImage();
                    // TODO - Add annotations for valid and expiration times for this claim
                    break;
                case 'vanSite':
                    name   = `skx-member-${row.id}`;
                    is_ca  = false;
                    issuer = row.issuer;
                    usage  = 'client auth';
                    break;
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

            var cert_obj = certificateObject(name, row.durationhours, is_ca, issuer_name, row.id, row.issuer ? row.issuer : 'root', extra_annotations, name, dns_name, usage);
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
        var is_ca = false;
        var alertSiteCertChanged   = false;
        var alertAccessCertChanged = false;
        var alertMemberCompletion  = false;

        if (result.rowCount == 1) {
            const cert_request = result.rows[0];

            if (cert_request.managementcontroller) {
                ref_table  = 'ManagementControllers';
                ref_id     = cert_request.managementcontroller;
            } else if (cert_request.backbone) {
                ref_table  = 'Backbones';
                ref_id     = cert_request.backbone;
                is_ca      = true;
            } else if (cert_request.interiorsite) {
                ref_table  = 'InteriorSites';
                ref_id     = cert_request.interiorsite;
                alertSiteCertChanged = true;
            } else if (cert_request.accesspoint) {
                ref_table  = 'BackboneAccessPoints';
                ref_id     = cert_request.accesspoint;
                alertAccessCertChanged = true;
            } else if (cert_request.applicationnetwork) {
                ref_table  = 'ApplicationNetworks';
                ref_id     = cert_request.applicationnetwork;
                is_ca      = true;
            } else if (cert_request.invitation) {
                ref_table  = 'MemberInvitations';
                ref_id     = cert_request.invitation;
            } else if (cert_request.site) {
                ref_table  = 'MemberSites';
                ref_id     = cert_request.site;
                alertMemberCompletion = true;
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
            await client.query(`UPDATE ${ref_table} SET Certificate = $1, Lifecycle = 'ready' WHERE Id = $2`, [dblink, ref_id]);
            await client.query('DELETE FROM CertificateRequests WHERE Id = $1', [dblink]);
            if (is_ca) {
                var issuer_obj = issuerObject(secret.metadata.name, secret.metadata.annotations['skupper.io/skx-dblink']);
                await kube.ApplyObject(issuer_obj);
            }
            Log(`Certificate${is_ca ? ' Authority' : ''} created: ${secret.metadata.name}`)
            if (alertSiteCertChanged) {
                await deployment.SiteLifecycleChanged_TX(client, ref_id, 'ready');
            }
            await client.query('COMMIT');

            //
            // Alert the sync module that changes have been made that require reconciliation with remote sites
            //
            if (alertSiteCertChanged) {
                await sync.SiteCertificateChanged(dblink);
            } else if (alertAccessCertChanged) {
                await sync.AccessCertificateChanged(dblink);
            }

            //
            // If we just updated a member site, there will be a claim-assertion that is awaiting completion.  Invoke the completion function.
            //
            if (alertMemberCompletion) {
                await claims.CompleteMember(ref_id);
            }
        } else {
            //
            // There's been no meaningful action taken.  Roll back the transaction.
            //
            await client.query('ROLLBACK');
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
        if (anno && anno[common.META_ANNOTATION_SKUPPERX_CONTROLLED] == 'true') {
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
        && cert.metadata.annotations[common.META_ANNOTATION_SKUPPERX_CONTROLLED] == 'true'
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
const certificateObject = function(name, duration_hours, is_ca, issuer, db_link, issuer_link, extra_annotations, common_name, dns_name, usage) {
    var cert = {
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
                    [common.META_ANNOTATION_SKUPPERX_CONTROLLED]: 'true',
                    'skupper.io/skx-dblink': db_link,
                    'skupper.io/skx-issuerlink': issuer_link,
                },
            },
            duration: `${duration_hours}h`,
            //renewBefore: '360h',
            subject: {
                organizations: ['skupper.io'],
            },
            commonName: common_name,
            isCA: is_ca,
            privateKey: {
                algorithm: 'RSA',
                encoding: 'PKCS1',
                size: 2048,
            },
            usages: [usage],
            issuerRef: {
                name: issuer,
                kind: 'Issuer',
                group: 'cert-manager.io',
            },
        },
    };

    if (dns_name) {
        cert.spec.dnsNames = [dns_name];
    }

    for (const [key, value] of Object.entries(extra_annotations)) {
        cert.spec.secretTemplate.annotations[key] = value;
    }

    return cert;
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
    setTimeout(processNewManagementControllers, 1000);
    setTimeout(processNewBackbones, 1000);
    setTimeout(processNewAccessPoints, 1000);
    setTimeout(processNewNetworks, 1000);
    setTimeout(processNewInteriorSites, 1000);
    setTimeout(processNewInvitations, 1000);
    setTimeout(processNewMemberSites, 1000);
    setTimeout(processNewCertificateRequests, 1000);

    kube.WatchSecrets(onSecretWatch);
    kube.WatchCertificates(onCertificateWatch);
}

