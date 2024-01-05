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

const kube   = require('./common/kube.js');
const Log    = require('./common/log.js').Log;
const db     = require('./db.js');
const crypto = require('crypto');

const hashTextTlsCertificate = async function(client, id) {
    let text = '';
    if (id) {
        const result = await client.query("SELECT Expiration from TlsCertificates WHERE Id = $1", [id]);
        text += result.rows[0].expiration;
    }
    return text;
}

const hashTextBackboneAccessPoint = async function(client, id) {
    let text = '';
    if (id) {
        const result = await client.query("SELECT Certificate, Lifecycle FROM BackboneAccessPoints WHERE Id = $1", [id]);
        if (result.rowCount == 1) {
            const rec = result.rows[0];
            text += rec.certificate + rec.lifecycle + await hashTextTlsCertificate(client, rec.certificate);
        }
    }
    return text;
}

const hashTextInteriorSite = async function(client, id) {
    let text = '';
    const result = await client.query("SELECT * FROM InteriorSites WHERE Id = $1", [id]);
    if (result.rowCount == 1) {
        const rec = result.rows[0];
        text += rec.certificate
            + rec.claimaccess
            + rec.peeraccess
            + rec.memberaccess
            + rec.managementaccess
            + await hashTextTlsCertificate(client, rec.certificate)
            + await hashTextBackboneAccessPoint(client, rec.claimaccess)
            + await hashTextBackboneAccessPoint(client, rec.peeraccess)
            + await hashTextBackboneAccessPoint(client, rec.memberaccess)
            + await hashTextBackboneAccessPoint(client, rec.managementaccess);
    } else {
        throw(Error('Site not found'));
    }
    return text;
}

const hashTextInterRouterLink = function(rec) {
    return rec.listeninginteriorsite + rec.connectinginteriorsite + rec.cost.toString();
}

exports.ComputeConfigHash = async function(siteId) {
    //
    // Backbone Site Config Hash from:
    //
    //   InteriorSite.Certificate
    //               .*Access
    //   referenced TlsCertificate.Expiration
    //   referenced BackboneAccessPoint.Certificate
    //                                 .Lifecycle
    //   referenced TlsCertificate.Expiration
    //   referencing InterRouterLink.ListeningInteriorSite
    //                              .ConnectingInteriorSite
    //                              .Cost
    //
    const client = await db.ClientFromPool();
    let text = '';
    try {
        await client.query('BEGIN');
        text = await hashTextInteriorSite(client, siteId);
        const result = await client.query("SELECT * FROM InterRouterLinks WHERE ListeningInteriorSite = $1 OR ConnectingInteriorSite = $1", [siteId]);
        for (const row of result.rows) {
            text += hashTextInterRouterLink(row);
        }
        await client.query('ROLLBACK');
    } catch (err) {
        Log(`Exception during ComputeConfigHash transaction: ${err.stack}`);
        await client.query('ROLLBACK');
        throw(err);
    } finally {
        client.release();
    }

    return crypto.createHash('sha1').update(text).digest('hex');
}
