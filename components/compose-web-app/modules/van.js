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

import { InvitationsTab } from "./invitations.js";
import { MembersTab } from "./members.js";
import { TabSheet } from "./tabsheet.js";
import { FormLayout, PollTable, SetupTable } from "./util.js";
import { DetailTab } from "./vandetail.js";

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

    let startTimeGroup = document.createElement('div');
    startTimeGroup.className = 'onerow';
    let startTime = document.createElement('input');
    startTime.type = 'datetime-local';
    startTime.disabled = true;
    let startNow = document.createElement('input');
    startNow.type = 'checkbox';
    startNow.checked = true;
    startNow.onclick = () => {
        if (startNow.checked) {
            startTime.value = '';
            startTime.disabled = true;
        } else {
            startTime.disabled = false;
        }
    }
    let startLabel = document.createElement('div');
    startLabel.textContent = 'Start Immediately';
    startTimeGroup.appendChild(startTime);
    startTimeGroup.appendChild(startNow);
    startTimeGroup.appendChild(startLabel);

    let endTimeGroup = document.createElement('div');
    endTimeGroup.className = 'onerow';
    let endTime = document.createElement('input');
    endTime.type = 'datetime-local';
    endTime.disabled = true;
    let endSet = document.createElement('input');
    endSet.type = 'checkbox';
    endSet.style.marginLeft = '5px';
    endSet.checked = true;
    endSet.onclick = () => {
        if (endSet.checked) {
            endTime.value = '';
            endTime.disabled = true;
        } else {
            endTime.disabled = false;
        }
    }
    let endLabel = document.createElement('div');
    endLabel.textContent = 'No End Time';
    endTimeGroup.appendChild(endTime);
    endTimeGroup.appendChild(endSet);
    endTimeGroup.appendChild(endLabel);

    const form = await FormLayout(
        //
        // Form fields
        //
        [
            ['VAN Name:',   vanName],
            ['Backbone:',   bbSelector],
            ['Start Time:', startTimeGroup],
            ['End Time:',   endTimeGroup],
        ],

        //
        // Submit button behavior
        //
        async () => {
            let body = { name : vanName.value };
            if (!startNow.checked) {
                body.starttime = startTime.value;
            }
            if (!endSet.checked) {
                body.endtime = endTime.value;
            }
            const response = await fetch(`api/v1alpha1/backbones/${bbSelector.value}/vans`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
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
    vanName.focus();
}

async function VanDetail(vanId) {
    const section  = document.getElementById("sectiondiv");
    let   panel    = document.createElement('div');
    section.innerHTML = '';
    section.appendChild(panel);

    const vanResult = await fetch(`/api/v1alpha1/vans/${vanId}`);
    const van       = await vanResult.json();
    console.log('van', van);

    let title = document.createElement('b');
    title.textContent = `Virtual Application Network: ${van.name}`;
    panel.appendChild(title);

    let tabsheet = await TabSheet([
        {
            title        : 'VAN Details',
            selectAction : async (panel) => { DetailTab(panel, van); },
            enabled      : true,
        },
        {
            title        : 'Invitations',
            selectAction : async (panel) => { InvitationsTab(panel, van); },
            enabled      : true,
        },
        {
            title        : 'Members',
            selectAction : async (panel) => { MembersTab(panel, van); },
            enabled      : true,
        },
    ]);

    panel.appendChild(tabsheet);
}
