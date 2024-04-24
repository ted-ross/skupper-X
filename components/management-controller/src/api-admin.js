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

const formidable = require('formidable');
const db         = require('./db.js');
const sync       = require('./manage-sync.js');
const Log        = require('./common/log.js').Log;
const deployment = require('./site-deployment-state.js');
const util       = require('./common/util.js');

const API_PREFIX   = '/api/v1alpha2/';
const INGRESS_LIST = ['claim', 'peer', 'member', 'manage'];

const createBackbone = async function(req, res) {
    var returnStatus;
    const form = new formidable.IncomingForm();
    try {
        const [fields, files] = await form.parse(req);
        const norm = util.ValidateAndNormalizeFields(fields, {
            'name'        : {type: 'string', optional: false},
            'multitenant' : {type: 'bool',   optional: true, default: true},
        });

        const client = await db.ClientFromPool();
        try {
            await client.query("BEGIN");
            const result = await client.query("INSERT INTO Backbones(Name, LifeCycle, MultiTenant) VALUES ($1, 'partial', $2) RETURNING Id", [norm.name, norm.multitenant]);
            await client.query("COMMIT");

            returnStatus = 201;
            res.status(returnStatus).json({id: result.rows[0].id});
        } catch (error) {
            await client.query("ROLLBACK");
            returnStatus = 500;
            res.status(returnStatus).send(error.message);
        } finally {
            client.release();
        }
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    }

    return returnStatus;
}

const createBackboneSite = async function(bid, req, res) {
    var returnStatus;
    const form = new formidable.IncomingForm();
    try {
        if (!util.IsValidUuid(bid)) {
            throw(Error('Backbone-Id is not a valid uuid'));
        }

        const [fields, files] = await form.parse(req)
        const norm = util.ValidateAndNormalizeFields(fields, {
            'name'     : {type: 'string', optional: false},
            'metadata' : {type: 'string', optional: true, default: null},
        });

        const client = await db.ClientFromPool();
        try {
            await client.query("BEGIN");
            var extraCols = "";
            var extraVals = "";

            //
            // Handle the optional metadata
            //
            if (norm.metadata) {
                extraCols += ', Metadata';
                extraVals += `, '${norm.metadata}'`;
            }

            //
            // Create the site
            //
            const result = await client.query(`INSERT INTO InteriorSites(Name, Backbone${extraCols}) VALUES ($1, $2${extraVals}) RETURNING Id`, [norm.name, bid]);
            const siteId = result.rows[0].id;
            await client.query("COMMIT");

            returnStatus = 201;
            res.status(returnStatus).json({id: siteId});
        } catch (error) {
            await client.query("ROLLBACK");
            returnStatus = 500
            res.status(returnStatus).send(error.message);
        } finally {
            client.release();
        }
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).json({ message: error.message });
    }

    return returnStatus;
}

const updateBackboneSite = async function(sid, req, res) {
    var returnStatus = 200;
    const form = new formidable.IncomingForm();
    try {
        if (!util.IsValidUuid(sid)) {
            throw(Error('Site-Id is not a valid uuid'));
        }

        const [fields, files] = await form.parse(req);
        const norm = util.ValidateAndNormalizeFields(fields, {
            'name'     : {type: 'string', optional: true, default: null},
            'metadata' : {type: 'string', optional: true, default: null},
        });
    
        const client = await db.ClientFromPool();
        try {
            await client.query("BEGIN");
            let nameChanged   = false;
            const siteResult = await client.query("SELECT * FROM InteriorSites WHERE Id = $1", [sid]);
            if (siteResult.rowCount == 1) {
                const site = siteResult.rows[0];
                var   siteName = site.name;

                //
                // If the name has been changed, update the site record in the database
                //
                if (norm.name != null && norm.name != site.name) {
                    nameChanged = true;
                    await client.query("UPDATE InteriorSites SET Name = $1 WHERE Id = $2", [norm.name, sid]);
                    siteName = norm.name;
                }

                //
                // Update the metadata if needed
                //
                if (norm.metadata != null && norm.metadata != site.metadata) {
                    await client.query("UPDATE InteriorSites SET Metadata = $1 WHERE Id = $2", [norm.metadata, sid]);
                }
            }
            await client.query("COMMIT");

            res.status(returnStatus).end();
        } catch (error) {
            await client.query("ROLLBACK");
            returnStatus = 500;
            res.status(returnStatus).send(error.message);
        } finally {
            client.release();
        }
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).json({ message: error.message });
    }

    return returnStatus;
}

const createAccessPoint = async function(sid, req, res) {
    var returnStatus;
    const form = new formidable.IncomingForm();
    try {
        if (!util.IsValidUuid(sid)) {
            throw(Error('Site-Id is not a valid uuid'));
        }

        const [fields, files] = await form.parse(req)
        const norm = util.ValidateAndNormalizeFields(fields, {
            'name'     : {type: 'string',     optional: true, default: null},
            'kind'     : {type: 'accesskind', optional: false},
            'bindhost' : {type: 'dnsname',    optional: true, default: null},
        });

        const client = await db.ClientFromPool();
        try {
            await client.query("BEGIN");

            const siteResult = await client.query("SELECT Name from InteriorSites WHERE Id = $1", [sid]);
            if (siteResult.rowCount == 0) {
                throw(Error(`Referenced interior site not found: ${sid}`));
            }

            var extraCols = "";
            var extraVals = "";
            const name = norm.name || siteResult.rows[0].name + "-" + norm.kind;

            // TODO - If name will collide with another access point on the same site, add a differentiation number to the end

            //
            // Handle the optional bind host
            //
            if (norm.bindhost) {
                extraCols += ', BindHost';
                extraVals += `, '${norm.bindhost}'`;
            }

            //
            // Create the access point
            //
            const result = await client.query(`INSERT INTO BackboneAccessPoints(Name, Kind, InteriorSite${extraCols}) VALUES ($1, $2, $3${extraVals}) RETURNING Id`, [name, norm.kind, sid]);
            const apId = result.rows[0].id;
            await client.query("COMMIT");

            returnStatus = 201;
            res.status(returnStatus).json({id: apId});

            //
            // Alert the sync module that an access point changed on a site
            //
            await sync.SiteIngressChanged(sid);

            //
            // Alert the deployment-state module if a change was made to the "manage" access
            //
            if (norm.kind == 'manage') {
                await deployment.ManageIngressAdded(sid);
            }
        } catch (error) {
            await client.query("ROLLBACK");
            returnStatus = 500
            res.status(returnStatus).send(error.message);
        } finally {
            client.release();
        }
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).json({ message: error.message });
    }

    return returnStatus;
}

const createBackboneLink = async function(bid, req, res) {
    var returnStatus;
    const form = new formidable.IncomingForm();
    try {
        if (!util.IsValidUuid(bid)) {
            throw(Error('Backbone-Id is not a valid uuid'));
        }

        const [fields, files] = await form.parse(req);
        const norm = util.ValidateAndNormalizeFields(fields, {
            'accesspoint'    : {type: 'uuid',   optional: false},
            'connectingsite' : {type: 'uuid',   optional: false},
            'cost'           : {type: 'number', optional: true, default: 1},
        });

        const client = await db.ClientFromPool();
        try {
            await client.query("BEGIN");

            //
            // Get the referenced access point for validation
            //
            const accessResult = await client.query("SELECT Kind, InteriorSite, InteriorSites.Id as siteId, InteriorSites.Backbone FROM BackboneAccessPoints " +
                                                    "JOIN InteriorSites ON InteriorSites.Id = InteriorSite " +
                                                    "WHERE BackboneAccessPoints.Id = $1", [norm.accesspoint]);

            //
            // Validate that the referenced access point exists
            //
            if (accessResult.rowCount == 0) {
                throw(Error(`Referenced access point not found: ${norm.accesspoint}`));
            }
            const accessPoint = accessResult.rows[0];

            //
            // Validate that the referenced access point is for a site in the correct backbone
            //
            if (accessPoint.backbone != bid) {
                throw(Error(`Referenced access point is not in the expected backbone`));
            }

            //
            // Validate that the referenced access point is of kind 'peer'
            //
            if (accessPoint.kind != 'peer') {
                throw(Error(`Referenced access point must be 'peer', found '${accessPoint.kind}'`));
            }

            //
            // Validate that the referenced site is in the specified backbone network
            //
            const siteResult = await client.query("SELECT Backbone FROM InteriorSites WHERE Id = $1", [norm.connectingsite]);
            if (siteResult.rowCount == 0) {
                throw(Error(`Referenced connecting site not found: ${norm.connectingsite}`));
            }

            if (siteResult.rows[0].backbone != bid) {
                throw(Error(`Referenced connecting site is not in the expected backbone`));
            }

            //
            // Create the new link
            //
            const linkResult = await client.query("INSERT INTO InterRouterLinks(AccessPoint, ConnectingInteriorSite, Cost) VALUES ($1, $2, $3) RETURNING Id", [norm.accesspoint, norm.connectingsite, norm.cost]);
            const linkId = linkResult.rows[0].id;

            await client.query("COMMIT");
            returnStatus = 201;
            res.status(returnStatus).json({id: linkId});

            //
            // Alert the sync and deployment-state modules that a new backbone link was added for the connecting site
            //
            try {
                await deployment.LinkAddedOrDeleted(norm.connectingsite, accessPoint.siteId);
                await sync.LinkChanged(norm.connectingsite);
            } catch (error) {
                Log(`Exception createBackboneLink module notifications: ${error.message}`);
                Log(error.stack);
            }
        } catch (error) {
            await client.query("ROLLBACK");
            returnStatus = 400;
            res.status(returnStatus).send(error.message);
        } finally {
            client.release();
        }
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    }

    return returnStatus;
}

const updateBackboneLink = async function(lid, req, res) {
    var returnStatus = 204;
    const form = new formidable.IncomingForm();
    try {
        if (!util.IsValidUuid(lid)) {
            throw(Error('Link-Id is not a valid uuid'));
        }

        const [fields, files] = await form.parse(req);
        const norm = util.ValidateAndNormalizeFields(fields, {
            'cost' : {type: 'number', optional: true, default: null},
        });

        const client = await db.ClientFromPool();
        try {
            var linkChanged = null;
            await client.query("BEGIN");
            const linkResult = await client.query("SELECT * FROM InterRouterLinks WHERE Id = $1", [lid]);
            if (linkResult.rowCount == 1) {
                const link = linkResult.rows[0];

                //
                // If the cost has been changed, update the link record in the database
                //
                if (norm.cost != null && norm.cost != link.cost) {
                    await client.query("UPDATE InterRouterLinks SET Cost = $1 WHERE Id = $2", [norm.cost, lid]);
                    returnStatus = 200;
                    linkChanged = link.connectinginteriorsite;
                }
            }
            await client.query("COMMIT");
            res.status(returnStatus).end();

            //
            // Alert the sync module that a backbone link was modified for the connecting site
            //
            if (linkChanged) {
                await sync.LinkChanged(linkChanged);
            }
        } catch (error) {
            await client.query("ROLLBACK");
            returnStatus = 500;
            res.status(returnStatus).send(error.message);
        } finally {
            client.release();
        }
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).json({ message: error.message });
    }

    return returnStatus;
}

const activateBackbone = async function(res, bid) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        if (!util.IsValidUuid(bid)) {
            throw(Error('Backbone-Id is not a valid uuid'));
        }

        await client.query("UPDATE Backbones SET Lifecycle = 'new' WHERE Id = $1 and LifeCycle = 'partial'", [bid]);
        await client.query("COMMIT");
        res.status(returnStatus).end();
    } catch (error) {
        await client.query("ROLLBACK");
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }

    return returnStatus;
}

const deleteBackbone = async function(res, bid) {
    var returnStatus = 204;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        if (!util.IsValidUuid(bid)) {
            throw(Error('Backbone-Id is not a valid uuid'));
        }

        const vanResult = await client.query("SELECT Id FROM ApplicationNetworks WHERE Backbone = $1 and LifeCycle = 'ready' LIMIT 1", [bid]);
        if (vanResult.rowCount > 0) {
            throw(Error('Cannot delete a backbone with active application networks'));
        }
        const siteResult = await client.query("SELECT Id FROM InteriorSites WHERE Backbone = $1 LIMIT 1", [bid]);
        if (siteResult.rowCount > 0) {
            throw(Error('Cannot delete a backbone with interior sites'));
        }
        const bbResult = await client.query("DELETE FROM Backbones WHERE Id = $1 RETURNING Certificate", [bid]);
        if (bbResult.rowCount == 1) {
            const row = bbResult.rows[0];
            if (row.certificate) {
                await client.query("DELETE FROM TlsCertificates WHERE Id = $1", [row.certificate]);
            }
        }
        await client.query("COMMIT");

        res.status(returnStatus).end();
    } catch (error) {
        await client.query("ROLLBACK");
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }

    return returnStatus;
}

const deleteBackboneSite = async function(res, sid) {
    var returnStatus = 204;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        if (!util.IsValidUuid(sid)) {
            throw(Error('Site-Id is not a valid uuid'));
        }

        const result = await client.query("SELECT ClaimAccess, PeerAccess, MemberAccess, ManageAccess, Certificate from InteriorSites WHERE Id = $1", [sid]);
        if (result.rowCount == 1) {
            const row = result.rows[0];

            //
            // Delete all of the site's access points
            //
            for (const ingress of INGRESS_LIST) {
                const colName = `${ingress}access`;
                if (row[colName]) {
                    const apResult = await client.query("DELETE FROM BackboneAccessPoints WHERE Id = $1 Returning Certificate", [row[colName]]);
                    if (apResult.rowCount == 1) {
                        const row = apResult.rows[0];
                        if (row.certificate) {
                            await client.query("DELETE FROM TlsCertificates WHERE Id = $1", [row.certificate]);
                        }
                    }
                }
            }

            //
            // Delete the site.  Note that involved inter-router links will be automatically deleted by the database.
            //
            await client.query("DELETE FROM InteriorSites WHERE Id = $1", [sid]);

            //
            // Delete the TLS certificate
            //
            if (row.certificate) {
                await client.query("DELETE FROM TlsCertificates WHERE Id = $1", [row.certificate])
            }
        }
        await client.query("COMMIT");

        res.status(returnStatus).end();
    } catch (error) {
        await client.query("ROLLBACK");
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }

    return returnStatus;
}

const deleteAccessPoint = async function(apid, res) {
    // TODO

    // Post COMMIT
    await deployment.ManageIngressDeleted(sid);
}

const deleteBackboneLink = async function(lid, res) {
    var returnStatus = 204;
    const client = await db.ClientFromPool();
    try {
        var connectingSite = null;
        var listeningSite  = null;
        await client.query("BEGIN");
        if (!util.IsValidUuid(lid)) {
            throw(Error('Link-Id is not a valid uuid'));
        }

        const result = await client.query("DELETE FROM InterRouterLinks WHERE Id = $1 RETURNING ConnectingInteriorSite, ListeningInteriorSite", [lid]);
        if (result.rowCount == 1) {
            connectingSite = result.rows[0].connectinginteriorsite;
            listeningSite  = result.rows[0].listeninginteriorsite;
        }
        await client.query("COMMIT");
        res.status(returnStatus).end();

        //
        // Alert the sync and deployment-state modules that a backbone link was deleted for the connecting site
        //
        if (connectingSite) {
            try {
                await deployment.LinkAddedOrDeleted(connectingSite, listeningSite);
                await sync.LinkChanged(connectingSite);
            } catch (error) {
                Log(`Exception deleteBackboneLink module notifications: ${error.message}`);
                Log(error.stack);
            }
        }
    } catch (error) {
        await client.query("ROLLBACK");
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }

    return returnStatus;
}

const listBackbones = async function(res, bid=null) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        var result;
        if (bid) {
            if (!util.IsValidUuid(bid)) {
                throw(Error('Backbone-Id is not a valid uuid'));
            }

            result = await client.query("SELECT Id, Name, Lifecycle, Failure, MultiTenant FROM Backbones WHERE Id = $1", [bid]);
        } else {
            result = await client.query("SELECT Id, Name, Lifecycle, Failure, MultiTenant FROM Backbones");
        }
        var list = [];
        result.rows.forEach(row => {
            list.push(row);
        });
        res.json(list);
        res.status(returnStatus).end();
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }

    return returnStatus;
}

const listBackboneSites = async function(id, res, byBackbone) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        if (!util.IsValidUuid(id)) {
            throw(Error('Id is not a valid uuid'));
        }

        const result = await client.query(`SELECT Id, Name, Lifecycle, Failure, Metadata, DeploymentState, FirstActiveTime, LastHeartbeat FROM InteriorSites WHERE ${byBackbone ? 'Backbone' : 'Id'} = $1`, [id]);
        var list = [];
        result.rows.forEach(row => {
            list.push(row);
        });
        res.json(list);
        res.status(returnStatus).end();
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }

    return returnStatus;
}

const listAccessPointsBackbone = async function(bid, res) {
    // TODO
}

const listAccessPointsSite = async function(sid, res) {
    // TODO
}

const readAccessPoint = async function(apid, res) {
    // TODO
}

const listBackboneLinks = async function(bid, res) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        if (!util.IsValidUuid(bid)) {
            throw(Error('Backbone-Id is not a valid uuid'));
        }

        const result = await client.query("SELECT InterRouterLinks.* FROM InterRouterLinks JOIN InteriorSites ON InterRouterLinks.ListeningInteriorSite = InteriorSites.Id WHERE InteriorSites.Backbone = $1", [bid]);
        var list = [];
        result.rows.forEach(row => {
            list.push(row);
        });
        res.json(list);
        res.status(returnStatus).end();
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }

    return returnStatus;
}

const listSiteIngresses = async function(sid, res) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        if (!util.IsValidUuid(sid)) {
            throw(Error('Site-Id is not a valid uuid'));
        }

        const sites = await client.query("SELECT ClaimAccess, PeerAccess, MemberAccess, ManageAccess FROM InteriorSites WHERE Id = $1", [sid]);
        var list = [];
        if (sites.rowCount == 1) {
            const site = sites.rows[0];
            const result = await client.query("SELECT Id, Name, Lifecycle, Failure, Kind, Hostname, Port FROM BackboneAccessPoints WHERE Id = $1 OR Id = $2 OR Id = $3 OR Id = $4",
            [site.claimaccess, site.peeraccess, site.memberaccess, site.manageaccess]);

            result.rows.forEach(row => {
                list.push(row);
            });
        }
        res.json(list);
        res.status(returnStatus).end();
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }

    return returnStatus;
}

const listInvitations = async function(res) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    const result = await client.query("SELECT Id, Name, Lifecycle, Failure FROM MemberInvitations");
    var list = [];
    result.rows.forEach(row => {
        list.push(row);
    });
    res.send(JSON.stringify(list));
    res.status(returnStatus).end();
    client.release();

    return returnStatus;
}

const apiLog = function(req, status) {
    Log(`AdminAPI: ${req.ip} - (${status}) ${req.method} ${req.originalUrl}`);
}

exports.Initialize = async function(app, keycloak) {
    Log('[API Admin interface starting]');

    //========================================
    // Backbones
    //========================================

    // CREATE
    app.post(API_PREFIX + 'backbones', keycloak.protect('realm:backbone-admin'), async (req, res) => {
        apiLog(req, await createBackbone(req, res));
    });

    // READ
    app.get(API_PREFIX + 'backbone/:bid', keycloak.protect('realm:backbone-admin'), async (req, res) => {
        apiLog(req, await listBackbones(res, req.params.bid));
    });

    // LIST
    app.get(API_PREFIX + 'backbones', keycloak.protect(), async (req, res) => {
        apiLog(req, await listBackbones(res));
    });

    // DELETE
    app.delete(API_PREFIX + 'backbone/:bid', keycloak.protect('realm:backbone-admin'), async (req, res) => {
        apiLog(req, await deleteBackbone(res, req.params.bid));
    });

    // COMMANDS
    app.put(API_PREFIX + 'backbone/:bid/activate', keycloak.protect('realm:backbone-admin'), async (req, res) => {
        apiLog(req, await activateBackbone(res, req.params.bid));
    });

    //========================================
    // Backbone/Interior Sites
    //========================================

    // CREATE
    app.post(API_PREFIX + 'backbone/:bid/sites', keycloak.protect('realm:backbone-admin'), async (req, res) => {
        apiLog(req, await createBackboneSite(req.params.bid, req, res));
    });

    // READ
    app.get(API_PREFIX + 'backbonesite/:sid', keycloak.protect('realm:backbone-admin'), async (req, res) => {
        apiLog(req, await listBackboneSites(req.params.sid, res, false));
    });

    // LIST
    app.get(API_PREFIX + 'backbone/:bid/sites', keycloak.protect('realm:backbone-admin'), async (req, res) => {
        apiLog(req, await listBackboneSites(req.params.bid, res, true));
    });

    // UPDATE
    app.put(API_PREFIX + 'backbonesite/:sid', keycloak.protect('realm:backbone-admin'), async (req, res) => {
        apiLog(req, await updateBackboneSite(req.params.sid, req, res));
    });

    // DELETE
    app.delete(API_PREFIX + 'backbonesite/:sid', keycloak.protect('realm:backbone-admin'), async (req, res) => {
        apiLog(req, await deleteBackboneSite(res, req.params.sid));
    });

    //========================================
    // Interior Access Points
    //========================================

    // CREATE
    app.post(API_PREFIX + 'backbonesite/:sid/accesspoints', keycloak.protect('realm:backbone-admin'), async (req, res) => {
        apiLog(req, await createAccessPoint(req.params.sid, req, res));
    });

    // READ
    app.get(API_PREFIX + 'accesspoint/:apid', keycloak.protect('realm:backbone-admin'), async (req, res) => {
        apiLog(req, await readAccessPoint(req.params.apid, res));
    });

    // LIST
    app.get(API_PREFIX + 'backbone/:bid/accesspoints', keycloak.protect('realm:backbone-admin'), async (req, res) => {
        apiLog(req, await listAccessPointsBackbone(req.params.bid, res));
    });

    app.get(API_PREFIX + 'backbonesite/:sid/accesspoints', keycloak.protect('realm:backbone-admin'), async (req, res) => {
        apiLog(req, await listAccessPointsSite(req.params.sid, res));
    });

    // DELETE
    app.put(API_PREFIX + 'accesspoint/:apid', keycloak.protect('realm:backbone-admin'), async (req, res) => {
        apiLog(req, await deleteAccessPoint(req.params.apid, res));
    });

    //========================================
    // Interior Site Links
    //========================================

    // CREATE
    app.post(API_PREFIX + 'backbone/:bid/links', keycloak.protect('realm:backbone-admin'), async (req, res) => {
        apiLog(req, await createBackboneLink(req.params.bid, req, res));
    });

    // LIST
    app.get(API_PREFIX + 'backbone/:bid/links', keycloak.protect('realm:backbone-admin'), async (req, res) => {
        apiLog(req, await listBackboneLinks(req.params.bid, res));
    });

    // UPDATE
    app.put(API_PREFIX + 'backbonelink/:lid', keycloak.protect('realm:backbone-admin'), async (req, res) => {
        apiLog(req, await updateBackboneLink(req.params.lid, req, res));
    });

    // DELETE
    app.delete(API_PREFIX + 'backbonelink/:lid', keycloak.protect('realm:backbone-admin'), async (req, res) => {
        apiLog(req, await deleteBackboneLink(req.params.lid, res));
    });

    //========================================
    // Backbone Access Points
    //========================================
    app.get(API_PREFIX + 'backbonesite/:sid/ingresses', keycloak.protect(), async (req, res) => {
        apiLog(req, await listSiteIngresses(req.params.sid, res));
    });

    app.get(API_PREFIX + 'invitations', keycloak.protect(), async (req, res) => {
        apiLog(req, await listInvitations(res));
    });
}