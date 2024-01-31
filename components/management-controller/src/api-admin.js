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

const API_PREFIX = '/api/v1alpha1/';

const validateFields = function(fields, table) {
    var optional = {};
    for (const [key, value] of Object.entries(table)) {
        optional[key] = value.optional;
    }

    for (const [key, value] of Object.entries(fields)) {
        if (Object.keys(table).indexOf(key) < 0) {
            return `Unknown field key ${key}`;
        }
        delete optional[key];
        switch (table[key].type) {
        case 'string' :
            if (typeof value != 'string') {
                return `Expected string value for key ${key}`;
            }
            break;

        case 'bool' :
            if (typeof value != 'string' || (value != 'true' && value != 'false')) {
                return `Expected boolean string for key ${key}`;
            }
            break;

        case 'number' :
            if (typeof value != 'string' || isNaN(value)) {
                return `Expected numeric string for key ${key}`;
            }
            break;
        }
    }

    for (const [key, value] of Object.entries(optional)) {
        if (!value) {
            return `Mandatory key ${key} not found`;
        }
    }

    return null;
}

const listBackbones = async function(res) {
    const client = await db.ClientFromPool();
    try {
        const result = await client.query("SELECT Id, Name, Lifecycle, Failure, MultiTenant FROM Backbones");
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

const postBackbone = async function(req, res) {
    const form = new formidable.IncomingForm();
    form.parse(req, async function(err, fields, files) {
        if (err != null) {
            Log(err)
            res.status(400).json({ message: err.message });
            return;
        }

        const problem = validateFields(fields, {
            'name'        : {type: 'string', optional: false},
            'multitenant' : {type: 'bool',   optional: true},
        });

        if (problem) {
            res.status(400).json({ message: problem });
        } else {
            const client = await db.ClientFromPool();
            try {
                await client.query("BEGIN");
                const result = await client.query("INSERT INTO Backbones(Name, MultiTenant) VALUES ($1, $2) RETURNING Id", [fields.name, !fields.multitenant || fields.multitenant == 'true']);
                await client.query("COMMIT");

                res.status(201).json({id: result.rows[0].id});
                //res.status(201).end();
            } catch (error) {
                await client.query("ROLLBACK");
                res.status(500).send(error.message);
            } finally {
                client.release();
            }
        }
    });
}

const listBackboneSites = async function(bid, res) {
    const client = await db.ClientFromPool();
    try {
        const result = await client.query("SELECT Id, Name, Lifecycle, Failure, FirstActiveTime, LastHeartbeat FROM InteriorSites WHERE Backbone = $1", [bid]);
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
        const sites = await client.query("SELECT ClaimAccess, PeerAccess, MemberAccess, ManagementAccess FROM InteriorSites WHERE Id = $1", [sid]);
        var list = [];
        if (sites.rowCount == 1) {
            const site = sites.rows[0];
            const result = await client.query("SELECT Id, Name, Lifecycle, Failure, Kind, Hostname, Port FROM BackboneAccessPoints WHERE Id = $1 OR Id = $2 OR Id = $3 OR Id = $4",
            [site.claimaccess, site.peeraccess, site.memberaccess, site.managementaccess]);

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

    //
    // Backbones
    //
    api.get(API_PREFIX + 'backbones', (req, res) => {
        apiLog(req);
        listBackbones(res);
    });

    api.post(API_PREFIX + 'backbones', (req, res) => {
        apiLog(req);
        postBackbone(req, res);
    });

    //
    // Backbone/Interior Sites
    //
    api.get(API_PREFIX + 'backbone/:bid/sites', (req, res) => {
        apiLog(req);
        listBackboneSites(req.params.bid, res);
    });

    //
    // Interior Site Links
    //
    api.get(API_PREFIX + 'backbone/:bid/links', (req, res) => {
        apiLog(req);
        listBackboneLinks(req.params.bid, res);
    });

    //
    // Backbone Access Points
    //
    api.get(API_PREFIX + 'backbonesite/:sid/ingresses', (req, res) => {
        apiLog(req);
        listSiteIngresses(req.params.sid, res);
    });

    api.get(API_PREFIX + 'invitations', (req, res) => {
        apiLog(req);
        listInvitations(res);
    });
}