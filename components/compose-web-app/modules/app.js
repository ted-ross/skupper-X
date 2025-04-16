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

import { LibDetail } from "./library.js";
import { SetupTable, TextArea } from "./util.js";

export async function BuildApplicationTable() {
    const response = await fetch('compose/v1alpha1/applications');
    const data     = await response.json();
    let   section  = document.getElementById("sectiondiv");

    if (data.length > 0) {
        let table = SetupTable(['Name', 'Root Block', 'Lifecycle']);
        for (const item of Object.values(data)) {
            let row = table.insertRow();

            let anchor = document.createElement('a');
            anchor.setAttribute('href', '#');
            anchor.addEventListener('click', () => { AppDetail(item.id); });
            anchor.textContent = item.name;
            row.insertCell().appendChild(anchor);

            anchor = document.createElement('a');
            anchor.setAttribute('href', '#');
            anchor.addEventListener('click', () => { LibDetail(item.rootblock); });
            anchor.textContent = item.rootname;
            row.insertCell().appendChild(anchor);

            row.insertCell().textContent = item.lifecycle;
        }

        section.appendChild(table);
    } else {
        let empty = document.createElement('i');
        empty.textContent = 'No Applications Found';
        section.appendChild(empty);
    }

    let button = document.createElement('button');
    button.addEventListener('click', () => { AppForm(); });
    button.textContent = 'Create Application...';
    section.appendChild(document.createElement('p'));
    section.appendChild(button);
}

async function AppDetail(apid, action) {
    let buildtext  = undefined;
    let deletetext = undefined;
    if (action == 'build') {
        const buildresponse = await fetch(`compose/v1alpha1/applications/${apid}/build`, {method: 'PUT'});
        buildtext = buildresponse.ok ? await buildresponse.text() : `${buildresponse.status} - ${await buildresponse.text()}`;
    } else if (action == 'delete') {
        const deleteresponse = await fetch(`compose/v1alpha1/applications/${apid}`, {method: 'DELETE'});
        deletetext = deleteresponse.ok ? await deleteresponse.text() : `${deleteresponse.status} - ${await deleteresponse.text()}`;
        if (deleteresponse.ok) {
            let   section  = document.getElementById("sectiondiv");
            section.innerHTML = '<h2>Application Deleted</h2>';
            return;
        }
    }

    const response = await fetch(`compose/v1alpha1/applications/${apid}`);
    const data     = await response.json();
    let   section  = document.getElementById("sectiondiv");
    let innerHtml = `
      <h2>${data.name}</h2>
      <table cellPadding="4">
        <tr><td style="text-align:right">Created:</td><td>${data.created}</td></tr>
        <tr><td style="text-align:right">Root Block:</td><td>${data.rootname}</td></tr>
        <tr><td style="text-align:right">Lifecycle:</td><td>${data.lifecycle}</td></tr>
        <tr><td><button id="appbuild">Build</button></td><td id="buildtextcell"></td></tr>
        <tr><td><button id="appdelete">Delete</button></td><td id="deletetextcell"></td></tr>
      </table>
    `;

    if (data.lifecycle != 'created') {
        innerHtml += `
            <h3>Application Blocks</h3>
            <table cellPadding="4" cellSpacing="0" border="1">
            <tr><th>Instance Name</th><th>Library Block</th></tr>
        `;
        const iBlockResponse = await fetch(`compose/v1alpha1/applications/${apid}/blocks`);
        const iBlocks        = await iBlockResponse.json();
        for (const ib of iBlocks) {
            innerHtml += `
                <tr>
                    <td>${ib.instancename}</td>
                    <td><a href="#" onclick="LibDetail('${ib.libraryblock}')">${ib.libname};${ib.revision}<\a></td>
                </tr>
            `;
        }
        innerHtml += `
            </table>
        `;
    }

    section.innerHTML = innerHtml;

    document.getElementById('appbuild').addEventListener('click', () => { AppDetail(apid, 'build') });
    document.getElementById('appdelete').addEventListener('click', () => { AppDetail(apid, 'delete') });

    TextArea(data.buildlog, 'Build Log', section, 250);

    if (buildtext) {
        document.getElementById("buildtextcell").innerText = buildtext;
    }
    if (deletetext) {
        document.getElementById("deletetextcell").innerText = deletetext;
    }
}

async function AppForm() {
    const libresponse = await fetch('compose/v1alpha1/library/blocks');
    const libdata     = await libresponse.json();

    let   section  = document.getElementById("sectiondiv");
    section.innerHTML = `
    <h2>Create an Application</h2>
    <table cellPadding="4">
      <tr><td style="text-align:right">Application Name:</td><td><input id="appname" type="text" name="name"></input></td></tr>
      <tr><td style="text-align:right">Root Block:</td><td><select id="rootselect" name="rootblock"></select></td></tr>
      <tr><td style="text-align:right"></td><td><button id="appsubmit">Submit</button></td></tr>
    </table>
    `;

    let submit = document.getElementById('appsubmit');
    submit.addEventListener('click', () => { AppSubmit(document.getElementById('appname').value, document.getElementById('rootselect').value); });

    //
    // Populate the root-block selector
    //
    for (const block of libdata) {
        if (block.type == 'skupperx.io/container') {
            let option = document.createElement('option');
            option.setAttribute('value', `${block.id}`);
            option.textContent = `${block.name};${block.revision}`;
            document.getElementById('rootselect').appendChild(option);
        }
    }
}

async function AppSubmit(name, rootblock) {
    console.log(`AppSubmit: name=${name} rootblock=${rootblock}`);
    const response = await fetch('compose/v1alpha1/applications', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name      : name,
            rootblock : rootblock,
        }),
    });

    let notice = response.ok ? 'Application Create Successful' : `Application Create Failed: ${await response.text()}`;
    console.log('Notice', notice);
    await toApplicationTab(notice);
}

