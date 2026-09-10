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

/**
 * This module is responsible for synchronizing the state of co-located namespaces and sites.
 * The database is the source of truth for the state of the co-located namespaces and sites.
 * The Kubernetes state will be reconciled with the database state if they are out of sync.
 */

import * as kube from "@vms/modules/kube";
import { Log } from "@vms/modules/log";
import { ClientFromPool } from "./db.js";
import * as resourceTemplates from "./resource-templates.js";
import * as common from "@vms/modules/common";
import { NotifyTransaction, RegisterNotification } from "./notify.js";
import { getTlsRotationMeta, overlayDualTrustCa } from "./tls-rotation.js";

const coloNamespaces = {}; // {namespace-name: {backbone, site, accesspoint}}
const backbonesWithNoNamespace = [];
const siteIndex = {}; // {siteId: namespace-name}
const apIndex = {}; // {apId: namespace-name}

/**
 * Start the colo sync module
 * @returns {Promise<void>}
 */
export async function Start() {
    Log("[Colo-Sync Module Started]");

    //
    // Pre-load the local list of colocated site namespaces.
    //
    const nsList = await kube.GetNamespaces().then((namespaces) =>
        namespaces.map((ns) => ({
            name: ns.metadata.name,
            annotations: ns.metadata.annotations || {},
        }))
    );
    for (const ns of nsList) {
        if (ns.annotations[common.META_ANNOTATION_VMS_CONTROLLED]) {
            coloNamespaces[ns.name] = {
                backbone: null,
                site: null,
                accesspoint: null,
                deleting: false,
            };
        }
    }

    //
    // Register the data-change notification handlers, requesting an initial sweep of all backbones for reconciliation.
    //
    await RegisterNotification("Backbones", onBackboneChange, true);
    await RegisterNotification("InteriorSites", onSiteChange, false);
    await RegisterNotification("BackboneAccessPoints", onAccessPointChange, false);

    setTimeout(visitIncompleteSites, 5000);
}

async function visitIncompleteSites() {
    for (const [ns, data] of Object.entries(coloNamespaces)) {
        if (data?.site?.deploymentstate != "deployed") {
            await visitNamespace(ns);
        }
    }

    setTimeout(visitIncompleteSites, 5000);
}

async function onSiteChange(action, sid) {
    const ns = siteIndex[sid];
    if (ns) {
        if (action === "UPDATE") {
            const client = await ClientFromPool("system");
            try {
                const result = await client.query("SELECT * FROM InteriorSites WHERE Id = $1", [
                    sid,
                ]);
                if (result.rowCount == 1) {
                    coloNamespaces[ns].site = result.rows[0];
                    await visitNamespace(ns);
                }
            } finally {
                client.release();
            }
        } else if (action === "DELETE") {
            coloNamespaces[ns].site = null;
            coloNamespaces[ns].deleting = true;
            await visitNamespace(ns);
        }
    }
}

async function onAccessPointChange(action, apid) {
    const ns = apIndex[apid];
    if (ns) {
        if (action === "UPDATE") {
            const client = await ClientFromPool("system");
            try {
                const result = await client.query(
                    "SELECT * FROM BackboneAccessPoints WHERE Id = $1",
                    [apid]
                );
                if (result.rowCount == 1) {
                    coloNamespaces[ns].accesspoint = result.rows[0];
                    await visitNamespace(ns);
                }
            } finally {
                client.release();
            }
        } else if (action === "DELETE") {
            coloNamespaces[ns].accesspoint = null;
            coloNamespaces[ns].deleting = true;
            await visitNamespace(ns);
        }
    }
}

async function onBackboneChange(action, id, unusedTableName, backbone) {
    switch (action) {
        case "EXISTS": {
            const ns = backbone.colocatednamespace;
            if (ns) {
                if (coloNamespaces[ns]) {
                    coloNamespaces[ns].backbone = backbone;
                } else {
                    backbonesWithNoNamespace.push(backbone);
                }
            }
            break;
        }
        case "EXISTS_COMPLETE":
            await doInitialReconcile();
            break;
        case "ADD": {
            const client = await ClientFromPool("system");
            try {
                const bbResult = await client.query(
                    "SELECT * FROM Backbones WHERE Id = $1 AND ColocatedNamespace IS NOT NULL",
                    [id]
                );
                if (bbResult.rowCount == 1) {
                    await addColoNamespace(bbResult.rows[0]);
                }
            } catch (error) {
                Log("Exception in onBackbonesChange(ADD)");
                throw error;
            } finally {
                client.release();
            }
            break;
        }
        case "DELETE":
            await handleDeletedBackbone(id);
            break;
        case "UPDATE":
            // Ignore updates
            break;
    }
}

async function doInitialReconcile() {
    for (const backbone of backbonesWithNoNamespace) {
        await addColoNamespace(backbone);
    }
    backbonesWithNoNamespace.length = 0;

    for (const [ns, data] of Object.entries(coloNamespaces)) {
        if (!data.backbone) {
            await kube.deleteNamespace(ns);
            delete coloNamespaces[ns];
        } else {
            const client = await ClientFromPool("system");
            try {
                const siteResult = await client.query(
                    "SELECT * FROM InteriorSites WHERE CoLocated = true AND Backbone = $1",
                    [data.backbone.id]
                );
                if (siteResult.rowCount == 1) {
                    coloNamespaces[ns].site = siteResult.rows[0];
                    siteIndex[siteResult.rows[0].id] = ns;
                    const apResult = await client.query(
                        "SELECT * FROM BackboneAccessPoints WHERE InteriorSite = $1 AND Kind = 'manage'",
                        [siteResult.rows[0].id]
                    );
                    if (apResult.rowCount == 1) {
                        coloNamespaces[ns].accesspoint = apResult.rows[0];
                        apIndex[apResult.rows[0].id] = ns;
                    }
                }
                await visitNamespace(ns);
            } catch (error) {
                Log(`Exception in doInitialReconcile: ${error.stack}`);
            } finally {
                client.release();
            }
        }
    }
}

async function addColoNamespace(backbone) {
    await kube.createNamespace(backbone.colocatednamespace);
    coloNamespaces[backbone.colocatednamespace] = {
        backbone: backbone,
        site: null,
        accesspoint: null,
        deleting: false,
    };
    Log(`Created colocated namespace: ${backbone.colocatednamespace}`);
    await visitNamespace(backbone.colocatednamespace);
}

async function handleDeletedBackbone(bbid) {
    for (const [ns, data] of Object.entries(coloNamespaces)) {
        if (data.backbone?.id === bbid) {
            const client = await ClientFromPool("system");
            const notify = new NotifyTransaction();
            try {
                await client.query("BEGIN");
                if (data.accesspoint) {
                    await client.query("DELETE FROM BackboneAccessPoints WHERE Id = $1", [
                        data.accesspoint.id,
                    ]);
                    notify.delete("BackboneAccessPoints", data.accesspoint.id);
                    delete apIndex[data.accesspoint.id];
                }
                if (data.site) {
                    await client.query("DELETE FROM InteriorSites WHERE Id = $1", [data.site.id]);
                    notify.delete("InteriorSites", data.site.id);
                    delete siteIndex[data.site.id];
                }
                await kube.deleteNamespace(ns);
                delete coloNamespaces[ns];
                Log(`Deleted colocated namespace: ${ns}`);
                await client.query("COMMIT");
                await notify.commit();
            } catch (error) {
                await client.query("ROLLBACK");
                throw error;
            } finally {
                client.release();
            }
            break;
        }
    }
}

const visitQueue = [];
let visitRunning = false;

async function visitNamespace(ns) {
    visitQueue.push(ns);
    if (!visitRunning) {
        visitRunning = true;
        await runTheVisitQueue();
        visitRunning = false;
    }
}

async function runTheVisitQueue() {
    let ns = visitQueue.shift();
    while (ns) {
        await doVisitNamespace(ns);
        ns = visitQueue.shift();
    }
}

async function doVisitNamespace(ns) {
    //
    // Conditions to ensure, in order:
    //  - site record exists in database (else create it)
    //  - accesspoint record exists in database (else create it)
    //  - Site CR is installed in the namespace (else apply it)
    //  - if the site record is in READY or ACTIVE state, the site certificate is installed in namespace (else apply it)
    //  - RouterAccess CR is installed in the namespace (else apply it)
    //  - accesspoint has host/port attributes matching the RouterAccess CR (else set accesspoint host/port and status to NEW)
    //  - accesspoint is in READY state and the server certificate is installed in namespace (else apply it)
    //
    if (!coloNamespaces[ns] || coloNamespaces[ns].deleting) {
        return;
    }
    const client = await ClientFromPool("system");
    const notify = new NotifyTransaction();
    const undoSite = coloNamespaces[ns].site === null;
    const undoAp = coloNamespaces[ns].accesspoint === null;
    try {
        await client.query("BEGIN");

        //
        // Ensure site record exists in database (else create it)
        //
        if (!coloNamespaces[ns].site) {
            const result = await client.query(
                "INSERT INTO InteriorSites(Name, TargetPlatform, CoLocated, Backbone) " +
                    "VALUES ('co-located', 'sk2', true, $1) RETURNING *",
                [coloNamespaces[ns].backbone.id]
            );
            const site = result.rows[0];
            coloNamespaces[ns].site = site;
            siteIndex[site.id] = ns;
            notify.add("InteriorSites", site.id);
        }

        //
        // Ensure accesspoint record exists in database (else create it)
        //
        if (!coloNamespaces[ns].accesspoint) {
            const result = await client.query(
                "INSERT INTO BackboneAccessPoints(Name, Kind, InteriorSite, AccessType) " +
                    "VALUES ('manage', 'manage', $1, 'local') RETURNING *",
                [coloNamespaces[ns].site.id]
            );
            const ap = result.rows[0];
            coloNamespaces[ns].accesspoint = ap;
            apIndex[ap.id] = ns;
            notify.add("BackboneAccessPoints", ap.id);

            // Add, but don't track, a VAN access point in the site with default AccessType (may be deleted or modified by user).
            const vanResult = await client.query(
                "INSERT INTO BackboneAccessPoints(Name, Kind, InteriorSite) " +
                    "VALUES ('van', 'van', $1) RETURNING Id",
                [coloNamespaces[ns].site.id]
            );
            notify.add("BackboneAccessPoints", vanResult.rows[0].id);
        }

        //
        // Ensure Site CR is installed in the namespace (else apply it)
        //
        const sitecrs = await kube.GetSites(ns);
        if (sitecrs.length == 0) {
            const resources = [
                resourceTemplates.ServiceAccount(),
                resourceTemplates.BackboneRole(),
                resourceTemplates.RoleBinding(),
                resourceTemplates.Deployment(coloNamespaces[ns].site.id, true, "sk2"),
                resourceTemplates.BackboneSite(
                    coloNamespaces[ns].site.name,
                    coloNamespaces[ns].site.id
                ),
                resourceTemplates.NetworkCR("mbone"),
            ];
            for (const obj of resources) {
                await kube.ApplyObject(obj, ns);
            }
        }

        //
        // Ensure that if the site record is in READY or ACTIVE state, the site certificate is installed in namespace (else apply it)
        //
        if (["ready", "active"].includes(coloNamespaces[ns].site.lifecycle)) {
            await syncColoTlsSecret(
                client,
                ns,
                `vms-site-${coloNamespaces[ns].site.id}`,
                coloNamespaces[ns].site.certificate,
                common.INJECT_TYPE_SITE,
                false
            );
        }

        //
        // Ensure RouterAccess CR is installed in the namespace (else apply it)
        //
        const apName = "vms-colo-manage";
        const apSecretName = "vms-colo-manage";
        const ap = await kube.LoadRouterAccess(apName, ns);
        if (!ap) {
            const resource = resourceTemplates.RouterAccessColoManage(apName, apSecretName);
            await kube.ApplyObject(resource, ns);
        }

        //
        // Ensure accesspoint has host/port attributes matching the RouterAccess CR (else set accesspoint host/port and status to NEW)
        //
        if (
            !!ap &&
            ap.status?.endpoints?.length == 1 &&
            (ap.status.endpoints[0].host != coloNamespaces[ns].accesspoint.hostname ||
                ap.status.endpoints[0].port != coloNamespaces[ns].accesspoint.port)
        ) {
            const ep = ap.status.endpoints[0];
            const result = await client.query(
                "UPDATE BackboneAccessPoints SET hostname = $2, port = $3, lifecycle = $4 WHERE Id = $1 RETURNING *",
                [coloNamespaces[ns].accesspoint.id, ep.host, ep.port, "new"]
            );
            notify.update("BackboneAccessPoints", coloNamespaces[ns].accesspoint.id);
            coloNamespaces[ns].accesspoint = result.rows[0];
        }

        //
        // Ensure that if accesspoint is in READY state, the server certificate is installed in namespace (else apply it)
        //
        if (coloNamespaces[ns].accesspoint.lifecycle === "ready") {
            await syncColoTlsSecret(
                client,
                ns,
                apSecretName,
                coloNamespaces[ns].accesspoint.certificate,
                undefined,
                false
            );
        }

        await client.query("COMMIT");
        await notify.commit();
    } catch (error) {
        await client.query("ROLLBACK");
        if (undoSite) {
            coloNamespaces[ns].site = null;
        }
        if (undoAp) {
            coloNamespaces[ns].accesspoint = null;
        }
        Log(`Exception in doVisitNamespace(${ns}): ${error.stack}`);
    } finally {
        client.release();
    }
}

function tlsDataHash(data) {
    if (!data) {
        return "";
    }
    return resourceTemplates.HashOfData({
        "ca.crt": data["ca.crt"] || "",
        "tls.crt": data["tls.crt"] || "",
        "tls.key": data["tls.key"] || "",
    });
}

async function syncColoTlsSecret(client, ns, secretName, certId, inject, replaceIfChanged) {
    if (!certId) {
        return;
    }
    const cert = await client
        .query("SELECT objectname FROM TlsCertificates WHERE Id = $1", [certId])
        .then((res) => res.rows[0]);
    if (!cert?.objectname) {
        return;
    }
    const mcSecret = await kube.LoadSecret(cert.objectname);
    if (!mcSecret?.data) {
        return;
    }
    const data = await overlayDualTrustCa(client, certId, mcSecret.data);
    const tlsMeta = await getTlsRotationMeta(client, certId);
    const resource = resourceTemplates.Secret(
        { ...mcSecret, data },
        secretName,
        inject,
        undefined,
        tlsMeta
    );
    const coloSecret = await kube.LoadSecret(secretName, ns);
    if (!coloSecret) {
        await kube.ApplyObject(resource, ns);
        return;
    }
    if (!replaceIfChanged) {
        return;
    }
    if (tlsDataHash(coloSecret.data) === tlsDataHash(resource.data)) {
        return;
    }
    resource.metadata.resourceVersion = coloSecret.metadata.resourceVersion;
    await kube.ReplaceSecret(secretName, resource, ns);
}

export async function SyncColoTlsCertificate(certId) {
    if (!certId) {
        return;
    }
    const client = await ClientFromPool("system");
    try {
        const siteResult = await client.query(
            "SELECT Id FROM InteriorSites WHERE CoLocated = true AND Certificate = $1",
            [certId]
        );
        if (siteResult.rowCount == 1) {
            const siteId = siteResult.rows[0].id;
            const ns = siteIndex[siteId];
            if (ns && coloNamespaces[ns]?.site) {
                await syncColoTlsSecret(
                    client,
                    ns,
                    `vms-site-${siteId}`,
                    certId,
                    common.INJECT_TYPE_SITE,
                    true
                );
            }
            return;
        }

        const apResult = await client.query(
            "SELECT ap.Id FROM BackboneAccessPoints ap " +
                "JOIN InteriorSites s ON s.Id = ap.InteriorSite " +
                "WHERE s.CoLocated = true AND ap.Kind = 'manage' AND ap.Certificate = $1",
            [certId]
        );
        if (apResult.rowCount == 1) {
            const apId = apResult.rows[0].id;
            const ns = apIndex[apId];
            if (ns && coloNamespaces[ns]?.accesspoint) {
                await syncColoTlsSecret(client, ns, "vms-colo-manage", certId, undefined, true);
            }
        }
    } catch (error) {
        Log(`Exception in SyncColoTlsCertificate: ${error.stack}`);
    } finally {
        client.release();
    }
}
