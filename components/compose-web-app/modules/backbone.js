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

export async function BuildBackboneTable(focus) {
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

    if (focus) {
        let line = document.createElement('hr');
        line.setAttribute('width', '50%');
        line.setAttribute('align', 'left');
        section.appendChild(line);

        let title = document.createElement('h3');
        title.textContent = data[focus].name;
        section.appendChild(title);
    }
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

    const siteResult = await fetch(`/api/v1alpha1/backbones/${bbid}/sites`);
    const sites      = await siteResult.json();

    if (sites.length == 0) {
        let empty = document.createElement('i');
        empty.textContent = 'No sites in this backbone network';
        section.appendChild(empty);
    }
}