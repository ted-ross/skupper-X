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

import { FormLayout, PollTable, SetupTable } from "./util.js";

export async function BuildVanTable() {
    const response = await fetch('api/v1alpha1/vans');
    const listdata = await response.json();
    const section  = document.getElementById("sectiondiv");
    let   panel    = document.createElement('div');
    section.appendChild(panel);
    var layout;

    if (listdata.length > 0) {
        layout = SetupTable(['Name', 'Backbone', 'Status', 'Start Time', 'End Time']);
        for (const item of listdata) {
            let row = layout.insertRow();
            row._vanid = item.id;
            let anchor = document.createElement('a');
            anchor.innerHTML = item.name;
            anchor.href = '#';
            anchor.addEventListener('click', async () => {
                await VanDetail(item.id);
            });
            row.insertCell().appendChild(anchor);                           // 0
            row.insertCell().textContent = item.backbonename;               // 1
            row.insertCell();                                               // 2
            row.insertCell().textContent = item.starttime;                  // 3
            row.insertCell().textContent = item.endtime || 'until deleted'; // 4
        }
        panel.appendChild(layout);
    } else {
        let empty = document.createElement('i');
        empty.textContent = 'No VANs Found';
        panel.appendChild(empty);
    }

    let button = document.createElement('button');
    button.addEventListener('click', async () => { await VanForm(); });
    button.textContent = 'Create VAN...';
    panel.appendChild(document.createElement('p'));
    panel.appendChild(button);

    await PollTable(panel, 5000, [
        {
            path  : `/api/v1alpha1/vans`,
            items : [
                async (van) => {
                    let result = true;
                    for (const row of layout.rows) {
                        if (row._vanid == van.id) {
                            const lifecycleCell = row.cells[2];

                            const lc = van.lifecycle;
                            if (van.failure) {
                                lc += ` (${van.failure})`;
                            }
                            if (lifecycleCell.textContent != lc) {
                                lifecycleCell.textContent = lc;
                            }
                            if (van.lifecycle != 'ready') {
                                result = false;
                            }
                        }
                    }
                    return result;
                }
            ]
        },
    ]);

    if (0) {
        let line = document.createElement('hr');
        line.setAttribute('width', '50%');
        line.setAttribute('align', 'left');
        panel.appendChild(line);

        let title = document.createElement('h3');
        title.textContent = data[focus].name;
        panel.appendChild(title);

        const siteResult = await fetch(`api/v1alpha1/vans/${focus}/members`);
        const listdata   = await siteResult.json();
        const siteData   = {};

        for (const siteItem of listdata) {
            siteData[siteItem.id] = siteItem;
        }

        if (listdata.length > 0) {
            let membertitle = document.createElement('h3');
            membertitle.textContent = 'Member Sites';
            panel.appendChild(membertitle);
            let siteTable = SetupTable(['Name', 'Status', 'Failure', 'First Active Time', 'Last Heartbeat', 'Select']);
            for (const site of Object.values(siteData)) {
                let row = siteTable.insertRow();
                row.insertCell().textContent = site.name;
                row.insertCell().textContent = site.lifecycle;
                row.insertCell().textContent = site.failure;
                row.insertCell().textContent = site.firstactivetime;
                row.insertCell().textContent = site.lastheartbeat;
                let siteAnchor = document.createElement('a');
                siteAnchor.setAttribute('href', '#');
                if (focus == site.id) {
                    siteAnchor.style.fontWeight = 'bold';
                    siteAnchor.setAttribute('onclick', `toVanTab(${focus})`);
                    siteAnchor.textContent = 'close';
                } else {
                    siteAnchor.setAttribute('onclick', `toVanTab('${focus}', '${site.id}')`);
                    siteAnchor.textContent = 'open';
                }
                row.insertCell().appendChild(siteAnchor);
            }
            panel.appendChild(siteTable);
        } else {
            let empty = document.createElement('i');
            empty.textContent = 'No Members in the VAN';
            panel.appendChild(empty);
        }
    }
}

async function VanForm() {
    let section = document.getElementById("sectiondiv");
    section.innerHTML = '<h2>Create a Virtual Application Network</h2>';

    let errorbox = document.createElement('pre');
    errorbox.className = 'errorBox';

    let vanName = document.createElement('input');
    vanName.type = 'text';

    let bbSelector = document.createElement('select');
    const bbResult = await fetch('/api/v1alpha1/backbones');
    const bbList   = await bbResult.json();
    for (const bb of bbList) {
        let option = document.createElement('option');
        option.textContent = bb.name;
        option.value       = bb.id;
        bbSelector.appendChild(option);
    }

    const form = await FormLayout(
        //
        // Form fields
        //
        [
            ['VAN Name:', vanName],
            ['Backbone:', bbSelector],
        ],

        //
        // Submit button behavior
        //
        async () => {
            const response = await fetch(`api/v1alpha1/backbones/${bbSelector.value}/vans`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name : vanName.value,
                }),
            });

            if (response.ok) {
                await toVanTab();
            } else {
                errorbox.textContent = await response.text();
            }
        },

        //
        // Cancel button behavior
        //
        async () => { await toVanTab(); }
    );

    section.appendChild(form);
    section.appendChild(errorbox);
}
