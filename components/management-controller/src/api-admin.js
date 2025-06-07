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
const sync       = require('./sync-management.js');
const Log        = require('./common/log.js').Log;
const deployment = require('./site-deployment-state.js');
const util       = require('./common/util.js');

const API_PREFIX   = '/api/v1alpha1/';
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

const createBackboneSite = async function(req, res) {
    var returnStatus;
    const bid = req.params.bid;
    const form = new formidable.IncomingForm();
    try {
        if (!util.IsValidUuid(bid)) {
            throw(Error('Backbone-Id is not a valid uuid'));
        }

        const [fields, files] = await form.parse(req)
        const norm = util.ValidateAndNormalizeFields(fields, {
            'name'     : {type: 'dnsname', optional: false},
            'platform' : {type: 'dnsname', optional: false},
            'metadata' : {type: 'string',  optional: true, default: null},
        });

        const client = await db.ClientFromPool();
        try {
            await client.query("BEGIN");
            var extraCols = "";
            var extraVals = "";

            //
            // If the name is not unique within the backbone, modify it to be unique.
            //
            const namesResult = await client.query("SELECT Name FROM InteriorSites WHERE Backbone = $1", [bid]);
            var existingNames = [];
            for (const row of namesResult.rows) {
                existingNames.push(row.name);
            }
            const uniqueName = util.UniquifyName(norm.name, existingNames);

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
            const result = await client.query(`INSERT INTO InteriorSites(Name, TargetPlatform, Backbone${extraCols}) VALUES ($1, $2, $3${extraVals}) RETURNING Id`,
                                              [uniqueName, norm.platform, bid]);
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

const updateBackboneSite = async function(req, res) {
    var returnStatus = 200;
    const sid = req.params.sid;
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

const createAccessPoint = async function(req, res) {
    var returnStatus;
    const sid = req.params.sid;
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
            const name = norm.name || norm.kind;

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
            await sync.SiteIngressChanged(sid, apId);

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
        res.status(returnStatus).send(error.message);
    }

    return returnStatus;
}

const createBackboneLink = async function(req, res) {
    var returnStatus;
    const apid = req.params.apid;
    const form = new formidable.IncomingForm();
    try {
        if (!util.IsValidUuid(apid)) {
            throw(Error('AccessPoint-Id is not a valid uuid'));
        }

        const [fields, files] = await form.parse(req);
        const norm = util.ValidateAndNormalizeFields(fields, {
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
                                                    "WHERE BackboneAccessPoints.Id = $1", [apid]);

            //
            // Validate that the referenced access point exists
            //
            if (accessResult.rowCount == 0) {
                throw(Error(`Referenced access point not found: ${apid}`));
            }
            const accessPoint = accessResult.rows[0];

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

            if (siteResult.rows[0].backbone != accessPoint.backbone) {
                throw(Error(`Referenced connecting site is not in the same backbone network as the access-point`));
            }

            //
            // Create the new link
            //
            const linkResult = await client.query("INSERT INTO InterRouterLinks(AccessPoint, ConnectingInteriorSite, Cost) VALUES ($1, $2, $3) RETURNING Id", [apid, norm.connectingsite, norm.cost]);
            const linkId = linkResult.rows[0].id;

            await client.query("COMMIT");
            returnStatus = 201;
            res.status(returnStatus).json({id: linkId});

            //
            // Alert the sync and deployment-state modules that a new backbone link was added for the connecting site
            //
            try {
                await deployment.LinkAddedOrDeleted(norm.connectingsite, apid);
                await sync.LinkChanged(norm.connectingsite, linkId);
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

const updateBackboneLink = async function(req, res) {
    var returnStatus = 204;
    const lid = req.params.lid;
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
                await sync.LinkChanged(linkChanged, lid);
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

const activateBackbone = async function(req, res) {
    var returnStatus = 200;
    const bid = req.params.bid;
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

const deleteBackbone = async function(req, res) {
    var returnStatus = 204;
    const bid = req.params.bid;
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

// This api is only used by the Console (no compose-web-app )
const deleteBackboneSite = async function(req, res) {
    var returnStatus = 204;
    const sid = req.params.sid;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        if (!util.IsValidUuid(sid)) {
            throw(Error('Site-Id is not a valid uuid'));
        }

        //
        // FIXED: Delete all of the site's access points using correct foreign key relationship
        // Previously this function tried to access non-existent columns (ClaimAccess, PeerAccess, etc.)
        // from InteriorSites table. Now we correctly delete all BackboneAccessPoints that belong
        // to this site using the InteriorSite foreign key.
        //
        const result = await client.query("SELECT certificate from InteriorSites WHERE Id = $1",[sid]);
        if (result.rowCount == 1) {
            const row = result.rows[0];

            //
            // Delete all of the site's access points
            //
        const apResult = await client.query("DELETE FROM BackboneAccessPoints WHERE InteriorSite = $1 RETURNING Certificate",[sid]);
        for (const row of apResult.rows) {
            if (row.certificate) {
                await client.query("DELETE FROM TlsCertificates WHERE Id = $1", [row.certificate]);
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

const deleteAccessPoint = async function(req, res) {
    var returnStatus = 204;
    const apid = req.params.apid;
    var siteId = undefined;
    var wasManage = false;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        if (!util.IsValidUuid(apid)) {
            throw(Error('AccessPoint-Id is not a valid uuid'));
        }

        const apResult = await client.query("DELETE FROM BackboneAccessPoints WHERE Id = $1 Returning Certificate, Kind, InteriorSite", [apid]);
        if (apResult.rowCount == 1) {
            const row = apResult.rows[0];
            if (row.certificate) {
                await client.query("DELETE FROM TlsCertificates WHERE Id = $1", [row.certificate]);
            }
            siteId = row.interiorsite;
            if (row.kind == 'manage') {
                wasManage = true;
            }
        }
        await client.query("COMMIT");
        res.status(returnStatus).end();

        //
        // Alert the sync module that an access point changed on a site
        //
        await sync.SiteIngressChanged(siteId, apid);

    } catch (error) {
        await client.query("ROLLBACK");
        returnStatus = 400;
        res.status(returnStatus).send(error.stack);
    } finally {
        client.release();
    }

    if (wasManage) {
        await deployment.ManageIngressDeleted(siteId);
    }

    return returnStatus;
}

const deleteBackboneLink = async function(req, res) {
    var returnStatus = 204;
    const lid = req.params.lid;
    const client = await db.ClientFromPool();
    try {
        var connectingSite = null;
        var accessPoint    = null;
        await client.query("BEGIN");
        if (!util.IsValidUuid(lid)) {
            throw(Error('Link-Id is not a valid uuid'));
        }

        const result = await client.query("DELETE FROM InterRouterLinks WHERE Id = $1 RETURNING ConnectingInteriorSite, AccessPoint", [lid]);
        if (result.rowCount == 1) {
            connectingSite = result.rows[0].connectinginteriorsite;
            accessPoint    = result.rows[0].accesspoint;
        }
        await client.query("COMMIT");
        res.status(returnStatus).end();

        //
        // Alert the sync and deployment-state modules that a backbone link was deleted for the connecting site
        //
        if (connectingSite) {
            try {
                await deployment.LinkAddedOrDeleted(connectingSite, accessPoint);
                await sync.LinkChanged(connectingSite, lid);
            } catch (error) {
                Log(`Exception deleteBackboneLink module notifications: ${error.message}`);
                Log(error.stack);
            }
        }
    } catch (error) {
        await client.query("ROLLBACK");
        returnStatus = 400;
        res.status(returnStatus).send(error.stack);
    } finally {
        client.release();
    }

    return returnStatus;
}

const listBackbones = async function(req, res) {
    var returnStatus = 200;
    const bid = req.params.bid;
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

        if (bid) {
            if (result.rowCount < 1) {
                returnStatus = 400;
                res.status(returnStatus).send('Not Found');
            } else {
                res.status(returnStatus).json(result.rows[0]);
            }
        } else {
            res.status(returnStatus).json(result.rows);
        }
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
}

const listBackboneSites = async function(req, res) {
    var returnStatus = 200;
    const bid = req.params.bid;
    const sid = req.params.sid;
    var byBackbone;
    var id;
    const client = await db.ClientFromPool();
    try {
        if (bid) {
            if (!util.IsValidUuid(bid)) {
                throw(Error('Id is not a valid uuid'));
            }
            byBackbone = true;
            id = bid;
        } else if (sid) {
            if (!util.IsValidUuid(sid)) {
                throw(Error('Id is not a valid uuid'));
            }
            byBackbone = false;
            id = sid;
        }

        const result = await client.query("SELECT InteriorSites.Id, Name, Lifecycle, Failure, Metadata, DeploymentState, TargetPlatform, FirstActiveTime, LastHeartbeat, " +
                                          "TlsCertificates.expiration as tlsexpiration, TlsCertificates.renewalTime as tlsrenewal, TargetPlatforms.LongName as PlatformLong " +
                                          "FROM InteriorSites " +
                                          "LEFT OUTER JOIN TlsCertificates ON TlsCertificates.Id = Certificate " +
                                          "JOIN TargetPlatforms ON TargetPlatforms.ShortName = TargetPlatform " +
                                          `WHERE ${byBackbone ? 'Backbone' : 'InteriorSites.Id'} = $1`, [id]);

        if (byBackbone) {
            res.json(result.rows);
        } else {
            if (result.rowCount == 0) {
                throw(Error('Not found'));
            }
            res.json(result.rows[0]);
        }
        res.status(returnStatus).end();
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }

    return returnStatus;
}

const listAccessPointsBackbone = async function(req, res) {
    var returnStatus = 200;
    const bid = req.params.bid;
    const client = await db.ClientFromPool();
    try {
        if (!util.IsValidUuid(bid)) {
            throw(Error('Id is not a valid uuid'));
        }

        const result = await client.query("SELECT BackboneAccessPoints.Id, BackboneAccessPoints.Name, BackboneAccessPoints.Lifecycle, BackboneAccessPoints.Failure, Hostname, Port, Kind, Bindhost, InteriorSite, InteriorSites.Name as sitename FROM BackboneAccessPoints " +
                                          "JOIN InteriorSites ON InteriorSites.Id = InteriorSite " +
                                          "WHERE InteriorSites.Backbone = $1", [bid]);
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

const listAccessPointsSite = async function(req, res) {
    var returnStatus = 200;
    const sid = req.params.sid;
    const client = await db.ClientFromPool();
    try {
        if (!util.IsValidUuid(sid)) {
            throw(Error('Id is not a valid uuid'));
        }

        const result = await client.query("SELECT Id, Name, Lifecycle, Failure, Hostname, Port, Kind, Bindhost FROM BackboneAccessPoints " +
                                          "WHERE InteriorSite = $1", [sid]);
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

const readAccessPoint = async function(req, res) {
    var returnStatus = 200;
    const apid = req.params.apid;
    const client = await db.ClientFromPool();
    try {
        if (!util.IsValidUuid(apid)) {
            throw(Error('Id is not a valid uuid'));
        }

        const result = await client.query("SELECT Id, Name, Lifecycle, Failure, Hostname, Port, Kind, Bindhost, InteriorSite FROM BackboneAccessPoints " +
                                          "WHERE Id = $1", [apid]);
        if (result.rowCount == 0) {
            throw(Error("Not found"));
        }

        res.json(result.rows[0]);
        res.status(returnStatus).end();
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }

    return returnStatus;
}

const listBackboneLinks = async function(req, res) {
    var returnStatus = 200;
    const bid = req.params.bid;
    const client = await db.ClientFromPool();
    try {
        if (!util.IsValidUuid(bid)) {
            throw(Error('Backbone-Id is not a valid uuid'));
        }

        const result = await client.query("SELECT InterRouterLinks.* FROM InterRouterLinks " +
                                          "JOIN InteriorSites ON InterRouterLinks.ConnectingInteriorSite = InteriorSites.Id " +
                                          "WHERE InteriorSites.Backbone = $1", [bid]);
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

const listBackboneLinksForSite = async function(req, res) {
    var returnStatus = 200;
    const sid = req.params.sid;
    const client = await db.ClientFromPool();
    try {
        if (!util.IsValidUuid(sid)) {
            throw(Error('Site-Id is not a valid uuid'));
        }

        const result = await client.query("SELECT InterRouterLinks.* FROM InterRouterLinks WHERE ConnectingInteriorSite = $1", [sid]);
        res.json(result.rows);
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

exports.Initialize = async function(app, keycloak) {
    Log('[API Admin interface starting]');

    //========================================
    // Backbones
    //========================================

    app.route(API_PREFIX + 'backbones', keycloak.protect('realm:backbone-admin'))
    .post(createBackbone)       // CREATE
    .get(listBackbones);        // LIST

    app.route(API_PREFIX + 'backbones/:bid', keycloak.protect('realm:backbone-admin'))
    .get(listBackbones)         // READ
    .delete(deleteBackbone);    // DELETE

    app.route(API_PREFIX + 'backbones/:bid/activate', keycloak.protect('realm:backbone-admin'))
    .put(activateBackbone);     // ACTIVATE

    //========================================
    // Backbone/Interior Sites
    //========================================

    app.route(API_PREFIX + 'backbones/:bid/sites', keycloak.protect('realm:backbone-admin'))
    .post(createBackboneSite)     // CREATE
    .get(listBackboneSites);      // LIST

    app.route(API_PREFIX + 'backbonesites/:sid', keycloak.protect('realm:backbone-admin'))
    .get(listBackboneSites)       // READ
    .put(updateBackboneSite)      // UPDATE
    .delete(deleteBackboneSite);  // DELETE

    //========================================
    // Interior Access Points
    //========================================

    app.route(API_PREFIX + 'backbonesites/:sid/accesspoints', keycloak.protect('realm:backbone-admin'))
    .post(createAccessPoint)         // CREATE
    .get(listAccessPointsSite);      // LIST for Site

    app.route(API_PREFIX + 'backbones/:bid/accesspoints', keycloak.protect('realm:backbone-admin'))
    .get(listAccessPointsBackbone);  // LIST for Backbone

    app.route(API_PREFIX + 'accesspoints/:apid', keycloak.protect('realm:backbone-admin'))
    .get(readAccessPoint)            // READ
    .delete(deleteAccessPoint);      // DELETE

    //========================================
    // Interior Site Links
    //========================================

    app.route(API_PREFIX + 'accesspoints/:apid/links', keycloak.protect('realm:backbone-admin'))
    .post(createBackboneLink);

    app.route(API_PREFIX + 'backbones/:bid/links', keycloak.protect('realm:backbone-admin'))
    .get(listBackboneLinks);

    app.route(API_PREFIX + 'backbonesites/:sid/links', keycloak.protect('realm:backbone-admin'))
    .get(listBackboneLinksForSite);

    app.route(API_PREFIX + 'backbonelinks/:lid', keycloak.protect('realm:backbone-admin'))
    .put(updateBackboneLink)
    .delete(deleteBackboneLink);

    //========================================
    // Backbone Access Points
    //========================================
    app.get(API_PREFIX + 'backbonesites/:sid/ingresses', keycloak.protect(), async (req, res) => {
        await listSiteIngresses(req.params.sid, res);
    });

    app.get(API_PREFIX + 'invitations', keycloak.protect(), async (req, res) => {
        await listInvitations(res);
    });
}