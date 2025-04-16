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

import { SetupTable } from "./util.js";

export async function BuildVanTable(focus) {
    const response = await fetch('api/v1alpha1/vans');
    const listdata = await response.json();
    let   section  = document.getElementById("sectiondiv");
    let   data     = {};

    for (const item of listdata) {
        data[item.id] = item;
    }

    if (listdata.length > 0) {
        let table = SetupTable(['Name', 'Backbone', 'Status', 'Failure', 'Start Time', 'End Time', 'Select']);
        for (const item of Object.values(data)) {
            let row = table.insertRow();
            row.insertCell().textContent = item.name;
            row.insertCell().textContent = item.backbonename;
            row.insertCell().textContent = item.lifecycle.replace('partial', 'not-activated');
            row.insertCell().textContent = item.failure || '';
            row.insertCell().textContent = item.starttime;
            row.insertCell().textContent = item.endtime || 'until deleted';
            let anchor = document.createElement('a');
            anchor.setAttribute('href', '#');
            if (focus == item.id) {
                anchor.style.fontWeight = 'bold';
                anchor.setAttribute('onclick', `toVanTab()`);
                anchor.textContent = 'close';
            } else {
                anchor.setAttribute('onclick', `toVanTab('${item.id}')`);
                anchor.textContent = 'open';
            }
            row.insertCell().appendChild(anchor);
        }

        section.appendChild(table);
    } else {
        let empty = document.createElement('i');
        empty.textContent = 'No VANs Found';
        section.appendChild(empty);
    }

    let button = document.createElement('button');
    button.setAttribute('onclick', `VanForm()`);
    button.textContent = 'Create VAN...';
    section.appendChild(document.createElement('p'));
    section.appendChild(button);

    if (focus) {
        let line = document.createElement('hr');
        line.setAttribute('width', '50%');
        line.setAttribute('align', 'left');
        section.appendChild(line);

        let title = document.createElement('h3');
        title.textContent = data[focus].name;
        section.appendChild(title);

        const siteResult = await fetch(`api/v1alpha1/vans/${focus}/members`);
        const listdata   = await siteResult.json();
        const siteData   = {};

        for (const siteItem of listdata) {
            siteData[siteItem.id] = siteItem;
        }

        if (listdata.length > 0) {
            let membertitle = document.createElement('h3');
            membertitle.textContent = 'Member Sites';
            section.appendChild(membertitle);
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
            section.appendChild(siteTable);
        } else {
            let empty = document.createElement('i');
            empty.textContent = 'No Members in the VAN';
            section.appendChild(empty);
        }
    }
}

