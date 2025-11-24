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
// This module handles communication with managed externally-created VANs.
//
// - Register to get access to the AMQP connection to the management backbone
// - Reconcile the router's address table (network-style addresses) with the connected status of networks in the database
//

const Log    = require('./common/log.js').Log;
const router = require('./common/router.js');
const links  = require("./backbone-links.js");
const db     = require('./db.js');

const getNetworkIds = async function() {
    const addresses   = await router.ListAddresses(['key']);
    let   network_ids = [];
    for (const addr of addresses) {
        const kind = addr.key[0];
        const text = addr.key.slice(1);
        if (kind == 'N') {
            network_ids.push(text);
        }
    }
    return network_ids;
}

const reconcileConnectedNetworks = async function() {
    let reschedule_delay = 5000;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        let   pending_change = {};
        const network_ids = await getNetworkIds();
        const db_result = await client.query(
            "SELECT ApplicationNetworks.id, ApplicationNetworks.name, vanid, connected " +
            "FROM ApplicationNetworks " +
            "JOIN Backbones ON Backbones.id = Backbone " +
            "WHERE Backbones.managementbackbone = true"
        );
        for (const net of db_result.rows) {
            if (network_ids.indexOf(net.vanid) >= 0) {
                // The network is attached
                if (!net.connected) {
                    pending_change[net.id] = true;
                    Log(`External VAN '${net.name}' is now connected`);
                }
            } else {
                // The network is not attached
                if (net.connected) {
                    pending_change[net.id] = false;
                    Log(`External VAN '${net.name}' connection lost`);
                }
            }
        }

        for (const [vid, connected] of Object.entries(pending_change)) {
            await client.query("UPDATE ApplicationNetworks SET Connected = $2 WHERE Id = $1", [vid, connected]);
        }

        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        reschedule_delay = 10000;
    } finally {
        client.release();
        setTimeout(reconcileConnectedNetworks, reschedule_delay);
    }
}

const onRouterReady = async function() {
    await reconcileConnectedNetworks();
}

const linkAdded = async function(bbid, conn) {
    await router.Start(conn);
    await router.NotifyApiReady(onRouterReady);
}

const linkDeleted = async function(bbid) {
}

exports.Start = async function() {
    Log(`[External-VANs module starting]`);
    links.RegisterHandler(linkAdded, linkDeleted, true, false);
}
