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

import { ConfirmDialog, LayoutRow } from "./util.js";

export async function DetailTab(parent, van) {
    parent.innerHTML = '';
    let panel = document.createElement('div');
    parent.appendChild(panel);

    let errorbox = document.createElement('pre');
    errorbox.className = 'errorBox';

    let layout = document.createElement('table');
    layout.setAttribute('cellPadding', '4');

    LayoutRow(layout, ['VAN Name:', van.name]);

    if (van.managementbackbone) {
        LayoutRow(layout, ['Status:', 'Never Connected']);
        LayoutRow(layout, ['Onboard Time:', van.starttime]);
        LayoutRow(layout, ['Network ID:', van.vanid]);

        let site = document.createElement('i');
        site.innerHTML = 'none';
        LayoutRow(layout, ['Connected Site:', site])

        let backupsites = document.createElement('i');
        backupsites.innerHTML = 'none';
        LayoutRow(layout, ['Backup Sites:', backupsites])
    } else {
        LayoutRow(layout, ['Start Time:', van.starttime]);
        LayoutRow(layout, ['TLS Status:', van.lifecycle == 'failed' ? `${van.lifecycle} - ${van.failure}` : van.lifecycle]);
        LayoutRow(layout, ['End Time:', van.endtime]);
        //LayoutRow(layout, ['Delete Delay:', van.deletedelay]);

        const tlsResult = await fetch(`/api/v1alpha1/tls-certificates/${van.certificate}`);
        if (tlsResult.ok) {
            const cert = await tlsResult.json();
            LayoutRow(layout, ['CA Expiration:', cert.expiration]);
            LayoutRow(layout, ['CA Renewal Time:', cert.renewaltime]);
        }

        let evict = document.createElement('button');
        evict.textContent = 'Evict VAN...';
        evict.onclick = async () => {
            let confirm = await ConfirmDialog(
                'Eviction will cause all VAN members to be disconnected and all invitations to be expired',
                'Confirm Eviction',
                async () => {
                    const response = await fetch(`/api/v1alpha1/vans/${van.id}/evict`, { method : 'PUT' });
                    if (!response.ok) {
                        let error = await response.text();
                        errorbox.textContent = error;
                    }
                }
            );
            panel.appendChild(confirm);
        };
        LayoutRow(layout, [evict]);
    }

    let deleteVan = document.createElement('button');
    deleteVan.textContent = 'Delete VAN...';
    deleteVan.onclick = async () => {
        let confirm = await ConfirmDialog (
            'Confirm that you wish to delete this VAN',
            'Confirm Deletion',
            async () => {
                const response = await fetch(`/api/v1alpha1/vans/${van.id}`, { method : 'DELETE' });
                let text = await response.text();
                if (!response.ok) {
                    errorbox.textContent = text;
                } else {
                    toVanTab();
                }
            }
        );
        panel.appendChild(confirm);
    };
    LayoutRow(layout, [deleteVan]);

    panel.appendChild(layout);
    panel.appendChild(errorbox);
}