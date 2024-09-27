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
// This module handles the synchronization of application state between the management controller and
// member sites.
//
// Member-site application state:
//   Pods       - Represent allocated components for which there is an image spec            [ skx-<id> ]
//   Connectors - Config maps representing interfaces exposed from this site (role: accept)  [ skx-connector-<ordinal>-<id> ]
//   Listeners  - Config maps representing interfaces uses from this site    (role: connect) [ skx-listener-<id> ]
//

const Log        = require('./common/log.js').Log;
const common     = require('./common/common.js');
const util       = require('./common/util.js');
const db         = require('./db.js');
const kube       = require('./common/kube.js');
const templates  = require('./site-templates.js');

const getMemberInfo_TX = async function(client, memberId) {
    const siteResult = await client.query("SELECT MemberOf, SiteClasses FROM MemberSites WHERE Id = $1", [memberId]);
    if (siteResult.rowCount != 1) {
        throw Error(`Member site ${memberId} not found (${siteResult.rowCount})`);
    }
    const vanId       = siteResult.rows[0].memberof;
    const siteClasses = siteResult.rows[0].siteclasses;

    return [vanId, siteClasses];
}

const getAppForSite_TX = async function(client, vanId, siteClasses) {
    var appTemplates = [];

    //
    // Query for every application template that has been instantiated on this VAN
    //
    const atResult = await client.query(
        "SELECT ApplicationTemplates.Id as atid, Name " +
        "FROM ApplicationTemplates " +
        "JOIN Applications ON ApplicationTemplate = ApplicationTemplates.Id " +
        "WHERE Applications.ApplicationNetwork = $1",
        [vanId]
    );

    for (const at of atResult.rows) {
        let appTemplate = {
            id         : at.atid,
            name       : at.name,
            components : [],
        };

        //
        // Query for every component from this application template that is allocated to this site
        //
        const cResult = await client.query(
            "SELECT Components.Id as cid, ComponentTypes.Id as ctid, Name, ImageName, DefaultImageTag, ImageTag " +
            "FROM Components " +
            "JOIN ComponentTypes ON ComponentTypes.Id = ComponentType " +
            "WHERE ApplicationTemplate = $1 AND SiteClasses && $2",
            [at.atid, siteClasses]
        );

        for (const c of cResult.rows) {
            let component = {
                id         : c.cid,
                typeId     : c.ctid,
                name       : c.name,
                imageName  : c.imagename,
                imageTag   : c.imagetag || c.defaultimagetag,
                interfaces : [],
            };

            const iResult = await client.query(
                "SELECT Interfaces.Id as iid, Role, HostNameUsed, ActualPort, DefaultPort, TransportProtocol, ApplicationProtocol, Bindings.Id as bid, Bindings.Distribution, Bindings.Scope, Bindings.VanAddress " +
                "FROM Interfaces " +
                "JOIN InterconnectTypes ON InterconnectTypes.Id = InterconnectType " +
                "JOIN Bindings ON Bindings.Interfaces @> ARRAY[Interfaces.Id] " +
                "WHERE ComponentType = $1",
                [c.ctid]
            );

            for (const i of iResult.rows) {
                let iface = {
                    id                  : i.iid,
                    bindingId           : i.bid,
                    role                : i.role,
                    hostNameUsed        : i.hostnameused,
                    port                : i.actualport || i.defaultport,
                    transportProtocol   : i.transportprotocol,
                    applicationProtocol : i.applicationprotocol,
                    distribution        : i.distribution,
                    scope               : i.scope,
                    address             : i.vanaddress,
                };
                component.interfaces.push(iface);
            }
            appTemplate.components.push(component);
        }
        appTemplates.push(appTemplate);
    }

    return appTemplates;
}

const classMatch = function (leftClasses, rightClasses) {
    for (const lc of leftClasses) {
        if (rightClasses.indexOf(lc) >= 0) {
            return true;
        }
    }
    return false;
}

const getStateHashesForSite_TX = async function(client, memberId, vanId, siteClasses) {
    let stateHashes = {};
    const siteData = await getAppForSite_TX(client, vanId, siteClasses);

    Log('APP STATE:');
    Log(siteData);

    for (const appTemplate of siteData) {
        for (const component of appTemplate.components) {
            stateHashes[`skx-pod-${component.id}`] = templates.HashOfObjectNoChildren(component);
            for (const iface of component.interfaces) {
                stateHashes[`skx-${iface.role}-${iface.bindingId}`] = templates.HashOfObjectNoChildren(iface);
            }
        }
    }

    return stateHashes;
}

const getStateForSite_TX = async function(client, memberId, vanId, siteClasses, stateKey) {
    // TODO - Return [hash, data] for a particular stateKey.
}

exports.onMewMember = async function(memberId, localState, remoteState) {
    const revertLocalState  = localState;
    const revertRemoteState = remoteState;

    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const [vanId, siteClasses] = await getMemberInfo_TX(client, memberId);

        const state = await getStateHashesForSite_TX(client, memberId, vanId, siteClasses);
        for (const [key, hash] of Object.entries(state)) {
            remoteState[key] = hash;
        }
    
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`SyncApp - Exception in new member processing: ${error.message}`);
        Log(error.stack);
        localState  = revertLocalState;
        remoteState = revertRemoteState;
    } finally {
        client.release();
    }

    return [localState, remoteState];
}

exports.StateRequest = async function(memberId, stateKey) {
    var hash = null;
    var data = {};

    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const [vanId, siteClasses] = await getMemberInfo_TX(client, memberId);
        [hash, data] = await getStateForSite_TX(client, memberId, vanId, siteClasses, stateKey);
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`SyncApp - Exception in state-request for key ${stateKey}: ${error.message}`);
        hash = null;
        data = {};
    } finally {
        client.release();
    }

    return [hash, data];
}