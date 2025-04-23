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
import { FormLayout, LayoutRow, PollObject, PollTable, SetupTable } from "./util.js";

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
    button.addEventListener('click', async () => { await BackboneForm(); });
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
    let section = document.getElementById("sectiondiv");
    let   panel = document.createElement('div');
    section.innerHTML = '';
    section.appendChild(panel);

    const result = await fetch(`api/v1alpha1/backbones/${bbid}`);
    const data   = await result.json();

    panel.innerHTML = `<b>Backbone: ${data.name}</b>`;

    let fields = [];
    let status = document.createElement('pre');
    // The content of this element will be filled in by the poller
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
    panel.appendChild(info);

    let hr = document.createElement('hr');
    hr.setAttribute('align', 'left');
    hr.setAttribute('width', '50%');
    panel.appendChild(hr);

    //
    // Set up the poller to live-update values on this panel
    //
    await PollObject(panel, 3000, [
        {
            path  : `/api/v1alpha1/backbones/${bbid}`,
            items : {
                'lifecycle' : (attr) => {
                    const newval = attr.replace('partial', 'not-activated');
                    if (status.textContent != newval) {
                        status.textContent = newval;
                    }
                    return newval == 'ready';
                },
            },
        },
    ]);

    await BackboneSites(bbid, panel);
}

async function BackboneSites(bbid, panel) {
    const siteResult = await fetch(`/api/v1alpha1/backbones/${bbid}/sites`);
    const sites      = await siteResult.json();
    var   layout;

    if (sites.length == 0) {
        let empty = document.createElement('i');
        empty.textContent = 'No sites in this backbone network';
        panel.appendChild(empty);
    } else {
        layout = SetupTable(['', 'Name', 'TLS Status', 'Deploy State', 'First Active Time', 'Last Heartbeat']);
        for (const site of sites) {
            let row = layout.insertRow();
            row._sid = site.id;
            row.className = 'list';
            site._row      = row;
            site._expanded = false;
            let open = document.createElement('img');
            open.src = 'images/angle-right.svg';
            open.alt = 'open';
            open.setAttribute('width', '12');
            open.setAttribute('height', '12');
            open.addEventListener('click', async () => {
                site._expanded = !site._expanded;
                open.src = site._expanded ? 'images/angle-down.svg' : 'images/angle-right.svg';
                if (site._expanded) {
                    let subrow  = layout.insertRow(site._row.rowIndex + 1);
                    subrow.insertCell();
                    let subcell = subrow.insertCell();
                    subcell.setAttribute('colspan', '6');

                    let siteDiv = document.createElement('div');
                    siteDiv.className = 'subtable';
                    subcell.appendChild(siteDiv);
                    await SitePanel(siteDiv, site);

                    let apDiv = document.createElement('div');
                    apDiv.className = 'subtable';
                    subcell.appendChild(apDiv);
                    await SiteAccessPoints(apDiv, site.id);

                    let linkDiv = document.createElement('div');
                    linkDiv.className = 'subtable';
                    subcell.appendChild(linkDiv);
                    await SiteLinks(linkDiv, bbid, site.id);
                } else {
                    layout.deleteRow(site._row.rowIndex + 1);
                }
            });
            row.insertCell().appendChild(open);       // 0
            row.insertCell().textContent = site.name; // 1
            row.insertCell().textContent;             // 2
            row.insertCell().textContent;             // 3
            row.insertCell().textContent;             // 4
            row.insertCell().textContent;             // 5
        }
        panel.appendChild(layout);
    }

    let button = document.createElement('button');
    button.addEventListener('click', async () => { await SiteForm(bbid); });
    button.textContent = 'Create Site...';
    panel.appendChild(document.createElement('p'));
    panel.appendChild(button);

    //
    // Set up the poller to live-update values on this panel
    //
    await PollTable(panel, 5000, [
        {
            path  : `/api/v1alpha1/backbones/${bbid}/sites`,
            items : [
                async (site) => {
                    for (const row of layout.rows) {
                        if (row._sid == site.id) {
                            const lifecycleCell       = row.cells[2];
                            const deploymentStateCell = row.cells[3];
                            const firstActiveCell     = row.cells[4];
                            const lastheartbeatCell   = row.cells[5];

                            if (lifecycleCell.textContent != site.lifecycle) {
                                lifecycleCell.textContent = site.lifecycle;
                            }

                            if (deploymentStateCell.textContent != site.deploymentstate) {
                                deploymentStateCell.textContent = site.deploymentstate;
                            }
                            let fa = site.firstactivetime || 'never';
                            if (firstActiveCell.textContent != fa) {
                                firstActiveCell.textContent = fa;
                            }
                            let lhb = site.lastheartbeat || 'never';
                            if (lastheartbeatCell.textContent != lhb) {
                                lastheartbeatCell.textContent = lhb;
                            }
                        }
                    }
                }
            ]
        },
    ]);
}

async function PopulateDeploymentDiv(site, div) {
    div.innerHTML = '';
    let layout = document.createElement('table');
    layout.setAttribute('cellPadding', '4');

    if (site.deploymentstate == 'ready-automatic') {
        let anchor = document.createElement('a');
        anchor.textContent = 'download site configuration';
        anchor.href = `/api/v1alpha1/backbonesite/${site.id}/kube`;
        anchor.download = `${site.name}.yaml`;
        LayoutRow(layout, ['Configure Site:', anchor]);
    }

    if (site.deploymentstate == 'ready-bootstrap') {
        let anchor1 = document.createElement('a');
        anchor1.textContent = 'download bootstrap configuration';
        anchor1.href = `/api/v1alpha1/backbonesite/${site.id}/kube`;
        anchor1.download = `${site.name}.yaml`;
        LayoutRow(layout, ['Bootstrap Step 1:', anchor1]);

        let upload = document.createElement('button');
        upload.textContent = 'Upload Ingress Data...';
        let uploadRow = LayoutRow(layout, ['Bootstrap Step 2:', upload]);
        upload.addEventListener('click', async () => {
            upload.disabled = true;
            let inputRow = layout.insertRow(uploadRow.rowIndex + 1);
            let inputCell = inputRow.insertCell();
            inputCell.setAttribute('colspan', '2');
            let inputDiv = document.createElement('div');
            inputCell.appendChild(inputDiv);

            let textInput = document.createElement('textarea');
            textInput.style.marginBottom = '5px';
            textInput.style.width = '100%';
            textInput.style.height = '150px';
            inputDiv.appendChild(textInput);
            let ebox = document.createElement('textarea');
            ebox.className = 'errorBox';
            ebox.style.width = '100%';

            let submit = document.createElement('button');
            submit.textContent = 'Submit';
            submit.addEventListener('click', async () => {
                const result = await fetch(`/api/v1alpha1/backbonesite/${site.id}/ingress`, {
                    method : 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: textInput.value,
                });
                if (result.ok) {
                    inputDiv.innerHTML = '<center>Ingress Data Uploaded</center>';
                    upload.disabled = false;
                } else {
                    const message = await result.text();
                    ebox.textContent = `Error: ${message}`;
                    upload.disabled = false;
                }
            });
            inputDiv.appendChild(submit);

            let cancel = document.createElement('button');
            cancel.style.marginLeft = '5px';
            cancel.style.marginBottom = '5px';
            cancel.textContent = 'Cancel';
            cancel.addEventListener('click', () => {
                layout.deleteRow(inputRow.rowIndex);
                upload.disabled = false;
            });
            inputDiv.appendChild(cancel);
            inputDiv.appendChild(ebox);
        });

        let anchor2 = document.createElement('a');
        anchor2.textContent = 'download finishing configuration';
        anchor2.href = `/api/v1alpha1/backbonesite/${site.id}/accesspoints/kube`;
        anchor2.download = `${site.name}-finish.yaml`;
        LayoutRow(layout, ['Bootstrap Step 3:', anchor2]);
    }

    div.appendChild(layout);
}

async function SitePanel(div, site) {
    div.innerHTML = '';

    let layout = document.createElement('table');
    layout.setAttribute('cellPadding', '4');

    let tlsExpiration   = document.createElement('div');
    let tlsRenewal      = document.createElement('div');
    let deploymentState = document.createElement('div');

    LayoutRow(layout, ['Target Platform:',            site.platformlong]);
    LayoutRow(layout, ['TLS Certificate Expiration:', tlsExpiration]);
    LayoutRow(layout, ['TLS Certificate Renewal:',    tlsRenewal]);
    LayoutRow(layout, ['Deployment State:',           deploymentState]);

    let deploymentRow = layout.insertRow();
    let deploymentCell = deploymentRow.insertCell();
    deploymentCell.setAttribute('colspan', 2);
    let deploymentDiv = document.createElement('div');
    deploymentCell.appendChild(deploymentDiv);
    await PopulateDeploymentDiv(site, deploymentDiv);

    //
    // Set up the poller to live-update values on this panel
    //
    await PollObject(div, 3000, [
        {
            path  : `/api/v1alpha1/backbonesites/${site.id}`,
            items : {
                'tlsexpiration' : async (attr) => {
                    if (tlsExpiration.textContent != attr) {
                        tlsExpiration.textContent = attr;
                    }
                },
                'tlsrenewal' : async (attr) => {
                    if (tlsRenewal.textContent != attr) {
                        tlsRenewal.textContent = attr;
                    }
                },
                'deploymentstate' : async (attr) => {
                    if (deploymentState.textContent != attr) {
                        deploymentState.textContent = attr;
                        site.deploymentstate = attr;
                        await PopulateDeploymentDiv(site, deploymentDiv);
                    }
                    return attr == 'deployed';
                },
            },
        },
    ]);

    div.appendChild(layout);
}

async function SiteAccessPoints(div, siteId) {
    const max_hostname = 50;
    div.innerHTML = '<b>Access Points (incoming):</b><p />';
    const result = await fetch(`/api/v1alpha1/backbonesites/${siteId}/accesspoints`);
    const aplist = await result.json();
    if (aplist.length == 0) {
        let empty = document.createElement('i');
        empty.textContent = 'No access points for this backbone site';
        div.appendChild(empty);
    } else {
        let table = SetupTable(['Name', 'Kind', 'TLS Status', 'Bind', 'Host', 'Port']);
        for (const ap of aplist) {
            let row = table.insertRow();
            row._apid = ap.id;
            row.insertCell().textContent = ap.name;
            row.insertCell().textContent = ap.kind;
            row.insertCell();
            row.insertCell().textContent = ap.bindhost || '-';
            row.insertCell();
            row.insertCell();
        }
        div.appendChild(table);
        
        //
        // Set up the poller to live-update values on this panel
        //
        await PollTable(div, 3000, [
            {
                path  : `/api/v1alpha1/backbonesites/${siteId}/accesspoints`,
                items : [
                    async (ap) => {
                        let result = false;
                        for (const row of table.rows) {
                            if (row._apid == ap.id) {
                                const lifecycleCell = row.cells[2];
                                const hostnameCell  = row.cells[4];
                                const portCell      = row.cells[5];

                                if (lifecycleCell.textContent != ap.lifecycle) {
                                    lifecycleCell.textContent = ap.lifecycle;
                                }

                                let hostname = (ap.hostname || '-').slice(0, max_hostname);
                                if (ap.hostname && ap.hostname.length > max_hostname) {
                                    hostname += '...';
                                }
                                if (hostnameCell.textContent != hostname) {
                                    hostnameCell.textContent = hostname;
                                }
                                let port = ap.port || '-';
                                if (portCell.textContent != port) {
                                    portCell.textContent = port;
                                }

                                result = ap.lifecycle == 'ready';
                            }
                        }
                        return result;
                    }
                ]
            },
        ]);
    }

    let button = document.createElement('button');
    button.addEventListener('click', async () => { await AccessPointForm(div, siteId) });
    button.textContent = 'Create Access Point...';
    div.appendChild(document.createElement('p'));
    div.appendChild(button);
}

async function SiteLinks(div, bbid, siteId) {
    div.innerHTML = '<b>Inter-Router Links (outgoing):</b><p />';
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
            targetSiteNames[ap.id] = `${ap.sitename}/${ap.name}`;
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

    //
    // Populate the platform selector
    //
    let platformSelector = document.createElement('select');
    const psResult  = await fetch('/api/v1alpha1/targetplatforms');
    const platforms = await psResult.json();
    for (const platform of platforms) {
        let option = document.createElement('option');
        option.value       = platform.shortname;
        option.textContent = platform.longname;
        platformSelector.appendChild(option);
    }

    const form = await FormLayout(
        //
        // Form fields
        //
        [
            ['Site Name:', siteName],
            ['Target Platform:', platformSelector]
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
                    name     : siteName.value,
                    platform : platformSelector.value,
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
