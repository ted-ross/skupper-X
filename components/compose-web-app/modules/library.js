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

import { SetupTable, TextArea } from "./util.js";

export async function BuildLibraryTable() {
    const response = await fetch('compose/v1alpha1/library/blocks');
    const rawdata  = await response.json();
    let data = {};
    for (const d of rawdata) {
        if (!data[d.name] || d.revision > data[d.name].revision) {
            data[d.name] = d;
        }
    }

    let table = SetupTable(['Name', 'Type', 'Rev', 'Created']);
    for (const item of Object.values(data)) {
        let row = table.insertRow();
        let anchor = document.createElement('a');
        anchor.setAttribute('href', '#');
        anchor.addEventListener('click', () => { LibDetail(item.id); });
        anchor.textContent = item.name;
        row.insertCell().appendChild(anchor);
        row.insertCell().textContent = item.type.replace('skupperx.io/', '');
        row.insertCell().textContent = item.revision;
        row.insertCell().textContent = item.created;
    }

    document.getElementById("sectiondiv").appendChild(table);
}

export async function LibDetail(lbid) {
    const response = await fetch(`compose/v1alpha1/library/blocks/${lbid}`);
    const data = await response.json();
    let section = document.getElementById("sectiondiv");
    section.innerHTML = `<h2>${data.name};${data.revision}</h2>`;
    if (data.inherit != '') {
        TextArea(data.inherit, 'Inherit', section);
    }
    if (data.config != '') {
        TextArea(data.config, 'Config', section);
    } else {
        let empty = document.createElement('h3');
        empty.textContent = 'No configuration section';
        section.appendChild(empty);
    }
    if (data.interfaces != '') {
        TextArea(data.interfaces, 'Interfaces', section);
    } else {
        let empty = document.createElement('h3');
        empty.textContent = 'No interface section';
        section.appendChild(empty);
    }
    if (data.specbody != '') {
        TextArea(data.specbody, 'Body', section, 100);
    } else {
        let empty = document.createElement('h3');
        empty.textContent = 'No body section';
        section.appendChild(empty);
    }
}

