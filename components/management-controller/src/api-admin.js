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

const db  = require('./db.js');
const Log = require('./common/log.js').Log;

const API_PREFIX = '/api/v1alpha1/';

const listBackbones = async function(res) {
    const client = await db.ClientFromPool();
    try {
        const result = await client.query("SELECT Id, Name, Lifecycle, Failure FROM Backbones");
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

exports.Initialize = async function(api) {
    Log('[API Admin interface starting]');

    //
    // Backbones
    //
    api.get(API_PREFIX + 'backbones', (req, res) => {
        listBackbones(res);
    });

    //
    // Backbone/Interior Sites
    //
    api.get(API_PREFIX + 'backbone/:bid/sites', (req, res) => {
        listBackboneSites(req.params.bid, res);
    });

    //
    // Interior Site Links
    //
    api.get(API_PREFIX + 'backbone/:bid/links', (req, res) => {
        listBackboneLinks(req.params.bid, res);
    });

    //
    // Backbone Access Points
    //
    api.get(API_PREFIX + 'backbonesite/:sid/ingresses', (req, res) => {
        listSiteIngresses(req.params.sid, res);
    });

    api.get(API_PREFIX + 'invitations', (req, res) => {
        listInvitations(res);
    });
}