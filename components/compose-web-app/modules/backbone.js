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

export async function BuildBackboneTable(focus) {
    const response = await fetch('api/v1alpha1/backbones');
    const listdata = await response.json();
    let   section  = document.getElementById("sectiondiv");
    let   data     = {};

    for (const item of listdata) {
        data[item.id] = item;
    }

    if (listdata.length > 0) {
        let table = SetupTable(['Name', 'Status', 'Failure', 'Select']);
        for (const item of Object.values(data)) {
            let row = table.insertRow();
            row.insertCell().textContent = item.name;
            row.insertCell().textContent = item.lifecycle.replace('partial', 'not-activated');
            row.insertCell().textContent = item.failure || '';
            let anchor = document.createElement('a');
            anchor.setAttribute('href', '#');
            if (focus == item.id) {
                anchor.style.fontWeight = 'bold';
                anchor.setAttribute('onclick', `toBackboneTab()`);
                anchor.textContent = 'close';
            } else {
                anchor.setAttribute('onclick', `toBackboneTab('${item.id}')`);
                anchor.textContent = 'open';
            }
            row.insertCell().appendChild(anchor);
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
    let table = document.createElement('table');
    table.setAttribute('cellPadding', '4');
    let row  = table.insertRow();
    let cell = row.insertCell();
    cell.style = 'text-align:right';
    cell.textContent = 'Backbone Name:';

    cell = row.insertCell();
    let bbname = document.createElement('input');
    bbname.type = 'text';
    bbname.name = 'name';
    cell.appendChild(bbname);

    row = table.insertRow();
    row.insertCell();
    cell = row.insertCell();
    let submit = document.createElement('button');
    submit.textContent = 'Submit';
    submit.addEventListener('click', () => { BackboneSubmit(bbname.value) });
    cell.appendChild(submit);

    section.appendChild(table);
}

async function BackboneSubmit(name) {
    console.log(`BackboneSubmit: name=${name}`);
    const response = await fetch('api/v1alpha1/backbones', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name : name,
        }),
    });

    if (response.ok) {
        const data = await response.json();
        await toBackboneTab(data.id, 'Backbone Create Successful');
    } else {
        const message = await response.text();
        await toBackboneTab(undefined, `Backbone Create Failed: ${message}`);
    }
}

