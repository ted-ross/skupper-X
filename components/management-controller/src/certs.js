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

import { randomUUID } from "node:crypto";
import {
    ApplyObject,
    LoadCertificate,
    LoadSecret,
    ReplaceCertificate,
    ReplaceSecret,
    TriggerCertificateRenewal,
    WatchSecrets,
    WatchCertificates,
    GetIssuers,
    kubeStatusCode,
} from "@vms/modules/kube";
import { Log } from "@vms/modules/log";
import { IsValidUuid } from "@vms/modules/util";
import { ClientFromPool, IntervalMilliseconds } from "./db.js";
import {
    BackboneExpiration,
    DefaultCaExpiration,
    DefaultCertExpiration,
    SiteControllerImage,
    RootIssuer,
    CertOrganization,
} from "./config.js";
import { SiteCertificateChanged, AccessCertificateChanged } from "./sync-management.js";
import { SyncColoTlsCertificate } from "./colo-sync.js";
import { CompleteMember } from "./claim-server.js";
import { AccessPointCertReady, SiteLifecycleChanged_TX } from "./site-deployment-state.js";
import { META_ANNOTATION_VMS_CONTROLLED } from "@vms/modules/common";
import { NotifyTransaction, RegisterNotification } from "./notify.js";
import {
    expirationFromTlsSecret,
    timestampsEqual,
    lockCurrentCertificate,
    lockCurrentCertificateByObjectName,
    isCertificateSuperseded,
    retargetParentCertificateFks,
    hasLiveChildren,
    listCurrentLeafChildren,
    loadCertificateRow,
} from "./tls-rotation.js";

const PG_UNIQUE_VIOLATION = "23505";
const KUBE_CONFLICT_RETRIES = 5;
const secretWorkTail = new Map();

function httpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

//
// When new management controllers are created, add a certificate request.
//
async function onManagementControllersChange(action, id) {
    if (action != "DELETE") {
        const client = await ClientFromPool("system");
        try {
            await client.query("BEGIN");
            const notify = new NotifyTransaction();
            const result = await client.query(
                "SELECT * FROM ManagementControllers WHERE Lifecycle = 'new' AND Id = $1",
                [id]
            );
            if (result.rowCount == 1) {
                const row = result.rows[0];
                Log(`New Management Controller: ${row.name}`);
                const duration_ms = IntervalMilliseconds(BackboneExpiration());
                const cert = await client.query(
                    "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, ManagementController) " +
                        "VALUES(gen_random_uuid(), 'mgmtController', now(), now(), $1, $2) RETURNING Id",
                    [duration_ms / 3600000, row.id]
                );
                notify.add("CertificateRequests", cert.rows[0].id);
                await client.query(
                    "UPDATE ManagementControllers SET Lifecycle = 'vms_cr_created' WHERE Id = $1",
                    [row.id]
                );
                notify.update("ManagementControllers", row.id);
            }
            await client.query("COMMIT");
            await notify.commit();
        } catch (err) {
            Log(`Rolling back new-management-controller transaction: ${err.stack}`);
            await client.query("ROLLBACK");
        } finally {
            client.release();
        }
    }
}

//
// When new backbones are created, add a certificate request to begin the full setup of the network.
//
async function onBackbonesChange(action, id) {
    const client = await ClientFromPool("system");
    try {
        await client.query("BEGIN");
        const notify = new NotifyTransaction();
        const result = await client.query("SELECT * FROM Backbones WHERE id = $1", [id]);
        if (result.rowCount == 1) {
            const backbone = result.rows[0];
            if (backbone.lifecycle == "new") {
                const row = result.rows[0];
                Log(`New Backbone Network: ${row.name}`);
                const duration_ms = IntervalMilliseconds(BackboneExpiration());
                const cert = await client.query(
                    "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, Backbone) " +
                        "VALUES(gen_random_uuid(), 'backboneCA', now(), now(), $1, $2) RETURNING Id",
                    [duration_ms / 3600000, row.id]
                );
                notify.add("CertificateRequests", cert.rows[0].id);
                await client.query(
                    "UPDATE Backbones SET Lifecycle = 'vms_cr_created' WHERE Id = $1",
                    [row.id]
                );
                notify.update("Backbones", row.id);
            } else if (backbone.lifecycle == "ready") {
                //
                // Notify the other object types that rely on the backbone issuer being ready:
                //   BackboneAccessPoints, ApplicationNetworks, InteriorSites, and NetworkCredentials.
                //
                const apResult = await client.query(
                    "SELECT ap.Id FROM BackboneAccessPoints AS ap " +
                        "JOIN InteriorSites AS site ON site.Id = ap.InteriorSite " +
                        "WHERE site.Backbone = $1",
                    [id]
                );
                for (const row of apResult.rows) {
                    notify.update("BackboneAccessPoints", row.id);
                }

                const vanResult = await client.query(
                    "SELECT Id FROM ApplicationNetworks WHERE Backbone = $1",
                    [id]
                );
                for (const row of vanResult.rows) {
                    notify.update("ApplicationNetworks", row.id);
                }

                const siteResult = await client.query(
                    "SELECT Id FROM InteriorSites WHERE Backbone = $1",
                    [id]
                );
                for (const row of siteResult.rows) {
                    notify.update("InteriorSites", row.id);
                }

                const credResult = await client.query(
                    "SELECT cred.Id FROM NetworkCredentials AS cred " +
                        "JOIN ApplicationNetworks AS van ON van.Id = cred.MemberOf " +
                        "WHERE van.Backbone = $1",
                    [id]
                );
                for (const row of credResult.rows) {
                    notify.update("NetworkCredentials", row.id);
                }
            }
        }
        await client.query("COMMIT");
        await notify.commit();
    } catch (err) {
        Log(`Rolling back new-backbone transaction: ${err.stack}`);
        await client.query("ROLLBACK");
    } finally {
        client.release();
    }
}

//
//
//
async function onAccessPointsChange(action, id) {
    const client = await ClientFromPool("system");
    try {
        await client.query("BEGIN");
        const notify = new NotifyTransaction();
        const result = await client.query(
            "SELECT BackboneAccessPoints.*, Backbones.Lifecycle as bblc, Backbones.Certificate as bbca FROM BackboneAccessPoints " +
                "JOIN InteriorSites ON BackboneAccessPoints.InteriorSite = InteriorSites.Id " +
                "JOIN Backbones ON InteriorSites.Backbone = Backbones.Id " +
                "WHERE BackboneAccessPoints.Lifecycle = 'new' and Backbones.Lifecycle = 'ready' and BackboneAccessPoints.Id = $1",
            [id]
        );
        if (result.rowCount == 1) {
            const row = result.rows[0];
            Log(`New Backbone Access Point: ${row.name}`);
            let duration_ms;

            if (row.endtime) {
                duration_ms =
                    row.endtime.getTime() -
                    row.starttime.getTime() +
                    IntervalMilliseconds(row.deletedelay);
            } else {
                duration_ms = IntervalMilliseconds(DefaultCertExpiration());
            }
            const cert = await client.query(
                "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, AccessPoint, Issuer, Hostname) " +
                    "VALUES(gen_random_uuid(), 'accessPoint', now(), now(), $1, $2, $3, $4) Returning Id",
                [duration_ms / 3600000, row.id, row.bbca, row.hostname]
            );
            notify.add("CertificateRequests", cert.rows[0].id);
            await client.query(
                "UPDATE BackboneAccessPoints SET Lifecycle = 'vms_cr_created' WHERE Id = $1",
                [row.id]
            );
            notify.update("BackboneAccessPoints", row.id);
        }
        await client.query("COMMIT");
        await notify.commit();
    } catch (err) {
        Log(`Rolling back new-access-point transaction: ${err.stack}`);
        await client.query("ROLLBACK");
    } finally {
        client.release();
    }
}

//
// When new networks are created, add a certificate request to begin the full setup of the network.
//
async function onApplicationNetworksChange(action, id) {
    const client = await ClientFromPool("system");
    const notify = new NotifyTransaction();
    try {
        await client.query("BEGIN");
        const result = await client.query(
            "SELECT ApplicationNetworks.*, Backbones.Lifecycle as bblc, Backbones.Certificate as bbca FROM ApplicationNetworks " +
                "JOIN Backbones ON ApplicationNetworks.Backbone = Backbones.Id " +
                "WHERE Backbones.Lifecycle = 'ready' and ApplicationNetworks.Id = $1",
            [id]
        );
        if (result.rowCount == 1) {
            const van = result.rows[0];
            if (van.lifecycle == "new") {
                Log(`New Application Network: ${van.name}`);
                const van_id = "v" + van.id.substr(-5); // TODO - prevent collisions here
                let duration_ms;

                if (van.endtime) {
                    duration_ms =
                        van.endtime.getTime() -
                        van.starttime.getTime() +
                        IntervalMilliseconds(van.deletedelay);
                    // TODO - if duration is greater than the default CA expiration, reduce it to the default.
                } else {
                    duration_ms = IntervalMilliseconds(DefaultCaExpiration());
                }
                const cert = await client.query(
                    "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, ApplicationNetwork, Issuer) " +
                        "VALUES(gen_random_uuid(), 'vanCA', now(), $1, $2, $3, $4) Returning Id",
                    [van.starttime, Math.trunc(duration_ms / 3600000), van.id, van.bbca]
                );
                notify.add("CertificateRequests", cert.rows[0].id);
                await client.query(
                    "UPDATE ApplicationNetworks SET Lifecycle = 'vms_cr_created', VanId = $1 WHERE Id = $2",
                    [van_id, van.id]
                );
                notify.update("ApplicationNetworks", van.id);
            } else if (van.lifecycle == "ready") {
                //
                // Notify the other object types that rely on the application network issuer being ready:
                //   MemberInvitations and MemberSites.
                //
                const inviteResult = await client.query(
                    "SELECT Id FROM MemberInvitations WHERE MemberOf = $1",
                    [id]
                );
                for (const row of inviteResult.rows) {
                    notify.update("MemberInvitations", row.id);
                }

                const memberResult = await client.query(
                    "SELECT Id FROM MemberSites WHERE MemberOf = $1",
                    [id]
                );
                for (const row of memberResult.rows) {
                    notify.update("MemberSites", row.id);
                }
            }
        }
        await client.query("COMMIT");
        await notify.commit();
    } catch (err) {
        Log(`Rolling back new-network transaction: ${err.stack}`);
        await client.query("ROLLBACK");
    } finally {
        client.release();
    }
}

//
// processNewInteriorSites
//
async function onInteriorSitesChange(action, id) {
    const client = await ClientFromPool("system");
    const notify = new NotifyTransaction();
    try {
        await client.query("BEGIN");
        const result = await client.query(
            "SELECT InteriorSites.*, Backbones.Lifecycle as bblc, Backbones.Certificate as bbca FROM InteriorSites " +
                "JOIN Backbones ON InteriorSites.Backbone = Backbones.Id " +
                "WHERE InteriorSites.Lifecycle = 'new' and Backbones.Lifecycle = 'ready' and InteriorSites.Id = $1",
            [id]
        );
        if (result.rowCount == 1) {
            const row = result.rows[0];
            Log(`New Interior Site: ${row.name}`);
            const duration_ms = IntervalMilliseconds(DefaultCertExpiration());
            const cert = await client.query(
                "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, InteriorSite, Issuer) " +
                    "VALUES(gen_random_uuid(), 'interiorRouter', now(), now(), $1, $2, $3) RETURNING Id",
                [duration_ms / 3600000, row.id, row.bbca]
            );
            notify.add("CertificateRequests", cert.rows[0].id);
            await client.query(
                "UPDATE InteriorSites SET Lifecycle = 'vms_cr_created' WHERE Id = $1",
                [row.id]
            );
            notify.update("InteriorSites", row.id);
        }
        await client.query("COMMIT");
        await notify.commit();
    } catch (err) {
        Log(`Rolling back new-interior-site transaction: ${err.stack}`);
        await client.query("ROLLBACK");
    } finally {
        client.release();
    }
}

//
// processNewInvitations
//
const onInvitationsChange = async function (action, id) {
    const client = await ClientFromPool("system");
    const notify = new NotifyTransaction();
    try {
        await client.query("BEGIN");
        const result = await client.query(
            "SELECT MemberInvitations.*, ApplicationNetworks.Lifecycle as vanlc, ApplicationNetworks.Certificate as vanca " +
                "FROM MemberInvitations " +
                "JOIN ApplicationNetworks ON MemberInvitations.MemberOf = ApplicationNetworks.Id " +
                "WHERE MemberInvitations.Lifecycle = 'new' and ApplicationNetworks.Lifecycle = 'ready' and MemberInvitations.Id = $1",
            [id]
        );
        if (result.rowCount == 1) {
            const row = result.rows[0];
            Log(`New Invitation: ${row.name}`);
            const duration_ms = IntervalMilliseconds(DefaultCertExpiration());
            const cert = await client.query(
                "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, Invitation, Issuer) " +
                    "VALUES(gen_random_uuid(), 'memberClaim', now(), now(), $1, $2, $3) RETURNING Id",
                [duration_ms / 3600000, row.id, row.vanca]
            );
            notify.add("CertificateRequests", cert.rows[0].id);
            await client.query(
                "UPDATE MemberInvitations SET Lifecycle = 'vms_cr_created' WHERE Id = $1",
                [row.id]
            );
            notify.update("MemberInvitations", row.id);
        }
        await client.query("COMMIT");
        await notify.commit();
    } catch (err) {
        Log(`Rolling back new-invitation transaction: ${err.stack}`);
        await client.query("ROLLBACK");
    } finally {
        client.release();
    }
};

//
// processNewMemberSites
//
async function onMemberSitesChange(action, id) {
    const client = await ClientFromPool("system");
    const notify = new NotifyTransaction();
    try {
        await client.query("BEGIN");
        const result = await client.query(
            "SELECT MemberSites.*, ApplicationNetworks.Lifecycle as vanlc, ApplicationNetworks.Certificate as vanca " +
                "FROM MemberSites " +
                "JOIN ApplicationNetworks ON MemberSites.MemberOf = ApplicationNetworks.Id " +
                "WHERE MemberSites.Lifecycle = 'new' and ApplicationNetworks.Lifecycle = 'ready' and MemberSites.Id = $1",
            [id]
        );
        if (result.rowCount == 1) {
            const row = result.rows[0];
            Log(`New Member Site: ${row.name}`);
            const duration_ms = IntervalMilliseconds(DefaultCertExpiration());
            const cert = await client.query(
                "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, Site, Issuer) " +
                    "VALUES(gen_random_uuid(), 'vanSite', now(), now(), $1, $2, $3) RETURNING  Id",
                [duration_ms / 3600000, row.id, row.vanca]
            );
            notify.add("CertificateRequests", cert.rows[0].id);
            await client.query(
                "UPDATE MemberSites SET Lifecycle = 'vms_cr_created' WHERE Id = $1",
                [row.id]
            );
            notify.update("MemberSites", row.id);
        }
        await client.query("COMMIT");
        await notify.commit();
    } catch (err) {
        Log(`Rolling back new-member-site transaction: ${err.stack}`);
        await client.query("ROLLBACK");
    } finally {
        client.release();
    }
}

async function onNetworkCredentialsChange(action, id) {
    const client = await ClientFromPool("system");
    const notify = new NotifyTransaction();
    try {
        await client.query("BEGIN");
        const result = await client.query(
            "SELECT NetworkCredentials.*, ApplicationNetworks.Lifecycle as vanlc, Backbones.Certificate as bbca " +
                "FROM NetworkCredentials " +
                "JOIN ApplicationNetworks ON NetworkCredentials.MemberOf = ApplicationNetworks.Id " +
                "JOIN Backbones ON Backbones.id = ApplicationNetworks.Backbone " +
                "WHERE NetworkCredentials.Lifecycle = 'new' and Backbones.Lifecycle = 'ready' and NetworkCredentials.Id = $1",
            [id]
        );
        if (result.rowCount == 1) {
            const row = result.rows[0];
            Log(`New Network Credential: ${row.name}`);
            const duration_ms = IntervalMilliseconds(DefaultCertExpiration());
            const cert = await client.query(
                "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, NetworkCredential, Issuer) " +
                    "VALUES(gen_random_uuid(), 'vanCredential', now(), now(), $1, $2, $3) RETURNING Id",
                [duration_ms / 3600000, row.id, row.bbca]
            );
            notify.add("CertificateRequests", cert.rows[0].id);
            await client.query(
                "UPDATE NetworkCredentials SET Lifecycle = 'vms_cr_created' WHERE Id = $1",
                [row.id]
            );
            notify.update("NetworkCredentials", row.id);
        }
        await client.query("COMMIT");
        await notify.commit();
    } catch (err) {
        Log(`Rolling back new-network-credential transaction: ${err.stack}`);
        await client.query("ROLLBACK");
    } finally {
        client.release();
    }
}

async function onCertificateRequestsChange(action, _id) {
    if (action === "ADD") {
        await processCertificateRequests(true);
    }
}

//
// processCertificateRequests
//
// When new networks are created, add a certificate request to begin the full setup of the network.
// Note that this function is invoked periodically (every 10 seconds when idle) rather than by notification.
// This is because it must handle requests scehduled in the future.
//
async function processCertificateRequests(nonrecurring) {
    let rescheduleInterval = 10000;
    const client = await ClientFromPool("system");
    const notify = new NotifyTransaction();
    try {
        await client.query("BEGIN");
        const result = await client.query(
            "SELECT * FROM CertificateRequests WHERE RequestTime <= now() and Lifecycle = 'new' ORDER BY CreatedTime LIMIT 1"
        );
        if (result.rowCount == 1) {
            rescheduleInterval = 0;
            const row = result.rows[0];
            Log(`Processing Certificate Request: ${row.id} (${row.requesttype})`);
            let name;
            let is_ca;
            let issuer;
            const extra_annotations = {};
            let dns_name;
            let usage;
            switch (row.requesttype) {
                case "mgmtController":
                    name = `vms-mgmt-controller-${row.id}`;
                    usage = "client auth";
                    break;
                case "backboneCA":
                    name = `vms-bb-ca-${row.id}`;
                    is_ca = true;
                    usage = "signing";
                    break;
                case "accessPoint":
                    name = `vms-access-${row.id}`;
                    issuer = row.issuer;
                    usage = "server auth";
                    dns_name = row.hostname;
                    break;
                case "vanCA":
                    name = `vms-van-ca-${row.id}`;
                    is_ca = true;
                    issuer = row.issuer;
                    usage = "signing";
                    break;
                case "vanCredential":
                    name = `vms-van-cred-${row.id}`;
                    is_ca = false;
                    issuer = row.issuer;
                    usage = "client auth";
                    break;
                case "interiorRouter":
                    name = `vms-interior-${row.id}`;
                    is_ca = false;
                    issuer = row.issuer;
                    usage = "client auth";
                    break;
                case "memberClaim":
                    name = `vms-claim-${row.id}`;
                    is_ca = false;
                    issuer = row.issuer;
                    usage = "client auth";
                    extra_annotations["skupper.io/vms-controller-image"] = SiteControllerImage();
                    // TODO - Add annotations for valid and expiration times for this claim
                    break;
                case "vanSite":
                    name = `vms-member-${row.id}`;
                    is_ca = false;
                    issuer = row.issuer;
                    usage = "client auth";
                    break;
            }

            let issuer_name;
            if (!issuer) {
                issuer_name = RootIssuer();
            } else {
                const issuer_result = await client.query(
                    "SELECT ObjectName FROM TlsCertificates WHERE Id = $1",
                    [issuer]
                );
                if (issuer_result.rowCount == 1) {
                    issuer_name = issuer_result.rows[0].objectname;
                } else {
                    // TODO - Go to 'failed' state and store error
                }
            }

            const cert_obj = certificateObject(
                name,
                row.durationhours,
                is_ca,
                issuer_name,
                row.id,
                row.issuer ? row.issuer : "root",
                extra_annotations,
                name,
                dns_name,
                usage
            );
            await ApplyObject(cert_obj);
            await client.query(
                "UPDATE CertificateRequests SET Lifecycle = 'cm_cert_created' WHERE Id = $1",
                [row.id]
            );
            notify.update("CertificateRequests", row.id);
        }
        await client.query("COMMIT");
        await notify.commit();
    } catch (err) {
        Log(`Rolling back cert-request transaction: ${err.stack}`);
        await client.query("ROLLBACK");
    } finally {
        client.release();
        if (!nonrecurring) {
            setTimeout(processCertificateRequests, rescheduleInterval);
        }
    }
}

function ownerFromCertificateRequest(cert_request) {
    if (cert_request.managementcontroller) {
        return {
            ref_table: "ManagementControllers",
            ref_id: cert_request.managementcontroller,
            ref_label: "Management Controller",
            is_ca: false,
            alertSiteCertChanged: false,
            alertAccessCertChanged: false,
            alertMemberCompletion: false,
        };
    }
    if (cert_request.backbone) {
        return {
            ref_table: "Backbones",
            ref_id: cert_request.backbone,
            ref_label: "Backbone",
            is_ca: true,
            alertSiteCertChanged: false,
            alertAccessCertChanged: false,
            alertMemberCompletion: false,
        };
    }
    if (cert_request.interiorsite) {
        return {
            ref_table: "InteriorSites",
            ref_id: cert_request.interiorsite,
            ref_label: "Backbone Site",
            is_ca: false,
            alertSiteCertChanged: true,
            alertAccessCertChanged: false,
            alertMemberCompletion: false,
        };
    }
    if (cert_request.accesspoint) {
        return {
            ref_table: "BackboneAccessPoints",
            ref_id: cert_request.accesspoint,
            ref_label: "Access Point",
            is_ca: false,
            alertSiteCertChanged: false,
            alertAccessCertChanged: true,
            alertMemberCompletion: false,
        };
    }
    if (cert_request.applicationnetwork) {
        return {
            ref_table: "ApplicationNetworks",
            ref_id: cert_request.applicationnetwork,
            ref_label: "VAN",
            is_ca: true,
            alertSiteCertChanged: false,
            alertAccessCertChanged: false,
            alertMemberCompletion: false,
        };
    }
    if (cert_request.networkcredential) {
        return {
            ref_table: "NetworkCredentials",
            ref_id: cert_request.networkcredential,
            ref_label: "VAN Attach",
            is_ca: false,
            alertSiteCertChanged: false,
            alertAccessCertChanged: false,
            alertMemberCompletion: false,
        };
    }
    if (cert_request.invitation) {
        return {
            ref_table: "MemberInvitations",
            ref_id: cert_request.invitation,
            ref_label: "Member Invitation",
            is_ca: false,
            alertSiteCertChanged: false,
            alertAccessCertChanged: false,
            alertMemberCompletion: false,
        };
    }
    if (cert_request.site) {
        return {
            ref_table: "MemberSites",
            ref_id: cert_request.site,
            ref_label: "Member Site",
            is_ca: false,
            alertSiteCertChanged: false,
            alertAccessCertChanged: false,
            alertMemberCompletion: true,
        };
    }
    throw new Error("Unknown Target");
}

async function expirationAndRenewalFromSecret(secret) {
    const cert_object = await LoadCertificate(secret.metadata.name);
    const expiration =
        expirationFromTlsSecret(secret) ||
        (cert_object?.status?.notAfter ? new Date(cert_object.status.notAfter) : undefined);
    const renewal = cert_object?.status?.renewalTime
        ? new Date(cert_object.status.renewalTime)
        : undefined;
    return { expiration, renewal };
}

function applyCertificateDblink(cert, newId) {
    const alreadyUpdated =
        cert.metadata?.annotations?.["skupper.io/vms-dblink"] === newId &&
        cert.spec?.secretTemplate?.annotations?.["skupper.io/vms-dblink"] === newId;
    if (alreadyUpdated) {
        return false;
    }
    cert.metadata ??= {};
    cert.metadata.annotations ??= {};
    cert.spec ??= {};
    cert.spec.secretTemplate ??= {};
    cert.spec.secretTemplate.annotations ??= {};
    cert.metadata.annotations["skupper.io/vms-dblink"] = newId;
    cert.spec.secretTemplate.annotations["skupper.io/vms-dblink"] = newId;
    return true;
}

function applySecretDblink(kubeSecret, newId) {
    if (kubeSecret.metadata?.annotations?.["skupper.io/vms-dblink"] === newId) {
        return false;
    }
    kubeSecret.metadata ??= {};
    kubeSecret.metadata.annotations ??= {};
    kubeSecret.metadata.annotations["skupper.io/vms-dblink"] = newId;
    return true;
}

async function replaceWithConflictRetry(load, shouldWrite, write) {
    let lastErr;
    for (let attempt = 0; attempt < KUBE_CONFLICT_RETRIES; attempt++) {
        const obj = await load();
        if (!obj) {
            return;
        }
        if (!shouldWrite(obj)) {
            return;
        }
        try {
            await write(obj);
            return;
        } catch (err) {
            lastErr = err;
            if (kubeStatusCode(err) != 409) {
                throw err;
            }
        }
    }
    throw lastErr;
}

async function retargetTlsDbLink(objectName, newId) {
    await replaceWithConflictRetry(
        () => LoadCertificate(objectName),
        (cert) => applyCertificateDblink(cert, newId),
        (cert) => ReplaceCertificate(cert)
    );
    await replaceWithConflictRetry(
        () => LoadSecret(objectName),
        (kubeSecret) => applySecretDblink(kubeSecret, newId),
        (kubeSecret) => ReplaceSecret(objectName, kubeSecret)
    );
}

function enqueueSecretWork(objectName, work) {
    const previous = secretWorkTail.get(objectName) || Promise.resolve();
    const next = previous.catch(() => {}).then(work);
    secretWorkTail.set(objectName, next);
    next.finally(() => {
        if (secretWorkTail.get(objectName) === next) {
            secretWorkTail.delete(objectName);
        }
    });
    return next;
}

async function maybeTrimIssuerSiblings(certId) {
    const client = await ClientFromPool("system");
    try {
        const cert = await loadCertificateRow(client, certId);
        if (!cert?.signedby) {
            return;
        }
        const issuer = await loadCertificateRow(client, cert.signedby);
        const oldCaId = issuer?.supercedes;
        if (!oldCaId) {
            return;
        }
        if (await hasLiveChildren(client, oldCaId)) {
            return;
        }
        const siblings = await listCurrentLeafChildren(client, issuer.id);
        for (const sibling of siblings) {
            if (sibling.id === certId) {
                continue;
            }
            await SiteCertificateChanged(sibling.id);
            await AccessCertificateChanged(sibling.id);
            await SyncColoTlsCertificate(sibling.id);
        }
    } finally {
        client.release();
    }
}

async function notifyTlsConsumers(certId) {
    await SiteCertificateChanged(certId);
    await AccessCertificateChanged(certId);
    await SyncColoTlsCertificate(certId);
    await maybeTrimIssuerSiblings(certId);
}

function durationHoursFromInterval(interval) {
    return Math.trunc(IntervalMilliseconds(interval) / 3600000);
}

const VAN_CA_MIN_DURATION_HOURS = 1;

function vanCaDurationHours(van) {
    if (van.endtime) {
        const durationMs =
            new Date(van.endtime).getTime() - Date.now() + IntervalMilliseconds(van.deletedelay);
        return Math.max(VAN_CA_MIN_DURATION_HOURS, Math.trunc(durationMs / 3600000));
    }
    return durationHoursFromInterval(DefaultCaExpiration());
}

async function insertRotationCertificateRequest(
    client,
    notify,
    created,
    { requestType, ownerColumn, ownerId, issuerId, supercedes, durationHours, hostname }
) {
    const pending = await client.query("SELECT Id FROM CertificateRequests WHERE Supercedes = $1", [
        supercedes,
    ]);
    if (pending.rowCount > 0) {
        return created;
    }
    const already = await client.query("SELECT Id FROM TlsCertificates WHERE Supercedes = $1", [
        supercedes,
    ]);
    if (already.rowCount > 0) {
        return created;
    }
    const result = await client.query(
        `INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, ${ownerColumn}, Issuer, Supercedes, Hostname) ` +
            "VALUES(gen_random_uuid(), $1, $2, now(), $3, $4, $5, $6, $7) RETURNING Id",
        [requestType, created, durationHours, ownerId, issuerId, supercedes, hostname || null]
    );
    notify.add("CertificateRequests", result.rows[0].id);
    return new Date(created.getTime() + 1);
}

async function insertCaRotationRequest(oldCertId) {
    const client = await ClientFromPool("system");
    const notify = new NotifyTransaction();
    try {
        await client.query("BEGIN");
        const cert = await lockCurrentCertificate(client, oldCertId);
        if (!cert) {
            throw httpError(404, "Certificate not found");
        }
        if (!cert.isca) {
            throw httpError(400, "Certificate is not a CA");
        }
        if (await isCertificateSuperseded(client, oldCertId)) {
            throw httpError(409, "Certificate has been superseded");
        }
        const pending = await client.query(
            "SELECT Id FROM CertificateRequests WHERE Supercedes = $1",
            [oldCertId]
        );
        if (pending.rowCount > 0) {
            throw httpError(409, "Certificate rotation already in progress");
        }
        const bb = await client.query("SELECT Id FROM Backbones WHERE Certificate = $1", [
            oldCertId,
        ]);
        let result;
        if (bb.rowCount == 1) {
            const durationHours = durationHoursFromInterval(BackboneExpiration());
            result = await client.query(
                "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, Backbone, Issuer, Supercedes) " +
                    "VALUES(gen_random_uuid(), 'backboneCA', now(), now(), $1, $2, $3, $4) RETURNING Id",
                [durationHours, bb.rows[0].id, cert.signedby, oldCertId]
            );
        } else {
            const van = await client.query(
                "SELECT an.Id, an.StartTime, an.EndTime, an.DeleteDelay, b.Certificate AS bbca " +
                    "FROM ApplicationNetworks an " +
                    "JOIN Backbones b ON b.Id = an.Backbone " +
                    "WHERE an.Certificate = $1",
                [oldCertId]
            );
            if (van.rowCount != 1) {
                throw httpError(400, "Certificate rotation of this CA is not supported");
            }
            const row = van.rows[0];
            result = await client.query(
                "INSERT INTO CertificateRequests(Id, RequestType, CreatedTime, RequestTime, DurationHours, ApplicationNetwork, Issuer, Supercedes) " +
                    "VALUES(gen_random_uuid(), 'vanCA', now(), now(), $1, $2, $3, $4) RETURNING Id",
                [vanCaDurationHours(row), row.id, row.bbca, oldCertId]
            );
        }
        notify.add("CertificateRequests", result.rows[0].id);
        await client.query("COMMIT");
        await notify.commit();
        return result.rows[0].id;
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

async function enqueueBackboneCaChildRequests(newCaId, oldCaId) {
    const client = await ClientFromPool("system");
    const notify = new NotifyTransaction();
    try {
        await client.query("BEGIN");
        const backbone = await client.query("SELECT Id FROM Backbones WHERE Certificate = $1", [
            newCaId,
        ]);
        if (backbone.rowCount != 1) {
            await client.query("COMMIT");
            return;
        }
        const backboneId = backbone.rows[0].id;
        const leafHours = durationHoursFromInterval(DefaultCertExpiration());
        const sites = await client.query(
            "SELECT s.Id, s.Certificate FROM InteriorSites s " +
                "JOIN TlsCertificates c ON c.Id = s.Certificate " +
                "WHERE s.Backbone = $1 AND c.SignedBy = $2",
            [backboneId, oldCaId]
        );
        const aps = await client.query(
            "SELECT ap.Id, ap.Kind, ap.Hostname, ap.Certificate FROM BackboneAccessPoints ap " +
                "JOIN InteriorSites s ON s.Id = ap.InteriorSite " +
                "JOIN TlsCertificates c ON c.Id = ap.Certificate " +
                "WHERE s.Backbone = $1 AND c.SignedBy = $2",
            [backboneId, oldCaId]
        );
        const vans = await client.query(
            "SELECT an.Id, an.Certificate, an.StartTime, an.EndTime, an.DeleteDelay FROM ApplicationNetworks an " +
                "JOIN TlsCertificates c ON c.Id = an.Certificate " +
                "WHERE an.Backbone = $1 AND c.SignedBy = $2",
            [backboneId, oldCaId]
        );
        const creds = await client.query(
            "SELECT cred.Id, cred.Certificate FROM NetworkCredentials cred " +
                "JOIN ApplicationNetworks an ON an.Id = cred.MemberOf " +
                "JOIN TlsCertificates c ON c.Id = cred.Certificate " +
                "WHERE an.Backbone = $1 AND c.SignedBy = $2",
            [backboneId, oldCaId]
        );
        const nonManage = [];
        const manage = [];
        for (const ap of aps.rows) {
            if (ap.kind == "manage") {
                manage.push(ap);
            } else {
                nonManage.push(ap);
            }
        }

        let created = new Date();
        const insertChild = async (spec) => {
            created = await insertRotationCertificateRequest(client, notify, created, {
                ...spec,
                issuerId: newCaId,
            });
        };

        for (const site of sites.rows) {
            await insertChild({
                requestType: "interiorRouter",
                ownerColumn: "InteriorSite",
                ownerId: site.id,
                supercedes: site.certificate,
                durationHours: leafHours,
            });
        }
        for (const ap of nonManage) {
            await insertChild({
                requestType: "accessPoint",
                ownerColumn: "AccessPoint",
                ownerId: ap.id,
                supercedes: ap.certificate,
                durationHours: leafHours,
                hostname: ap.hostname,
            });
        }
        for (const van of vans.rows) {
            await insertChild({
                requestType: "vanCA",
                ownerColumn: "ApplicationNetwork",
                ownerId: van.id,
                supercedes: van.certificate,
                durationHours: vanCaDurationHours(van),
            });
        }
        for (const cred of creds.rows) {
            await insertChild({
                requestType: "vanCredential",
                ownerColumn: "NetworkCredential",
                ownerId: cred.id,
                supercedes: cred.certificate,
                durationHours: leafHours,
            });
        }
        for (const ap of manage) {
            await insertChild({
                requestType: "accessPoint",
                ownerColumn: "AccessPoint",
                ownerId: ap.id,
                supercedes: ap.certificate,
                durationHours: leafHours,
                hostname: ap.hostname,
            });
        }

        await client.query("COMMIT");
        await notify.commit();
    } catch (err) {
        Log(`Rolling back enqueue-backbone-ca-children transaction: ${err.stack}`);
        await client.query("ROLLBACK");
    } finally {
        client.release();
    }
}

async function enqueueVanCaChildRequests(newCaId, oldCaId) {
    const client = await ClientFromPool("system");
    const notify = new NotifyTransaction();
    try {
        await client.query("BEGIN");
        const van = await client.query(
            "SELECT Id FROM ApplicationNetworks WHERE Certificate = $1",
            [newCaId]
        );
        if (van.rowCount != 1) {
            await client.query("COMMIT");
            return;
        }
        const vanId = van.rows[0].id;
        const leafHours = durationHoursFromInterval(DefaultCertExpiration());
        // Invitation claims stay on the old vanCA; claim rotation is out of scope.
        const members = await client.query(
            "SELECT m.Id, m.Certificate FROM MemberSites m " +
                "JOIN TlsCertificates c ON c.Id = m.Certificate " +
                "WHERE m.MemberOf = $1 AND c.SignedBy = $2",
            [vanId, oldCaId]
        );

        let created = new Date();
        for (const member of members.rows) {
            created = await insertRotationCertificateRequest(client, notify, created, {
                requestType: "vanSite",
                ownerColumn: "Site",
                ownerId: member.id,
                issuerId: newCaId,
                supercedes: member.certificate,
                durationHours: leafHours,
            });
        }

        await client.query("COMMIT");
        await notify.commit();
    } catch (err) {
        Log(`Rolling back enqueue-van-ca-children transaction: ${err.stack}`);
        await client.query("ROLLBACK");
    } finally {
        client.release();
    }
}

//
// A secret that is controlled by this controller and has a database link has been added.  Update the database
// to register the completion of the creation of a certificate or a CA.
//
async function secretAdded(dblink, secret) {
    const client = await ClientFromPool("system");
    const notify = new NotifyTransaction();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT * FROM CertificateRequests WHERE Id = $1", [
            dblink,
        ]);

        if (result.rowCount != 1) {
            await client.query("ROLLBACK");
            return false;
        }

        const cert_request = result.rows[0];
        const owner = ownerFromCertificateRequest(cert_request);
        const ref_table = owner.ref_table;
        const ref_id = owner.ref_id;
        const is_ca = owner.is_ca;
        const alertSiteCertChanged = owner.alertSiteCertChanged;
        const alertAccessCertChanged = owner.alertAccessCertChanged;
        const alertMemberCompletion = owner.alertMemberCompletion;
        const rotation = !!cert_request.supercedes;
        const oldCaId = cert_request.supercedes;

        const { expiration, renewal } = await expirationAndRenewalFromSecret(secret);
        const annotationIssuer = secret.metadata.annotations["skupper.io/vms-issuerlink"];
        const signed_by = rotation
            ? cert_request.issuer
            : annotationIssuer == "root"
              ? null
              : annotationIssuer;
        const get_name = await client.query(`SELECT name FROM ${ref_table} WHERE Id = $1`, [
            ref_id,
        ]);
        const label = `${owner.ref_label}: ${get_name.rows[0].name}`;

        let rotationOrdinal = 0;
        if (rotation) {
            const predecessor = await lockCurrentCertificate(client, cert_request.supercedes);
            if (!predecessor) {
                throw new Error(`Superseded certificate ${cert_request.supercedes} not found`);
            }
            rotationOrdinal = (predecessor.rotationordinal ?? 0) + 1;
        }

        await client.query(
            "INSERT INTO TlsCertificates (Id, IsCA, ObjectName, Expiration, RenewalTime, Label, SignedBy, RotationOrdinal, Supercedes) " +
                "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            [
                dblink,
                is_ca,
                secret.metadata.name,
                expiration,
                renewal,
                label,
                signed_by || null,
                rotationOrdinal,
                cert_request.supercedes,
            ]
        );
        notify.add("TlsCertificates", dblink);

        if (rotation) {
            await retargetParentCertificateFks(client, notify, cert_request.supercedes, dblink);
        } else {
            await client.query(
                `UPDATE ${ref_table} SET Certificate = $1, Lifecycle = 'ready' WHERE Id = $2`,
                [dblink, ref_id]
            );
            notify.update(ref_table, ref_id);
        }

        await client.query("DELETE FROM CertificateRequests WHERE Id = $1", [dblink]);
        notify.delete("CertificateRequests", dblink);
        if (is_ca) {
            const issuer_obj = issuerObject(
                secret.metadata.name,
                secret.metadata.annotations["skupper.io/vms-dblink"]
            );
            await ApplyObject(issuer_obj);
        }
        Log(
            `Certificate${is_ca ? " Authority" : ""}${rotation ? " rotated" : " created"}: ${secret.metadata.name}`
        );
        if (alertSiteCertChanged && !rotation) {
            await SiteLifecycleChanged_TX(client, notify, ref_id, "ready");
        }
        await client.query("COMMIT");
        await notify.commit();

        // cert-manager writes the Secret before status.renewalTime exists; fill it from a follow-up GET.
        if (!renewal) {
            try {
                const cert_object = await LoadCertificate(secret.metadata.name);
                await persistCertificateTimes(cert_object, dblink);
            } catch (err) {
                Log(
                    `Failed to persist certificate times for ${secret.metadata.name}: ${err.stack}`
                );
            }
        }

        if (rotation) {
            if (is_ca && oldCaId) {
                if (ref_table == "Backbones") {
                    await enqueueBackboneCaChildRequests(dblink, oldCaId);
                } else if (ref_table == "ApplicationNetworks") {
                    await enqueueVanCaChildRequests(dblink, oldCaId);
                }
                await maybeTrimIssuerSiblings(dblink);
            }
            if (!is_ca) {
                await notifyTlsConsumers(dblink);
            }
        } else {
            if (alertSiteCertChanged) {
                await SiteCertificateChanged(dblink);
            } else if (alertAccessCertChanged) {
                await AccessCertificateChanged(dblink);
            }

            //
            // If we just updated a member site, there will be a claim-assertion that is awaiting completion.  Invoke the completion function.
            //
            if (alertMemberCompletion) {
                await CompleteMember(ref_id);
            }

            //
            // If this is an access point, ping the site-deployment-state module in case it needs to do anything.
            //
            if (ref_table == "BackboneAccessPoints") {
                await AccessPointCertReady(ref_id);
            }
        }
        return true;
    } catch (err) {
        if (err.code === PG_UNIQUE_VIOLATION) {
            Log(`Certificate ${dblink} already has a successor; ignoring duplicate secret add`);
        } else {
            Log(`Rolling back secret-added transaction: ${err.stack}`);
        }
        //
        // There's been no meaningful action taken.  Roll back the transaction.
        //
        await client.query("ROLLBACK");
        return false;
    } finally {
        client.release();
    }
}

async function secretRenewed(secret) {
    const objectName = secret.metadata.name;
    const { expiration, renewal } = await expirationAndRenewalFromSecret(secret);
    let currentId;
    let caRotationId;
    const client = await ClientFromPool("system");
    const notify = new NotifyTransaction();
    try {
        await client.query("BEGIN");
        const latest = await lockCurrentCertificateByObjectName(client, objectName);
        if (!latest) {
            await client.query("ROLLBACK");
            return;
        }
        if (await isCertificateSuperseded(client, latest.id)) {
            await client.query("ROLLBACK");
            return;
        }
        if (timestampsEqual(latest.expiration, expiration)) {
            if (!timestampsEqual(latest.renewaltime, renewal) && renewal) {
                await client.query("UPDATE TlsCertificates SET RenewalTime = $1 WHERE Id = $2", [
                    renewal,
                    latest.id,
                ]);
                notify.update("TlsCertificates", latest.id);
                await client.query("COMMIT");
                await notify.commit();
            } else {
                await client.query("ROLLBACK");
            }
            return;
        }
        if (latest.isca) {
            caRotationId = latest.id;
            await client.query("COMMIT");
        } else {
            currentId = randomUUID();
            const signedBy =
                secret.metadata.annotations?.["skupper.io/vms-issuerlink"] == "root"
                    ? null
                    : secret.metadata.annotations?.["skupper.io/vms-issuerlink"] || latest.signedby;
            await client.query(
                "INSERT INTO TlsCertificates (Id, IsCA, ObjectName, SignedBy, Expiration, RenewalTime, RotationOrdinal, Supercedes, Label) " +
                    "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
                [
                    currentId,
                    latest.isca,
                    objectName,
                    signedBy,
                    expiration,
                    renewal,
                    (latest.rotationordinal ?? 0) + 1,
                    latest.id,
                    latest.label,
                ]
            );
            notify.add("TlsCertificates", currentId);
            await retargetParentCertificateFks(client, notify, latest.id, currentId);
            await client.query("COMMIT");
            await notify.commit();
        }
    } catch (err) {
        if (err.code === PG_UNIQUE_VIOLATION) {
            Log(`Leaf rotation skipped for ${objectName}: successor already exists`);
        } else {
            Log(`Rolling back secret-renewed transaction: ${err.stack}`);
        }
        await client.query("ROLLBACK");
        currentId = undefined;
        caRotationId = undefined;
    } finally {
        client.release();
    }

    if (caRotationId) {
        try {
            await insertCaRotationRequest(caRotationId);
        } catch (err) {
            if (err.statusCode === 409) {
                Log(`CA rotation skipped for ${caRotationId}: ${err.message}`);
            } else {
                Log(`CA rotation failed for ${caRotationId}: ${err.stack || err.message}`);
            }
        }
        return;
    }

    if (!currentId) {
        return;
    }

    try {
        await retargetTlsDbLink(objectName, currentId);
    } catch (err) {
        Log(`WARN: Failed to retarget vms-dblink to ${currentId}: ${err.message}`);
    }
    await notifyTlsConsumers(currentId);
}

//
// Handle watch events on Secrets
//
const onSecretWatch = function (action, secret) {
    const anno = secret.metadata.annotations;
    if (anno?.[META_ANNOTATION_VMS_CONTROLLED] != "true") {
        return;
    }
    const dblink = anno["skupper.io/vms-dblink"];
    if (!dblink) {
        return;
    }
    const objectName = secret.metadata.name;
    if (action == "ADDED") {
        return enqueueSecretWork(objectName, () => secretAdded(dblink, secret));
    }
    if (action == "MODIFIED" && secret.data) {
        return enqueueSecretWork(objectName, async () => {
            const created = await secretAdded(dblink, secret);
            if (!created) {
                await secretRenewed(secret);
            }
        });
    }
};

async function persistCertificateTimes(cert, currentIdHint) {
    const renewalTime = cert?.status?.renewalTime;
    if (!renewalTime) {
        return;
    }
    const renewal = new Date(renewalTime);
    const expiration = cert.status?.notAfter ? new Date(cert.status.notAfter) : null;
    const notify = new NotifyTransaction();
    const client = await ClientFromPool("system");
    try {
        await client.query("BEGIN");
        let currentId = currentIdHint || cert.metadata?.annotations?.["skupper.io/vms-dblink"];
        if (currentId && (await isCertificateSuperseded(client, currentId))) {
            const tip = await lockCurrentCertificateByObjectName(client, cert.metadata?.name);
            currentId = tip?.id;
        }
        if (!currentId) {
            const tip = await lockCurrentCertificateByObjectName(client, cert.metadata?.name);
            currentId = tip?.id;
        }
        if (!currentId) {
            await client.query("ROLLBACK");
            return;
        }
        const dbcert = await client.query(
            "UPDATE TlsCertificates SET RenewalTime = $1::timestamptz, Expiration = COALESCE(Expiration, $2::timestamptz) " +
                "WHERE Id = $3 AND (RenewalTime IS DISTINCT FROM $1::timestamptz OR (Expiration IS NULL AND $2::timestamptz IS NOT NULL)) RETURNING Id",
            [renewal, expiration, currentId]
        );
        for (const dbrow of dbcert.rows) {
            notify.update("TlsCertificates", dbrow.id);
        }
        await client.query("COMMIT");
        await notify.commit();
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`Exception in persistCertificateTimes: ${error.stack}`);
    } finally {
        client.release();
    }
}

//
// Handle watch events on Certificates
//
const onCertificateWatch = async function (action, cert) {
    if (
        (action == "ADDED" || action == "MODIFIED") &&
        cert.metadata.annotations?.[META_ANNOTATION_VMS_CONTROLLED] == "true"
    ) {
        await persistCertificateTimes(cert);
    }
};

//
// Generate a cert-manager Certificate object from a template.
//
const certificateObject = function (
    name,
    duration_hours,
    is_ca,
    issuer,
    db_link,
    issuer_link,
    extra_annotations,
    common_name,
    dns_name,
    usage
) {
    const cert = {
        apiVersion: "cert-manager.io/v1",
        kind: "Certificate",
        metadata: {
            name: name,
            annotations: {
                "skupper.io/vms-dblink": db_link,
            },
        },
        spec: {
            secretName: name,
            secretTemplate: {
                annotations: {
                    [META_ANNOTATION_VMS_CONTROLLED]: "true",
                    "skupper.io/vms-dblink": db_link,
                    "skupper.io/vms-issuerlink": issuer_link,
                },
            },
            duration: `${duration_hours}h`,
            subject: {
                organizations: [CertOrganization()],
            },
            commonName: common_name,
            isCA: is_ca,
            privateKey: {
                algorithm: "RSA",
                encoding: "PKCS1",
                size: 2048,
            },
            usages: [usage],
            issuerRef: {
                name: issuer,
                kind: "Issuer",
                group: "cert-manager.io",
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
};

//
// Generate a cert-manager Issuer object from a template.
//
const issuerObject = function (name, db_link) {
    return {
        apiVersion: "cert-manager.io/v1",
        kind: "Issuer",
        metadata: {
            name: name,
            annotations: {
                "skupper.io/vms-dblink": db_link,
            },
        },
        spec: {
            ca: {
                secretName: name,
            },
            secretName: name,
        },
    };
};

//
// ReconcileCertManager
//
// Returns true if cert-manager is fully operational on the cluster and false otherwise
//
async function ReconcileCertManager() {
    try {
        await GetIssuers();
    } catch {
        return false;
    }
    return true;
}

const WatchCertManager = async function () {
    if (await ReconcileCertManager()) {
        return;
    }
    Log(
        "WARNING: cert-manager is required but not found. The management controller needs cert-manager for TLS certificate management."
    );
    for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 10 * 1000));
        if (await ReconcileCertManager()) {
            return;
        }
    }
};

export async function RotateCertificate(cid) {
    if (!IsValidUuid(cid)) {
        throw httpError(400, `Malformed certificate ID: ${cid}`);
    }

    const client = await ClientFromPool("system");
    try {
        const result = await client.query(
            "SELECT Id, ObjectName, IsCA FROM TlsCertificates WHERE Id = $1",
            [cid]
        );
        if (result.rowCount == 0) {
            throw httpError(404, "Certificate not found");
        }
        const cert = result.rows[0];
        if (await isCertificateSuperseded(client, cid)) {
            throw httpError(409, "Certificate has been superseded");
        }
        if (!cert.isca) {
            if (!cert.objectname) {
                throw httpError(400, "Certificate has no Kubernetes object");
            }
            Log(`Triggering cert-manager renewal for ${cert.objectname} (${cid})`);
            try {
                await TriggerCertificateRenewal(cert.objectname);
            } catch (err) {
                if (kubeStatusCode(err) == 404) {
                    throw httpError(404, `Certificate object ${cert.objectname} not found`);
                }
                throw err;
            }
            return { id: cid };
        }
    } finally {
        client.release();
    }

    await insertCaRotationRequest(cid);
    return { id: cid };
}

export async function Start() {
    Log("[Certificate module starting]");
    RegisterNotification("ManagementControllers", onManagementControllersChange, true);
    RegisterNotification("Backbones", onBackbonesChange, true);
    RegisterNotification("BackboneAccessPoints", onAccessPointsChange, true);
    RegisterNotification("ApplicationNetworks", onApplicationNetworksChange, true);
    RegisterNotification("NetworkCredentials", onNetworkCredentialsChange, true);
    RegisterNotification("InteriorSites", onInteriorSitesChange, true);
    RegisterNotification("MemberInvitations", onInvitationsChange, true);
    RegisterNotification("MemberSites", onMemberSitesChange, true);
    RegisterNotification("CertificateRequests", onCertificateRequestsChange, false);
    setTimeout(processCertificateRequests, 1000);

    await WatchCertManager();
    WatchSecrets(onSecretWatch);
    WatchCertificates(onCertificateWatch);
}
