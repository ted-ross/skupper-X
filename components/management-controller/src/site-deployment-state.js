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

//
// This module is responsible for maintaining the deployment-state for interior sites.
//

const Log = require('./common/log.js').Log;
const db  = require('./db.js');

const evaluateSingleSite_TX = async function (client, site) {
    let state = 'not-ready';

    if (site.lifecycle == 'active') {
        state = 'deployed';
    } else if (site.lifecycle == 'ready') {
        //
        // If this site is the connecting-site of a link to a 'deployed' site, it is ready for automatic deployment.
        // If not, and the site has a 'manage' ingress, it is ready for bootstrap deployment.
        //
        const result = await client.query("SELECT InteriorSites.DeploymentState FROM InterRouterLinks " +
                                          "JOIN InteriorSites ON InteriorSites.Id = ListeningInteriorSite " +
                                          "WHERE ConnectingInteriorSite = $1 AND InteriorSites.DeploymentState = 'deployed'", [site.id]);
        if (result.rowCount > 0) {
            state = 'ready-automatic';
        } else if (site.manageaccess) {
            state = 'ready-bootstrap';
        }
    }

    if (state != site.deploymentstate) {
        await client.query("UPDATE InteriorSites SET DeploymentState = $1 WHERE Id = $2", [state, site.id]);
    }
}

exports.SiteLifecycleChanged = async function(siteId, newState) {
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT Id, Lifecycle, DeploymentState, ManageAccess FROM InteriorSites WHERE Id = $1", [siteId]);
        if (result.rowCount == 1) {
            const site = result.rows[0];
            await evaluateSingleSite_TX(client, site);
            if (newState == 'active') {
                //
                // If this site became active, evaluate all sites connected to this site
                //
                const connected = await client.query("SELECT InteriorSites.Id as Id, InteriorSites.Lifecycle, InteriorSites.DeploymentState, InteriorSites.ManageAccess, InterRouterLinks.Id as LinkId FROM InterRouterLinks " +
                                                     "JOIN InteriorSites ON InteriorSites.Id = ConnectingInteriorSite " +
                                                     "WHERE ListeningInteriorSite = $1", [siteId]);
                for (const linkSite of connected.rows) {
                    await evaluateSingleSite_TX(client, linkSite);
                }
            }
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`Exception in SiteLifecycleChanged: ${error.message}`);
        Log(error.stack);
    } finally {
        client.release();
    }
}

exports.LinkAddedOrDeleted = async function(connectingSiteId, listeningSiteId) {
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        //
        // If listening site is "deployed", re-evaluate the connecting site
        //
        const lResult = await client.query("SELECT DeploymentState from InteriorSites WHERE Id = $1", [listeningSiteId]);
        if (lResult.rowCount == 1 && lResult.rows[0].deploymentstate == 'deployed') {
            const cResult = await client.query("SELECT Id, Lifecycle, DeploymentState, ManageAccess FROM InteriorSites WHERE Id = $1", [connectingSiteId]);
            if (cResult.rowCount == 1) {
                await evaluateSingleSite_TX(client, cResult.rows[0]);
            }
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`Exception in LinkAddedOrDeleted: ${error.message}`);
        Log(error.stack);
    } finally {
        client.release();
    }
}

exports.ManageIngressAdded = async function(siteId) {
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT Id, Lifecycle, DeploymentState, ManageAccess FROM InteriorSites WHERE Id = $1", [siteId]);
        if (result.rowCount == 1) {
            const site = result.rows[0];
            if (site.deploymentstate == 'not-ready') {
                await evaluateSingleSite_TX(client, site);
            }
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`Exception in ManageIngressAdded: ${error.message}`);
        Log(error.stack);
    } finally {
        client.release();
    }
}

exports.ManageIngressDeleted = async function(siteId) {
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT Id, Lifecycle, DeploymentState, ManageAccess FROM InteriorSites WHERE Id = $1", [siteId]);
        if (result.rowCount == 1) {
            const site = result.rows[0];
            if (site.deploymentstate == 'ready-bootstrap') {
                await evaluateSingleSite_TX(client, site);
            }
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`Exception in ManageIngressDeleted: ${error.message}`);
        Log(error.stack);
    } finally {
        client.release();
    }
}
