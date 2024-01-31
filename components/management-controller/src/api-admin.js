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
const Log        = require('./common/log.js').Log;

const API_PREFIX   = '/api/v1alpha1/';
const INGRESS_LIST = ['claim', 'peer', 'member', 'manage'];

const validateAndNormalizeFields = function(fields, table) { // Return [ problem, normalized-object ]
    var optional = {};
    for (const [key, value] of Object.entries(table)) {
        optional[key] = value.optional;
    }

    var normalized = {};

    for (const [key, value] of Object.entries(fields)) {
        if (Object.keys(table).indexOf(key) < 0) {
            return [`Unknown field key ${key}`, {}];
        }
        delete optional[key];
        switch (table[key].type) {
        case 'string' :
            if (typeof value != 'string') {
                return [`Expected string value for key ${key}`, {}];
            }
            normalized[key] = value;
            break;

        case 'bool' :
            if (typeof value != 'string' || (value != 'true' && value != 'false')) {
                return [`Expected boolean string for key ${key}`, {}];
            }
            normalized[key] = value == 'true';
            break;

        case 'number' :
            if (typeof value != 'string' || isNaN(value)) {
                return [`Expected numeric string for key ${key}`, {}];
            }
            normalized[key] = parseInt(value);
            break;
        }
    }

    for (const [key, value] of Object.entries(optional)) {
        if (!value) {
            return [`Mandatory key ${key} not found`, {}];
        } else {
            normalized[key] = table[key].default;
        }
    }

    return [null, normalized];
}

const createBackbone = async function(req, res) {
    const form = new formidable.IncomingForm();
    form.parse(req, async function(err, fields, files) {
        if (err != null) {
            Log(err)
            res.status(400).json({ message: err.message });
            return;
        }

        const [problem, norm] = validateAndNormalizeFields(fields, {
            'name'        : {type: 'string', optional: false},
            'multitenant' : {type: 'bool',   optional: true, default: true},
        });

        if (problem) {
            res.status(400).json({ message: problem });
        } else {
            const client = await db.ClientFromPool();
            try {
                await client.query("BEGIN");
                const result = await client.query("INSERT INTO Backbones(Name, LifeCycle, MultiTenant) VALUES ($1, 'partial', $2) RETURNING Id", [norm.name, norm.multitenant]);
                await client.query("COMMIT");

                res.status(201).json({id: result.rows[0].id});
            } catch (error) {
                await client.query("ROLLBACK");
                res.status(500).send(error.message);
            } finally {
                client.release();
            }
        }
    });
}

const createBackboneSite = async function(bid, req, res) {
    const form = new formidable.IncomingForm();
    form.parse(req, async function(err, fields, files) {
        if (err != null) {
            Log(err)
            res.status(400).json({ message: err.message });
            return;
        }

        const [problem, norm] = validateAndNormalizeFields(fields, {
            'name'   : {type: 'string', optional: false},
            'claim'  : {type: 'bool',   optional: true, default: true},
            'peer'   : {type: 'bool',   optional: true, default: false},
            'member' : {type: 'bool',   optional: true, default: true},
            'manage' : {type: 'bool',   optional: true, default: false},
        });

        if (problem) {
            res.status(400).json({ message: problem });
        } else {
            const client = await db.ClientFromPool();
            try {
                await client.query("BEGIN");

                //
                // Create a BackboneAccessPoint object for each called-for ingress on this site.
                //
                var accessIds = {};
                var extraCols = "";
                var extraVals = "";
                for (const ingress of INGRESS_LIST) {
                    if (norm[ingress]) {
                        const apResult = await client.query("INSERT INTO BackboneAccessPoints(Name, Kind, Backbone) VALUES ($1, $2, $3) RETURNING Id", [`${norm.name}-${ingress}`, ingress, bid]);
                        const apId = apResult.rows[0].id;
                        accessIds[ingress] = apId
                        extraCols += `, ${ingress}Access`;
                        extraVals += `, '${apId}'`;
                    }
                }

                //
                // Create the site referencing the above created access points.
                //
                const result = await client.query(`INSERT INTO InteriorSites(Name, Backbone${extraCols}) VALUES ($1, $2${extraVals}) RETURNING Id`, [norm.name, bid]);
                const siteId = result.rows[0].id;
                await client.query("COMMIT");

                res.status(201).json({id: siteId});
            } catch (error) {
                await client.query("ROLLBACK");
                res.status(500).send(error.message);
            } finally {
                client.release();
            }
        }
    });
}

const createBackboneLink = async function(bid, req, res) {
    const form = new formidable.IncomingForm();
    form.parse(req, async function(err, fields, files) {
        if (err != null) {
            Log(err)
            res.status(400).json({ message: err.message });
            return;
        }

        const [problem, norm] = validateAndNormalizeFields(fields, {
            'listeningsite'  : {type: 'string', optional: false},
            'connectingsite' : {type: 'string', optional: false},
            'cost'           : {type: 'number', optional: true, default: 1},
        });

        if (problem) {
            res.status(400).json({ message: problem });
        } else {
            const client = await db.ClientFromPool();
            try {
                await client.query("BEGIN");

                //
                // Ensure that the referenced sites are in the specified backbone network
                //
                const siteResult = await client.query("SELECT Backbone FROM InteriorSites WHERE Id = $1 OR Id = $2", [norm.listeningsite, norm.connectingsite]);
                if (siteResult.rowCount == 2 && siteResult.row[0].backbone == bid && siteResult.row[1].backbone == bid) {
                    const linkResult = await client.query("INSERT INTO InterRouterLinks(ListeningInteriorSite, ConnectingInteriorSite, Cost) VALUES ($1, $2, $3) RETURNING Id", [norm.listeningsite, norm.connectingsite, norm.cost]);
                    const linkId = linkResult.rows[0].id;
                    await client.query("COMMIT");
                    res.status(201).json({id: linkId});
                } else {
                    res.status(400).send('Sites not found or are not in the specified backbone');
                    await client.query("ROLLBACK");
                }
            } catch (error) {
                await client.query("ROLLBACK");
                res.status(500).send(error.message);
            } finally {
                client.release();
            }
        }
    });
}

const activateBackbone = async function(res, bid) {
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        await client.query("UPDATE Backbones SET Lifecycle = 'new' WHERE Id = $1 and LifeCycle = 'partial'", [bid]);
        await client.query("COMMIT");
        res.status(200).end();
    } catch (error) {
        await client.query("ROLLBACK");
        res.status(400).send(error.message);
    } finally {
        client.release();
    }
}

const deleteBackbone = async function(res, bid) {
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const vanResult = await client.query("SELECT Id FROM ApplicationNetworks WHERE Backbone = $1 and LifeCycle = 'ready'", [bid]);
        if (vanResult.rowCount > 0) {
            throw(Error('Cannot delete a backbone with active application networks'));
        }
        const siteResult = await client.query("SELECT Id FROM InteriorSites WHERE Backbone = $1", [bid]);
        if (siteResult.rowCount > 0) {
            throw(Error('Cannot delete a backbone with interior sites'));
        }
        await client.query("DELETE FROM Backbones WHERE Id = $1", [bid]);
        await client.query("COMMIT");

        res.status(204).end();
    } catch (error) {
        await client.query("ROLLBACK");
        res.status(400).send(error.message);
    } finally {
        client.release();
    }
}

const deleteBackboneSite = async function(res, sid) {
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT ClaimAccess, PeerAccess, MemberAccess, ManageAccess from InteriorSites WHERE Id = $1", [sid]);
        if (result.rowCount == 1) {
            const row = result.rows[0];

            //
            // Delete all of the site's access points
            //
            for (const ingress of INGRESS_LIST) {
                const colName = `${ingress}access`;
                if (row[colName]) {
                    await client.query("DELETE FROM BackboneAccessPoints WHERE Id = $1", [row[colName]]);
                }
            }

            //
            // Delete the site.  Note that involved inter-router links will be automatically deleted by the database.
            //
            await client.query("DELETE FROM InteriorSites WHERE Id = $1", [sid]);
        }
        await client.query("COMMIT");

        res.status(204).end();
    } catch (error) {
        await client.query("ROLLBACK");
        res.status(400).send(error.message);
    } finally {
        client.release();
    }
}

const deleteBackboneLink = async function(lid, res) {
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        await client.query("DELETE FROM InterRouterLinks WHERE Id = $1", [lid]);
        await client.query("COMMIT");

        res.status(204).end();
    } catch (error) {
        await client.query("ROLLBACK");
        res.status(400).send(error.message);
    } finally {
        client.release();
    }
}

const listBackbones = async function(res, bid=null) {
    const client = await db.ClientFromPool();
    try {
        var result;
        if (bid) {
            result = await client.query("SELECT Id, Name, Lifecycle, Failure, MultiTenant FROM Backbones WHERE Id = $1", [bid]);
        } else {
            result = await client.query("SELECT Id, Name, Lifecycle, Failure, MultiTenant FROM Backbones");
        }
        var list = [];
        result.rows.forEach(row => {
            list.push(row);
        });
        res.json(list);
        res.status(200).end();
    } catch (error) {
        res.status(500).send(error.message);
    } finally {
        client.release();
    }
}

const listBackboneSites = async function(id, res, byBackbone) {
    const client = await db.ClientFromPool();
    try {
        const result = await client.query(`SELECT Id, Name, Lifecycle, Failure, FirstActiveTime, LastHeartbeat FROM InteriorSites WHERE ${byBackbone ? 'Backbone' : 'Id'} = $1`, [id]);
        var list = [];
        result.rows.forEach(row => {
            list.push(row);
        });
        res.json(list);
        res.status(200).end();
    } catch (error) {
        res.status(500).send(error.message);
    } finally {
        client.release();
    }
}

const listBackboneLinks = async function(bid, res) {
    const client = await db.ClientFromPool();
    try {
        const result = await client.query("SELECT InterRouterLinks.* FROM InterRouterLinks JOIN InteriorSites ON InterRouterLinks.ListeningInteriorSite = InteriorSites.Id WHERE InteriorSites.Backbone = $1", [bid]);
        var list = [];
        result.rows.forEach(row => {
            list.push(row);
        });
        res.json(list);
        res.status(200).end();
    } catch (error) {
        res.status(500).send(error.message);
    } finally {
        client.release();
    }
}

const listSiteIngresses = async function(sid, res) {
    const client = await db.ClientFromPool();
    try {
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
        res.status(200).end();
    } catch (error) {
        res.status(500).send(error.message);
    } finally {
        client.release();
    }
}

const listInvitations = async function(res) {
    const client = await db.ClientFromPool();
    const result = await client.query("SELECT Id, Name, Lifecycle, Failure FROM MemberInvitations");
    var list = [];
    result.rows.forEach(row => {
        list.push(row);
    });
    res.send(JSON.stringify(list));
    res.status(200).end();
    client.release();
}

const apiLog = function(req) {
    Log(`AdminAPI: ${req.ip} - ${req.method} ${req.originalUrl}`);
}

exports.Initialize = async function(api) {
    Log('[API Admin interface starting]');

    //========================================
    // Backbones
    //========================================

    // CREATE
    api.post(API_PREFIX + 'backbones', (req, res) => {
        apiLog(req);
        createBackbone(req, res);
    });

    // READ
    api.get(API_PREFIX + 'backbone/:bid', (req, res) => {
        apiLog(req);
        listBackbones(res, req.params.bid);
    });

    // LIST
    api.get(API_PREFIX + 'backbones', (req, res) => {
        apiLog(req);
        listBackbones(res);
    });

    // DELETE
    api.delete(API_PREFIX + 'backbone/:bid', (req, res) => {
        apiLog(req);
        deleteBackbone(res, req.params.bid);
    });

    // COMMANDS
    api.put(API_PREFIX + 'backbone/:bid/activate', (req, res) => {
        apiLog(req);
        activateBackbone(res, req.params.bid);
    });

    //========================================
    // Backbone/Interior Sites
    //========================================

    // CREATE
    api.post(API_PREFIX + 'backbone/:bid/sites', (req, res) => {
        apiLog(req);
        createBackboneSite(req.params.bid, req, res);
    });

    // READ
    api.get(API_PREFIX + 'backbonesite/:sid', (req, res) => {
        apiLog(req);
        listBackboneSites(req.params.sid, res, false);
    });

    // LIST
    api.get(API_PREFIX + 'backbone/:bid/sites', (req, res) => {
        apiLog(req);
        listBackboneSites(req.params.bid, res, true);
    });

    // UPDATE

    // DELETE
    api.delete(API_PREFIX + 'backbonesite/:sid', (req, res) => {
        apiLog(req);
        deleteBackboneSite(res, req.params.sid);
    });

    //========================================
    // Interior Site Links
    //========================================

    // CREATE
    api.post(API_PREFIX + 'backbone/:bid/links', (req, res) => {
        apiLog(req);
        createBackboneLink(req.params.bid, req, res);
    });

    // LIST
    api.get(API_PREFIX + 'backbone/:bid/links', (req, res) => {
        apiLog(req);
        listBackboneLinks(req.params.bid, res);
    });

    // DELETE
    api.delete(API_PREFIX + 'backbonelink/:lid', (req, res) => {
        apiLog(req);
        deleteBackboneLink(req.params.lid, res);
    });

    //========================================
    // Backbone Access Points
    //========================================
    api.get(API_PREFIX + 'backbonesite/:sid/ingresses', (req, res) => {
        apiLog(req);
        listSiteIngresses(req.params.sid, res);
    });

    api.get(API_PREFIX + 'invitations', (req, res) => {
        apiLog(req);
        listInvitations(res);
    });
}