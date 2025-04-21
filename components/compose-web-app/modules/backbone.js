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

import { toBackboneTab } from "../page.js";
import { FormLayout, SetupTable } from "./util.js";

export async function BuildBackboneTable() {
    const response = await fetch('api/v1alpha1/backbones');
    const listdata = await response.json();
    let   section  = document.getElementById("sectiondiv");
    let   data     = {};

    for (const item of listdata) {
        data[item.id] = item;
    }

    if (listdata.length > 0) {
        let table = SetupTable(['Name', 'Status', 'Failure']);
        for (const item of Object.values(data)) {
            let row = table.insertRow();
            let anchor = document.createElement('a');
            anchor.innerHTML = item.name;
            anchor.href = '#';
            anchor.addEventListener('click', async () => {
                await BackboneDetail(item.id);
            });
            row.insertCell().appendChild(anchor);
            row.insertCell().textContent = item.lifecycle.replace('partial', 'not-activated');
            row.insertCell().textContent = item.failure || '';
        }

        section.appendChild(table);
    } else {
        let empty = document.createElement('i');
        empty.textContent = 'No Backbones Found';
        section.appendChild(empty);
    }

    let button = document.createElement('button');
    button.addEventListener('click', () => { BackboneForm(); });
    button.textContent = 'Create Backbone...';
    section.appendChild(document.createElement('p'));
    section.appendChild(button);
}

async function BackboneForm() {
    let section = document.getElementById("sectiondiv");
    section.innerHTML = '<h2>Create a Backbone Network</h2>';

    let errorbox = document.createElement('pre');
    errorbox.className = 'errorBox';

    let bbName = document.createElement('input');
    bbName.type = 'text';

    const form = await FormLayout(
        //
        // Form fields
        //
        [
            ['Backbone Name:', bbName],
        ],

        //
        // Submit button behavior
        //
        async () => {
            const response = await fetch('api/v1alpha1/backbones', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name : bbName.value,
                }),
            });
        
            if (response.ok) {
                await toBackboneTab();
            } else {
                errorbox.textContent = await response.text();
            }
        },

        //
        // Cancel button behavior
        //
        async () => { await toBackboneTab(); }
    );

    section.appendChild(form);
    section.appendChild(errorbox);
}

async function BackboneDetail(bbid) {
    let   section = document.getElementById("sectiondiv");
    const result  = await fetch(`api/v1alpha1/backbones/${bbid}`);
    const data    = await result.json();

    section.innerHTML = `<h2>${data.name}</h2>`;

    let fields = [];
    let status = document.createElement('pre');
    status.textContent = data.lifecycle.replace('partial', 'not-activated');
    if (data.failure) {
        status.textContent += `, failure: ${data.failure}`;
    }
    fields.push(['Status:', status]);

    if (data.lifecycle == 'partial') {
        let activateButton = document.createElement('button');
        activateButton.textContent = 'Activate';
        activateButton.addEventListener('click', async () => {
            let result = await fetch(`/api/v1alpha1/backbones/${bbid}/activate`, { method: 'PUT' });
            await BackboneDetail(bbid);
        });
        fields.push(['', activateButton]);
    }

    let deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async () => {
        await fetch(`/api/v1alpha1/backbones/${bbid}`, { method: 'DELETE' });
        await toBackboneTab();
    });
    fields.push(['', deleteButton]);

    const info = await FormLayout(fields);
    section.appendChild(info);

    let hr = document.createElement('hr');
    hr.setAttribute('align', 'left');
    hr.setAttribute('width', '50%');
    section.appendChild(hr);

    BackboneSites(bbid, section);
}

async function BackboneSites(bbid, section) {
    const siteResult = await fetch(`/api/v1alpha1/backbones/${bbid}/sites`);
    const sites      = await siteResult.json();

    if (sites.length == 0) {
        let empty = document.createElement('i');
        empty.textContent = 'No sites in this backbone network';
        section.appendChild(empty);
    } else {
        let table = SetupTable(['', 'Name', 'TLS Status', 'Deploy State', 'First Active Time', 'Last Heartbeat', 'Actions']);
        for (const site of sites) {
            let row = table.insertRow();
            site._row      = row;
            site._expanded = false;
            let open = document.createElement('img');
            open.src = 'images/angle-right.svg';
            open.alt = 'open';
            open.setAttribute('width', '10');
            open.setAttribute('height', '10');
            open.addEventListener('click', async () => {
                site._expanded = !site._expanded;
                open.src = site._expanded ? 'images/angle-down.svg' : 'images/angle-right.svg';
                if (site._expanded) {
                    let subrow  = table.insertRow(site._row.rowIndex + 1);
                    subrow.insertCell();
                    let subcell = subrow.insertCell();
                    subcell.setAttribute('colspan', '6');

                    let apDiv = document.createElement('div');
                    apDiv.className = 'subtable';
                    apDiv.style.marginBottom ='5px';
                    subcell.appendChild(apDiv);
                    await SiteAccessPoints(apDiv, site.id);

                    let linkDiv = document.createElement('div');
                    linkDiv.className = 'subtable';
                    subcell.appendChild(linkDiv);
                    await SiteLinks(linkDiv, bbid, site.id);
                } else {
                    table.deleteRow(site._row.rowIndex + 1);
                }
            });
            row.insertCell().appendChild(open);
            row.insertCell().textContent = site.name;
            row.insertCell().textContent = site.lifecycle;
            row.insertCell().textContent = site.deploymentstate;
            row.insertCell().textContent = site.firstactivetime || 'never';
            row.insertCell().textContent = site.lastheartbeat || 'never';
        }
        section.appendChild(table);
    }

    let button = document.createElement('button');
    button.addEventListener('click', async () => { await SiteForm(bbid); });
    button.textContent = 'Create Site...';
    section.appendChild(document.createElement('p'));
    section.appendChild(button);
}

async function SiteAccessPoints(div, siteId) {
    div.innerHTML = '<b>Access Points:</b><p />';
    const result = await fetch(`/api/v1alpha1/backbonesites/${siteId}/accesspoints`);
    const aplist = await result.json();
    if (aplist.length == 0) {
        let empty = document.createElement('i');
        empty.textContent = 'No access points for this backbone site';
        div.appendChild(empty);
    } else {
        let table = SetupTable(['Name', 'Kind', 'TLS Status', 'Bind Host']);
        for (const ap of aplist) {
            let row = table.insertRow();
            row.insertCell().textContent = ap.name;
            row.insertCell().textContent = ap.kind;
            row.insertCell().textContent = ap.lifecycle;
            row.insertCell().textContent = ap.bindhost || '-';
        }
        div.appendChild(table);
    }

    let button = document.createElement('button');
    button.addEventListener('click', async () => { await AccessPointForm(div, siteId) });
    button.textContent = 'Create Access Point...';
    div.appendChild(document.createElement('p'));
    div.appendChild(button);
}

async function SiteLinks(div, bbid, siteId) {
    div.innerHTML = '<b>Inter-Router Links:</b><p />';
    const apResult = await fetch(`/api/v1alpha1/backbones/${bbid}/accesspoints`);
    const apList   = await apResult.json();
    const result   = await fetch(`/api/v1alpha1/backbonesites/${siteId}/links`);
    const linklist = await result.json();
    if (linklist.length == 0) {
        let empty = document.createElement('i');
        empty.textContent = 'No inter-router links from this backbone site';
        div.appendChild(empty);
    } else {
        let targetSiteNames = {};
        for (const ap of apList) {
            targetSiteNames[ap.id] = ap.sitename;
        }
        let table = SetupTable(['Peer Site', 'Cost']);
        for (const link of linklist) {
            let row = table.insertRow();
            row.insertCell().textContent = targetSiteNames[link.accesspoint];
            row.insertCell().textContent = link.cost;
        }
        div.appendChild(table);
    }

    let button = document.createElement('button');
    button.addEventListener('click', async () => { await LinkForm(div, bbid, siteId) });
    button.textContent = 'Create Link...';
    div.appendChild(document.createElement('p'));
    div.appendChild(button);
}

async function SiteForm(bbid) {
    let section = document.getElementById("sectiondiv");
    section.innerHTML = '<b>Create a Backbone Site</b>';

    let errorbox = document.createElement('pre');
    errorbox.className = 'errorBox';

    let siteName = document.createElement('input');
    siteName.type = 'text';

    const form = await FormLayout(
        //
        // Form fields
        //
        [
            ['Site Name:', siteName],
        ],

        //
        // Submit button behavior
        //
        async () => {
            const response = await fetch(`api/v1alpha1/backbones/${bbid}/sites`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name : siteName.value,
                }),
            });

            if (response.ok) {
                await BackboneDetail(bbid);
            } else {
                errorbox.textContent = await response.text();
            }
        },

        //
        // Cancel button behavior
        //
        async () => { await BackboneDetail(bbid); }
    );

    section.appendChild(form);
    section.appendChild(errorbox);
}

async function AccessPointForm(div, siteId) {
    div.innerHTML = '<b>Create an Access Point</b>';

    let errorbox = document.createElement('pre');
    errorbox.className = 'errorBox';

    let apName = document.createElement('input');
    apName.type = 'text';

    let kindSelector = document.createElement('select');
    for (const k of ['claim', 'peer', 'member', 'manage']) {
        let option = document.createElement('option');
        option.value = k;
        option.textContent = k;
        kindSelector.appendChild(option);
    }

    let bindHost = document.createElement('input');
    bindHost.type = 'text';

    const form = await FormLayout(
        //
        // Form fields
        //
        [
            ['Kind:',              kindSelector],
            ['Access Point Name:', apName],
            ['Bind Host:',         bindHost],
        ],

        //
        // Submit button behavior
        //
        async () => {
            let body = {
                name     : apName.value,
                kind     : kindSelector.value,
            };
            if (bindHost.value != '') {
                body.bindhost = bindHost.value;
            }
            const response = await fetch(`api/v1alpha1/backbonesites/${siteId}/accesspoints`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            if (response.ok) {
                await SiteAccessPoints(div, siteId);
            } else {
                errorbox.textContent = await response.text();
            }
        },

        //
        // Cancel button behavior
        //
        async () => { await SiteAccessPoints(div, siteId); }
    );

    div.appendChild(form);
    div.appendChild(errorbox);
}

async function LinkForm(div, bbid, siteId) {
    div.innerHTML = '<b>Create an inter-router link</b>';

    let errorbox = document.createElement('pre');
    errorbox.className = 'errorBox';

    let peerSelector = document.createElement('select');
    const siteResult = await fetch(`/api/v1alpha1/backbones/${bbid}/sites`);
    const siteList   = await siteResult.json();
    const apResult   = await fetch(`/api/v1alpha1/backbones/${bbid}/accesspoints`);
    const apList     = await apResult.json();

    //
    // Annotate each site with its peer access points
    //
    for (const site of siteList) {
        site._peeraps = [];
        if (site.id != siteId) {
            for (const ap of apList) {
                if (ap.kind == 'peer' && ap.interiorsite == site.id) {
                    site._peeraps.push(ap);
                }
            }
        }
    }

    //
    // Populate the site selector
    //
    for (const site of siteList) {
        if (site._peeraps.length > 0) {
            for (const pap of site._peeraps) {
                let option = document.createElement('option');
                option.value = pap.id;
                option.textContent = `${site.name}/${pap.name}`;
                peerSelector.appendChild(option);
            }
        }
    }

    let cost = document.createElement('input');
    cost.type = 'text';
    cost.value = '1';
    cost.textContent = '1';

    const form = await FormLayout(
        //
        // Form fields
        //
        [
            ['Destination Site / Access Point:', peerSelector],
            ['Link Cost:',                       cost],
        ],

        //
        // Submit button behavior
        //
        async () => {
            let body = {
                connectingsite : siteId,
                cost           : cost.value,
            };
            const response = await fetch(`api/v1alpha1/accesspoints/${peerSelector.value}/links`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            if (response.ok) {
                await SiteLinks(div, bbid, siteId);
            } else {
                errorbox.textContent = await response.text();
            }
        },

        //
        // Cancel button behavior
        //
        async () => { await SiteLinks(div, bbid, siteId); }
    );

    div.appendChild(form);
    div.appendChild(errorbox);
}
