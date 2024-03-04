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

const API_PREFIX = '/api/v1alpha1/';

const createVan = async function(bid, req, res) {
    var returnStatus;
    const form = new formidable.IncomingForm();
    try {
        const [fields, files] = await form.parse(req)
        const norm = util.ValidateAndNormalizeFields(fields, {
            'name'        : {type: 'string',     optional: false},
            'starttime'   : {type: 'timestampz', optional: true, default: null},
            'endtime'     : {type: 'timestampz', optional: true, default: null},
            'deletedelay' : {type: 'interval',   optional: true, default: null},
        });

        const client = await db.ClientFromPool();
        try {
            await client.query("BEGIN");

            var extraCols = "";
            var extraVals = "";

            //
            // Handle the optional fields
            //
            if (norm.starttime) {
                extraCols += ', StartTime';
                extraVals += `, '${norm.starttime}'`;
            }

            if (norm.endtime) {
                extraCols += ', EndTime';
                extraVals += `, '${norm.endtime}'`;
            }

            if (norm.deletedelay) {
                extraCols += ', DeleteDelay';
                extraVals += `, '${norm.deletedelay}'`;
            }

            //
            // Create the application network
            //
            const result = await client.query(`INSERT INTO ApplicationNetworks(Name, Backbone${extraCols}) VALUES ($1, $2${extraVals}) RETURNING Id`, [norm.name, bid]);
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

const createInvitation = async function(vid, req, res) {
    var returnStatus;
    const form = new formidable.IncomingForm();
    try {
        const [fields, files] = await form.parse(req)
        const norm = util.ValidateAndNormalizeFields(fields, {
            'name'            : {type: 'string',     optional: false},
            'claimaccess'     : {type: 'uuid',       optional: false},
            'primaryaccess'   : {type: 'uuid',       optional: false},
            'secondaryaccess' : {type: 'uuid',       optional: true, default: null},
            'joindeadline'    : {type: 'timestampz', optional: true, default: null},
            'siteclass'       : {type: 'string',     optional: true, default: null},
            'instancelimit'   : {type: 'number',     optional: true, default: null},
            'interactive'     : {type: 'bool',       optional: true, default: false},
        });

        const client = await db.ClientFromPool();
        try {
            await client.query("BEGIN");

            var extraCols = "";
            var extraVals = "";

            //
            // Handle the optional fields
            //
            if (norm.siteclass) {
                extraCols += ', MemberClass';
                extraVals += `, '${norm.siteclass}'`;
            }

            if (norm.instancelimit) {
                extraCols += ', InstanceLimit';
                extraVals += `, ${norm.instancelimit}`;
            }

            //
            // Create the application network
            //
            const result = await client.query(`INSERT INTO MemberInvitations(Name, MemberOf, ClaimAccess, Interactive${extraCols}) ` +
                                              `VALUES ($1, $2, $3, $4${extraVals}) RETURNING Id`, [norm.name, vid, norm.claimaccess, norm.interactive]);
            const invitationId = result.rows[0].id;

            await client.query("INSERT INTO EdgeLinks(AccessPoint, EdgeToken, Priority) VALUES ($1, $2, 1)", [norn.primaryaccess, invitationId]);

            if (norm.secondaryaccess) {
                await client.query("INSERT INTO EdgeLinks(AccessPoint, EdgeToken, Priority) VALUES ($1, $2, 2)", [norn.secondaryaccess, invitationId]);
            }
            await client.query("COMMIT");

            returnStatus = 201;
            res.status(returnStatus).json({id: invitationId});
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

const readVan = async function(res, vid) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        const result = await client.query("SELECT ApplicationNetworks.Name, ApplicationNetworks.LifeCycle, Backbones.Name as backbonename, StartTime, EndTime, DeleteDelay FROM ApplicationNetworks " +
                                          "JOIN Backbones ON ApplicationNetworks.Backbone = Backbones.Id WHERE ApplicationNetworks.Id = $1", [vid]);
        if (result.rowCount == 1) {
            res.status(returnStatus).json(result.rows[0]);
        } else {
            returnStatus = 400;
            res.status(returnStatus).end();
        }
    } catch (error) {
        returnStatus = 500
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const readInvitation = async function(res, iid) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        const result = await client.query("SELECT MemberInvitations.Name, MemberInvitations.LifeCycle, ApplicationNetworks.Name as vanname, JoinDeadline, InstanceLimit, InstanceCount, InteractiveClaim as interactive FROM MemberInvitations " +
                                          "JOIN ApplicationNetworks ON ApplicationNetworks.Id = MemberInvitations.MemberOf WHERE MemberInvitations.Id = $1", [iid]);
        if (result.rowCount == 1) {
            res.status(returnStatus).json(result.rows[0]);
        } else {
            returnStatus = 400;
            res.status(returnStatus).end();
        }
    } catch (error) {
        returnStatus = 500
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const readVanMember = async function(res, mid) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        const result = await client.query("SELECT MemberSites.Name, MemberSites.LifeCycle, ApplicationNetworks.Name as vanname, FiratActiveTime, LastHeartbeat, SiteClass FROM MemberSites " +
                                          "JOIN ApplicationNetworks ON ApplicationNetworks.Id = MemberSites.MemberOf WHERE MemberSites.Id = $1", [mid]);
        if (result.rowCount == 1) {
            res.status(returnStatus).json(result.rows[0]);
        } else {
            returnStatus = 400;
            res.status(returnStatus).end();
        }
    } catch (error) {
        returnStatus = 500
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const listVans = async function(res, bid) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        const result = await client.query("SELECT Id, Name, LifeCycle, StartTime, EndTime, DeleteDelay FROM ApplicationNetworks WHERE Backbone = $1", [bid]);
        res.status(returnStatus).json(result.rows);
    } catch (error) {
        returnStatus = 500
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const listInvitations = async function(res, vid) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        const result = await client.query("SELECT Id, Name, LifeCycle, JoinDeadline, MemberClass, InstanceLimit, InstanceCount, InteractiveClaim as interactive FROM MemberInvitations WHERE MemberOf = $1", [vid]);
        res.status(returnStatus).json(result.rows);
    } catch (error) {
        returnStatus = 500
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const listVanMembers = async function(res, vid) {
    var returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        const result = await client.query("SELECT id, Name, LifeCycle, FirstActiveTime, LastHeartbeat, SiteClass FROM MemberSites WHERE MemberOf = $1", [vid]);
        res.status(returnStatus).json(result.rows);
    } catch (error) {
        returnStatus = 500
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const deleteVan = async function(res, vid) {
}

const deleteInvitation = async function(res, iid) {
}

const evictMember = async function(mid, req, res) {
}

const apiLog = function(req, status) {
    Log(`UserAPI: ${req.ip} - (${status}) ${req.method} ${req.originalUrl}`);
}

exports.Initialize = async function(api) {
    Log('[API User interface starting]');

    //========================================
    // Application Networks
    //========================================

    // CREATE
    api.post(API_PREFIX + 'backbone/:bid/vans', async (req, res) => {
        apiLog(req, await createVan(req.params.bid, req, res));
    });

    // READ
    api.get(API_PREFIX + 'van/:vid', async (req, res) => {
        apiLog(req, await readVan(res, req.params.vid));
    });

    // LIST
    api.get(API_PREFIX + 'backbone/:bid/vans', async (req, res) => {
        apiLog(req, await listVans(res, req.params.bid));
    });

    // DELETE
    api.delete(API_PREFIX + 'van/:vid', async (req, res) => {
        apiLog(req, await deleteVan(res, req.params.vid));
    });

    //========================================
    // Invitations
    //========================================

    // CREATE
    api.post(API_PREFIX + 'van/:vid/invitations', async (req, res) => {
        apiLog(req, await createInvitation(req.params.vid, req, res));
    });

    // READ
    api.get(API_PREFIX + 'invitation/:iid', async (req, res) => {
        apiLog(req, await readInvitation(res, req.params.iid));
    });

    // LIST
    api.get(API_PREFIX + 'van/:vid/invitations', async (req, res) => {
        apiLog(req, await listInvitations(res, req.params.vid));
    });

    // DELETE
    api.delete(API_PREFIX + 'invitation/:iid', async (req, res) => {
        apiLog(req, await deleteInvitation(res, req.params.iid));
    });

    //========================================
    // Member Sites
    //========================================

    // READ
    api.get(API_PREFIX + 'member/:mid', async (req, res) => {
        apiLog(req, await readVanMember(res, req.params.mid));
    });

    // LIST
    api.get(API_PREFIX + 'van/:vid/members', async (req, res) => {
        apiLog(req, await listVanMembers(res, req.params.vid));
    });

    // COMMANDS
    api.put(API_PREFIX + 'member/:mid/evict', async (req, res) => {
        apiLog(req, await evictMember(req.params.mid, req, res));
    });
}