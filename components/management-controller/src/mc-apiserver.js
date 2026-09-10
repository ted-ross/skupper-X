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

import express from "express";
import session from "express-session";
import path from "node:path";
import fs from "node:fs";
import morgan from "morgan";
import cors from "cors";
import formidable from "formidable";
import yaml from "js-yaml";
import bodyParser from "body-parser";
import { X509Certificate } from "node:crypto";
import httpProxy from "http-proxy";
import { ClientFromPool, queryWithContext } from "./db.js";
import * as resourceTemplates from "./resource-templates.js";
import { LoadSecret } from "@vms/modules/kube";
import { Log } from "@vms/modules/log";
import * as sync from "./sync-management.js";
import * as adminApi from "./api-admin.js";
import * as userApi from "./api-user.js";
import * as util from "@vms/modules/util";
import * as common from "@vms/modules/common";
import { StartWatchServer } from "./watch-server.js";
import ViteExpress from "vite-express";
import { createManagementOidcAuth } from "./auth/management-oidc.js";
import { NotifyTransaction, RegisterNotification } from "./notify.js";
import { RotateCertificate } from "./certs.js";
import { getTlsRotationMeta, overlayDualTrustCa } from "./tls-rotation.js";

const __dirname = import.meta.dirname;
/** Deployed image: sources live in `/app/src`, console bundle in `/app/console/dist`. Monorepo dev: `components/console` (two levels up from `components/management-controller/src`). */
const VITE_CONSOLE_ROOT = fs.existsSync(
    path.join(path.resolve(__dirname, "../console"), "dist", "index.html")
)
    ? path.resolve(__dirname, "../console")
    : path.resolve(__dirname, "../../console");

/** Path to skupper-console static files */
const SKUPPER_CONSOLE_ROOT = "/app/skupper-console";

const API_PREFIX = "/api/v1alpha1/";
const API_PORT = 8085;
const app = express();
const router = express.Router();
const memoryStore = new session.MemoryStore();
const sessionParser = session({
    secret: process.env.VMS_SESSION_SECRET || "mysecret",
    resave: false,
    saveUninitialized: true,
    store: memoryStore,
});

const vanProxy = {}; // { Id: { vanId, backboneName } }

app.use(sessionParser);

async function secretResourceForSync(client, certId, secret, profileName, inject, stateKey) {
    const data = await overlayDualTrustCa(client, certId, secret.data);
    const tlsMeta = await getTlsRotationMeta(client, certId);
    return resourceTemplates.Secret({ ...secret, data }, profileName, inject, stateKey, tlsMeta);
}

const link_config_map_yaml = function (name, data) {
    const configMap = {
        apiVersion: "v1",
        kind: "ConfigMap",
        metadata: {
            name: name,
            annotations: {},
        },
        data: data,
    };

    configMap.metadata.annotations[common.META_ANNOTATION_STATE_HASH] =
        resourceTemplates.HashOfConfigMap(configMap);
    return "---\n" + yaml.dump(configMap);
};

const fetchInvitationKube = async function (req, res) {
    const iid = req.params.iid;
    let returnStatus = 200;
    const client = await ClientFromPool();
    try {
        const text = await queryWithContext(req, client, async (client) => {
            const result = await client.query(
                "SELECT MemberInvitations.*, TlsCertificates.ObjectName as secret_name, ApplicationNetworks.VanId, " +
                    "BackboneAccessPoints.Id as accessid, BackboneAccessPoints.Hostname, BackboneAccessPoints.Port FROM MemberInvitations " +
                    "JOIN TlsCertificates ON MemberInvitations.Certificate = TlsCertificates.Id " +
                    "JOIN ApplicationNetworks ON MemberInvitations.MemberOf = ApplicationNetworks.Id " +
                    "JOIN BackboneAccessPoints ON MemberInvitations.ClaimAccess = BackboneAccessPoints.Id " +
                    "WHERE MemberInvitations.Id = $1 AND BackboneAccessPoints.Lifecycle = 'ready' AND MemberInvitations.Lifecycle = 'ready'",
                [iid]
            );
            if (result.rowCount == 1) {
                throw new Error("fetchInvitationKube not yet implemented");
            } else {
                throw new Error("Valid invitation not found");
            }
        });
        res.status(returnStatus).send(text);
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }

    return returnStatus;
};

const fetchBackboneSiteSkupper2 = async function (req, res) {
    const siteId = req.params.bsid;
    let returnStatus = 200;
    const client = await ClientFromPool();
    try {
        const text = await queryWithContext(req, client, async (client) => {
            const result = await client.query(
                "SELECT Name, DeploymentState, Certificate, TlsCertificates.ObjectName " +
                    "FROM   InteriorSites " +
                    "JOIN   TlsCertificates ON Certificate = TlsCertificates.Id " +
                    "WHERE  Interiorsites.Id = $1",
                [siteId]
            );

            if (result.rowCount != 1) {
                throw new Error("Site secret not found");
            }

            const site = result.rows[0];
            if (site.deploymentstate == "deployed") {
                throw new Error("Not permitted, site already deployed");
            }
            if (site.deploymentstate == "not-ready") {
                throw new Error("Not permitted, site not ready for deployment");
            }
            const secret = await LoadSecret(site.objectname);
            const output = [];
            output.push(resourceTemplates.ServiceAccount());
            output.push(resourceTemplates.BackboneRole());
            output.push(resourceTemplates.RoleBinding());
            output.push(resourceTemplates.Deployment(siteId, true, "sk2"));
            output.push(
                await secretResourceForSync(
                    client,
                    site.certificate,
                    secret,
                    `vms-site-${siteId}`,
                    common.INJECT_TYPE_SITE,
                    `tls-site-${siteId}`
                )
            );

            const links = await sync.GetBackboneLinks_TX(client, siteId);
            for (const [linkId, linkData] of Object.entries(links)) {
                output.push(resourceTemplates.LinkCR(linkId, linkData, `vms-site-${siteId}`));
            }

            if (site.deploymentstate == "ready-bootstrap") {
                const accessPoints = await sync.GetBackboneAccessPoints_TX(client, siteId, true);
                for (const [apId, apData] of Object.entries(accessPoints)) {
                    output.push(resourceTemplates.AccessPointCR(apId, apData));
                }
            }

            output.push(resourceTemplates.BackboneSite(site.name, siteId));
            output.push(resourceTemplates.NetworkCR("mbone"));

            return util.ToYaml(output);
        });

        res.status(returnStatus).send(text);
    } catch (err) {
        returnStatus = 400;
        console.log(err.stack);
        res.status(returnStatus).send(err.message);
    } finally {
        client.release();
    }

    return returnStatus;
};

const fetchBackboneAccessPointsKube = async function (req, res) {
    const bsid = req.params.bsid;
    let returnStatus = 200;
    const client = await ClientFromPool();
    try {
        const text = await queryWithContext(req, client, async (client) => {
            const result = await client.query(
                "SELECT DeploymentState FROM InteriorSites WHERE Id = $1",
                [bsid]
            );
            if (result.rowCount !== 1) {
                throw new Error("Site not found");
            }

            const site = result.rows[0];

            if (site.deploymentstate != "ready-bootfinish") {
                throw new Error("Not permitted, site not ready for bootstrap deployment");
            }

            const output = [];
            const ap_result = await client.query(
                "SELECT TlsCertificates.Id as certid, TlsCertificates.ObjectName, BackboneAccessPoints.Id as apid, Lifecycle, Kind FROM BackboneAccessPoints " +
                    "JOIN TlsCertificates ON TlsCertificates.Id = Certificate " +
                    "WHERE BackboneAccessPoints.InteriorSite = $1",
                [bsid]
            );
            for (const ap of ap_result.rows) {
                if (ap.lifecycle != "ready") {
                    throw new Error(
                        `Certificate for access point of kind ${ap.kind} is not yet ready`
                    );
                }
                const secret = await LoadSecret(ap.objectname);
                output.push(
                    await secretResourceForSync(
                        client,
                        ap.certid,
                        secret,
                        `vms-access-${ap.apid}`,
                        common.INJECT_TYPE_ACCESS_POINT,
                        `tls-server-${ap.apid}`
                    )
                );
            }

            return util.ToYaml(output);
        });
        res.status(returnStatus).send(text);
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }

    return returnStatus;
};

const fetchBackboneLinksOutgoingKube = async function (req, res) {
    const bsid = req.params.bsid;
    let returnStatus = 200;
    const client = await ClientFromPool();
    try {
        const outgoing = await queryWithContext(req, client, async (client) => {
            return await sync.GetBackboneLinks_TX(client, bsid);
        });
        res.status(returnStatus).send(link_config_map_yaml("vms-outgoing", outgoing));
    } catch (err) {
        returnStatus = 400;
        res.status(returnStatus).send(err.message);
    } finally {
        client.release();
    }

    return returnStatus;
};

const getVanConfigConnecting = async function (req, res) {
    const vid = req.params.vid;
    const apid = req.params.apid;
    const exposeNetworkObserverConsole = req.query["expose-console"] === "true";
    let returnStatus = 200;
    const client = await ClientFromPool();
    try {
        const { result, apResult } = await queryWithContext(req, client, async (client) => {
            const result = await client.query(
                "SELECT VanId, ObjectName, TlsCertificates.Id AS certificate FROM ApplicationNetworks " +
                    "JOIN NetworkCredentials ON NetworkCredentials.MemberOf = ApplicationNetworks.Id " +
                    "JOIN TlsCertificates ON TlsCertificates.Id = NetworkCredentials.Certificate " +
                    "WHERE ApplicationNetworks.Id = $1",
                [vid]
            );
            const apResult = await client.query(
                "SELECT hostname, port FROM BackboneAccessPoints " + "WHERE Id = $1",
                [apid]
            );
            return { result, apResult };
        });
        if (result.rowCount == 0 || apResult.rowCount == 0) {
            returnStatus = 404;
            res.status(returnStatus).send("Network or Access Point not found");
        } else {
            const van = result.rows[0];
            const ap = apResult.rows[0];
            const secret = await LoadSecret(van.objectname);
            const data = await overlayDualTrustCa(client, van.certificate, secret.data);
            const tlsMeta = await getTlsRotationMeta(client, van.certificate);
            const output = [
                resourceTemplates.NetworkCR(van.vanid),
                resourceTemplates.NetworkLinkCR(ap.hostname, ap.port, van.objectname),
                resourceTemplates.Secret(
                    { ...secret, data },
                    van.objectname,
                    undefined,
                    undefined,
                    tlsMeta
                ),
            ];
            if (exposeNetworkObserverConsole) {
                const routingKey = `skupper-console-${van.vanid}`;
                output.push(
                    resourceTemplates.ConnectorCR(
                        "skupper-console",
                        8443,
                        routingKey,
                        "app.kubernetes.io/name=network-observer",
                        "skupper-network-observer-client"
                    ),
                    resourceTemplates.InterNetworkIngressCR(
                        "skupper-console",
                        routingKey,
                        "management-link"
                    )
                );
            }
            res.status(returnStatus).send(util.ToYaml(output));
        }
    } catch (err) {
        returnStatus = 400;
        res.status(returnStatus).send(err.stack);
    } finally {
        client.release();
    }

    return returnStatus;
};

const getVanConfigNonConnecting = async function (req, res) {
    const vid = req.params.vid;
    let returnStatus = 200;
    const client = await ClientFromPool();
    try {
        const result = await queryWithContext(req, client, async (client) => {
            const result = await client.query(
                "SELECT VanId FROM ApplicationNetworks WHERE id = $1",
                [vid]
            );
            if (result.rowCount == 0) {
                return { status: 404, text: "Network not found" };
            } else {
                const van = result.rows[0];
                const text = util.ToYaml(resourceTemplates.NetworkCR(van.vanid));
                return { status: returnStatus, text: text };
            }
        });
        res.status(result.status).send(result.text);
    } catch (err) {
        returnStatus = 400;
        res.status(returnStatus).send(err.message);
    } finally {
        client.release();
    }

    return returnStatus;
};

const getCertsSignedBy = async function (req, res) {
    let returnStatus = 200;
    const client = await ClientFromPool();
    try {
        const ca = req.query.signedby;
        if (ca && !util.IsValidUuid(ca)) {
            throw new Error(`Malformed signedby reference: ${ca}`);
        }
        const result = await queryWithContext(req, client, async (client) => {
            if (ca) {
                const ca_result = await client.query(
                    "SELECT isca FROM tlsCertificates WHERE id = $1",
                    [ca]
                );
                if (ca_result.rowCount == 0 || !ca_result.rows[0].isca) {
                    throw new Error(`signedby certificate is not an issuer`);
                }
                return await client.query(
                    "SELECT t.*, EXISTS(SELECT 1 FROM TlsCertificates s WHERE s.Supercedes = t.Id) AS superseded " +
                        "FROM tlsCertificates t WHERE signedBy = $1",
                    [ca]
                );
            }
            return await client.query(
                "SELECT t.*, EXISTS(SELECT 1 FROM TlsCertificates s WHERE s.Supercedes = t.Id) AS superseded " +
                    "FROM tlsCertificates t WHERE signedBy IS NULL"
            );
        });
        res._watch = [{ table: "TlsCertificates" }];
        res.status(returnStatus).json(result.rows);
    } catch (err) {
        returnStatus = 400;
        res.status(returnStatus).send(err.message);
    } finally {
        client.release();
    }
};

const getCertDetail = async function (req, res) {
    const cid = req.params.cid;
    let returnStatus = 200;
    const client = await ClientFromPool();
    try {
        if (!util.IsValidUuid(cid)) {
            throw new Error(`Malformed certificate ID: ${cid}`);
        }

        const result = await queryWithContext(req, client, async (client) => {
            return await client.query(
                "SELECT objectname, label, isca FROM tlsCertificates WHERE id = $1",
                [cid]
            );
        });

        if (result.rowCount == 0) {
            throw new Error("Not Found");
        }
        const cert = result.rows[0];
        const secret = await LoadSecret(cert.objectname);
        const buffer = Buffer.from(secret.data["tls.crt"], "base64");
        const x509 = new X509Certificate(buffer.toString("utf-8"));
        const data = {
            label: cert.label,
            isca: cert.isca,
            x509: {
                subject: x509.subject,
                issuer: x509.issuer,
                validFrom: x509.validFrom,
                validTo: x509.validTo,
                serialNumber: x509.serialNumber,
                fingerprint: x509.fingerprint,
            },
        };
        res.status(returnStatus).json(data);
    } catch (err) {
        returnStatus = 400;
        res.status(returnStatus).send(err.message);
    } finally {
        client.release();
    }
};

const rotateCert = async function (req, res) {
    try {
        if (!util.IsValidUuid(req.params.cid)) {
            throw Object.assign(new Error(`Malformed certificate ID: ${req.params.cid}`), {
                statusCode: 400,
            });
        }
        const cert = await RotateCertificate(req.params.cid);
        res.status(202).json(cert);
    } catch (err) {
        const returnStatus = err.statusCode || 400;
        res.status(returnStatus).send(err.message);
    }
};

export async function AddHostToAccessPoint(req, siteId, apid, hostname, port) {
    let retval = 1;
    const client = await ClientFromPool();
    const notify = new NotifyTransaction();
    try {
        await queryWithContext(req, client, async (client) => {
            const result = await client.query(
                `SELECT Id, Lifecycle, Hostname, Port, Kind FROM BackboneAccessPoints WHERE Id = $1 AND InteriorSite = $2`,
                [apid, siteId]
            );
            if (result.rowCount == 1) {
                const access = result.rows[0];
                if (access.hostname != hostname || access.port != port) {
                    if (access.hostname) {
                        throw new Error(
                            `Referenced access (${access.access_ref}) already has a hostname`
                        );
                    }
                    if (access.lifecycle != "partial") {
                        throw new Error(
                            `Referenced access (${access.access_ref}) has lifecycle ${access.lifecycle}, expected partial`
                        );
                    }
                    await client.query(
                        "UPDATE BackboneAccessPoints SET Hostname = $1, Port=$2, Lifecycle='new' WHERE Id = $3",
                        [hostname, port, apid]
                    );
                    notify.update("BackboneAccessPoints", apid);
                }
            } else {
                throw new Error(`Access point not found for site ${siteId} (${apid})`);
            }
        });
        await notify.commit();
    } catch (err) {
        Log(`Host add to AccessPoint failed: ${err.message}`);
        retval = 0;
    } finally {
        client.release();
    }
    return retval;
}

const postBackboneIngress = async function (bsid, req, res) {
    let returnStatus = 201;
    const form = formidable();
    try {
        let count = 0;
        const [fields] = await form.parse(req);
        for (const [apid, apdata] of Object.entries(fields)) {
            if (!util.IsValidUuid(apid)) {
                throw new Error(`Invalid access-point identifier ${apid}`);
            }
            const norm = util.ValidateAndNormalizeFields(apdata, {
                host: { type: "string", optional: false },
                port: { type: "number", optional: false },
            });

            count += await AddHostToAccessPoint(req, bsid, apid, norm.host, norm.port);
        }

        if (count == 0) {
            throw new Error("No valid ingress records posted");
        }

        res.status(returnStatus).json({ processed: count });
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    }

    return returnStatus;
};

const getTargetPlatforms = async function (req, res) {
    let returnStatus = 200;
    const client = await ClientFromPool();
    try {
        const result = await queryWithContext(req, client, async (client) => {
            return await client.query("SELECT ShortName, LongName FROM TargetPlatforms");
        });
        res.status(returnStatus).json(result.rows);
    } catch (err) {
        returnStatus = 400;
        res.status(returnStatus).send(err.message);
    } finally {
        client.release();
    }

    return returnStatus;
};

const getUserProfile = async function (req, res) {
    let returnStatus = 200;
    try {
        const userCredentials = req?.kauth?.grant?.access_token?.content;
        const user = userCredentials?.given_name + " " + userCredentials?.family_name;
        res.status(returnStatus).json({ name: user });
    } catch (err) {
        returnStatus = 401;
        Log(`Error retrieving user profile: ${err.message}`);
        res.status(returnStatus).send(err.message);
    }
    return returnStatus;
};

const getUserGroups = async function (req, res) {
    let returnStatus = 200;
    try {
        const userCredentials = req?.kauth?.grant?.access_token?.content;
        const groups = Array.isArray(userCredentials?.clientGroups)
            ? userCredentials.clientGroups.map((group) => ({ id: group, name: group }))
            : [];
        res.status(returnStatus).json(groups);
    } catch (err) {
        returnStatus = 401;
        Log(`Error retrieving user groups: ${err.message}`);
        res.status(returnStatus).send(err.message);
    }
    return returnStatus;
};

export async function Initialize(router, auth) {
    router.get(
        API_PREFIX + "invitations/:iid/kube",
        auth.protect("realm:van-owner"),
        async (req, res) => {
            await fetchInvitationKube(req, res);
        }
    );

    router.get(
        API_PREFIX + "backbonesite/:bsid/:target",
        auth.protect("realm:backbone-owner"),
        async (req, res) => {
            switch (req.params.target) {
                case "sk2":
                    await fetchBackboneSiteSkupper2(req, res);
                    break;
                default:
                    res.status(400).send(`Unsupported target: ${req.params.target}`);
            }
        }
    );

    router.get(
        API_PREFIX + "backbonesite/:bsid/accesspoints/:target",
        auth.protect("realm:backbone-owner"),
        async (req, res) => {
            switch (req.params.target) {
                case "sk2":
                case "kube":
                case "m-server":
                    await fetchBackboneAccessPointsKube(req, res);
                    break;
                default:
                    res.status(400).send(`Unsupported target: ${req.params.target}`);
            }
        }
    );

    router.get(
        API_PREFIX + "backbonesite/:bsid/links/outgoing/kube",
        auth.protect("realm:backbone-owner"),
        async (req, res) => {
            await fetchBackboneLinksOutgoingKube(req, res);
        }
    );

    router.post(
        API_PREFIX + "backbonesite/:bsid/ingress",
        auth.protect("realm:backbone-owner"),
        async (req, res) => {
            await postBackboneIngress(req.params.bsid, req, res);
        }
    );

    router.get(
        API_PREFIX + "targetplatforms",
        auth.protect("realm:backbone-owner"),
        async (req, res) => {
            await getTargetPlatforms(req, res);
        }
    );

    router.get(
        API_PREFIX + "vans/:vid/config/connecting/:apid",
        auth.protect("realm:van-owner"),
        async (req, res) => {
            await getVanConfigConnecting(req, res);
        }
    );

    router.get(
        API_PREFIX + "vans/:vid/config/nonconnecting",
        auth.protect("realm:van-owner"),
        async (req, res) => {
            await getVanConfigNonConnecting(req, res);
        }
    );

    router.get(
        API_PREFIX + "certs",
        auth.protect("realm:certificate-manager"),
        async (req, res) => {
            await getCertsSignedBy(req, res);
        }
    );

    router.get(
        API_PREFIX + "certs/:cid",
        auth.protect("realm:certificate-manager"),
        async (req, res) => {
            await getCertDetail(req, res);
        }
    );

    router.post(
        API_PREFIX + "certs/:cid/rotate",
        auth.protect("realm:certificate-manager"),
        async (req, res) => {
            await rotateCert(req, res);
        }
    );

    router.get(API_PREFIX + "user/profile", auth.protect(), async (req, res) => {
        await getUserProfile(req, res);
    });

    router.get(API_PREFIX + "user/groups", auth.protect(), async (req, res) => {
        await getUserGroups(req, res);
    });
}

export async function Start(_is_standalone) {
    Log("[API Server module started]");
    /**
     * When NODE_ENV is set to "production", the static build files will be served (this can be done with a deployment or in standalone mode)
     * When NODE_ENV is anything other than "production", the Vite development server will start and serve live updates to the browser using hmr over websockets
     */
    ViteExpress.config({
        viteConfigFile: path.join(VITE_CONSOLE_ROOT, "vite.config.js"),
        inlineViteConfig: {
            root: VITE_CONSOLE_ROOT,
            base: "/",
            build: { outDir: "dist" },
        },
        ignorePaths: (pathname) => pathname.startsWith("/api") || pathname.startsWith("/auth"),
    });
    app.set("trust proxy", true);

    const auth = await createManagementOidcAuth();

    router.use(cors());
    auth.registerOidcRoutes(router);
    router.use(auth.middleware);

    router.get("/", auth.protect());

    morgan.token("ts", (_req, _res) => {
        return new Date().toISOString();
    });

    router.use(
        morgan(
            ":ts :remote-addr :remote-user :method :url :status :res[content-length] :response-time ms",
            {
                skip: function (req, _res) {
                    return !!req._skip_log;
                },
            }
        )
    );

    await Initialize(router, auth);

    router.use(bodyParser.text({ type: ["application/yaml"] }));

    adminApi.Initialize(router, auth);
    userApi.Initialize(router, auth);

    // Proxy requests to the target collector API
    const proxy = httpProxy.createProxyServer({
        selfHandleResponse: false,
    });
    proxy.on("error", (err, req, res) => {
        Log(`Proxy error: ${err.message}`);
        res.status(500).send(err.message);
    });
    router.all("/console/:vid*/api/v2alpha1*", auth.protect(), (req, res) => {
        const vid = req.params.vid;
        if (!vanProxy[vid]) {
            return res.status(404).send(`Van ${vid} not found`);
        }
        const targetVan = vanProxy[vid];
        const targetUrl = `http://skupper-console-${targetVan.vanId}.colo-${targetVan.backboneName}:8080`;
        Log(`Proxying ${req.url} to ${targetUrl}`);
        req.url = req.url.slice(`/console/${vid}`.length);
        proxy.web(req, res, {
            target: targetUrl,
            changeOrigin: true,
        });
    });

    // Serve skupper-console static files under /console/:vanId
    router.use("/console/:vanId*", auth.protect(), (req, res, next) => {
        const vid = req.params.vanId;
        if (!vanProxy[vid]) {
            return res.status(404).send(`Van ${vid} not found`);
        }

        // Serve static files from skupper-console build directory
        express.static(SKUPPER_CONSOLE_ROOT, {
            index: "index.html",
            fallthrough: true,
        })(req, res, (err) => {
            if (err) {
                return next(err);
            }
            // If no static file matched, serve index.html for SPA routing
            if (!res.headersSent) {
                res.sendFile(path.join(SKUPPER_CONSOLE_ROOT, "index.html"));
            }
        });
    });

    // route any unauthenticated requests to the login page (catches SPA navigation requests)
    router.get("*", auth.protect());

    const server = app.listen(API_PORT, () => {
        let host = server.address().address;
        const port = server.address().port;
        if (host[0] == ":") {
            host = "[" + host + "]";
        }
        Log(`API Server listening on http://${host}:${port}`);
    });

    app.use(router);
    await ViteExpress.bind(app, server);

    await StartWatchServer(server, sessionParser, app, router);
    RegisterNotification("ApplicationNetworks", onApplicationNetworks, true);
}

async function onApplicationNetworks(event, id) {
    if (!id) {
        return;
    }
    if (event == "DELETE") {
        delete vanProxy[id];
        return;
    }
    const client = await ClientFromPool("system");
    try {
        // Retrieve VanId and Backbone Name
        const result = await client.query(
            "SELECT A.VanId, B.Name FROM ApplicationNetworks A JOIN Backbones B ON A.Backbone = B.Id WHERE A.Id = $1",
            [id]
        );
        if (result.rowCount == 1) {
            const vanId = result.rows[0].vanid;
            const backboneName = result.rows[0].name;
            vanProxy[id] = {
                vanId: vanId,
                backboneName: backboneName,
            };
        }
    } catch (err) {
        Log(
            `Error retrieving VanId and Backbone Name for ApplicationNetwork ${id}: ${err.message}`
        );
    } finally {
        client.release();
    }
}
