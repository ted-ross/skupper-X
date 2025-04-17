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

import { toDeploymentTab } from "../page.js";
import { AppDetail } from "./app.js";
import { FormLayout, SetupTable, TextArea } from "./util.js";

export async function BuildDeploymentTable() {
    const response = await fetch('compose/v1alpha1/deployments');
    const data     = await response.json();
    let   section  = document.getElementById("sectiondiv");

    if (data.length > 0) {
        let table = SetupTable(['Detail', 'Application', 'VAN', 'Lifecycle']);
        for (const item of Object.values(data)) {
            let row = table.insertRow();

            let anchor = document.createElement('a');
            anchor.setAttribute('href', '#');
            anchor.addEventListener('click', () => { DepDetail(item.id, item.van); });
            anchor.textContent = 'detail';
            row.insertCell().appendChild(anchor);

            anchor = document.createElement('a');
            anchor.setAttribute('href', '#');
            anchor.addEventListener('click', () => { AppDetail(item.applicaion); });
            anchor.textContent = item.appname;
            row.insertCell().appendChild(anchor);

            row.insertCell().textContent = item.vanname;
            row.insertCell().textContent = item.lifecycle;
        }

        section.appendChild(table);
    } else {
        let empty = document.createElement('i');
        empty.textContent = 'No Deployments Found';
        section.appendChild(empty);
    }

    let button = document.createElement('button');
    button.addEventListener('click', () => { DeploymentForm(); });
    button.textContent = 'Create Deployment...';
    section.appendChild(document.createElement('p'));
    section.appendChild(button);
}

async function DepDetail(depid, vanid, action) {
    let deploytext  = undefined;
    let deletetext = undefined;
    if (action == 'deploy') {
        const deployresponse = await fetch(`compose/v1alpha1/deployments/${depid}/deploy`, {method: 'PUT'});
        deploytext = deployresponse.ok ? await deployresponse.text() : `${deployresponse.status} - ${await deployresponse.text()}`;
    } else if (action == 'delete') {
        const deleteresponse = await fetch(`compose/v1alpha1/deployments/${depid}`, {method: 'DELETE'});
        deletetext = deleteresponse.ok ? await deleteresponse.text() : `${deleteresponse.status} - ${await deleteresponse.text()}`;
        if (deleteresponse.ok) {
            let   section  = document.getElementById("sectiondiv");
            section.innerHTML = '<h2>Deployment Deleted</h2>';
            return;
        }
    }

    const response  = await fetch(`compose/v1alpha1/deployments/${depid}`);
    const data      = await response.json();
    let   section   = document.getElementById("sectiondiv");
    let   innerHtml = `
      <h2>Deployment</h2>
      <table cellPadding="4">
        <tr><td style="text-align:right">Application:</td><td>${data.appname}</td></tr>
        <tr><td style="text-align:right">VAN:</td><td>${data.vanname}</td></tr>
        <tr><td style="text-align:right">Lifecycle:</td><td>${data.lifecycle}</td></tr>
        <tr><td><button id="depDeploy">Deploy</button></td><td id="deploytextcell"></td></tr>
        <tr><td><button id="depDelete">Delete</button></td><td id="deletetextcell"></td></tr>
      </table>`;

    if (data.lifecycle == 'deployed') {
        innerHtml += `
        <h2>Site-Specific Configuration for members of this VAN</h2>
        <table cellPadding="4">
            <tr><td><select id="vanmember"></select></td><td><a id="vananchor" download></a></td></tr>
        </table>
        `;
    }

    section.innerHTML = innerHtml;

    let deployButton   = document.getElementById('depDeploy');
    let deleteButton   = document.getElementById('depDelete');
    let memberSelector = document.getElementById('vanmember');

    deployButton.addEventListener('click', () => { DepDetail(depid, vanid, 'deploy'); });
    deleteButton.addEventListener('click', () => { DepDetail(depid, vanid, 'delete'); });
    if (data.lifecycle == 'deployed') {
        memberSelector.addEventListener('change', () => { DepMemberChange(depid); });
    }

    TextArea(data.deploylog, 'Deploy Log', section, 150);

    if (data.lifecycle == 'deployed') {
        //
        // Populate the VAN member selector
        //
        const vanresponse = await fetch(`api/v1alpha1/vans/${vanid}/members`);
        const vandata = await vanresponse.json();
        for (const member of vandata) {
            let option = document.createElement('option');
            option.setAttribute('value', `${member.id}`);
            option.textContent = member.name;
            document.getElementById('vanmember').appendChild(option);
        }
        await DepMemberChange(depid);
    }

    if (deploytext) {
        document.getElementById("deploytextcell").innerText = deploytext;
    }
    if (deletetext) {
        document.getElementById("deletetextcell").innerText = deletetext;
    }
}

async function DepMemberChange(depid) {
    let anchor   = document.getElementById("vananchor");
    let select   = document.getElementById("vanmember");
    let sitename = select.selectedOptions[0].textContent;
    anchor.setAttribute('href', `compose/v1alpha1/deployments/${depid}/site/${select.value}/sitedata/${sitename}.yaml`);
    anchor.textContent = `Download site data for ${sitename}`;
}

async function DeploymentForm() {
    const appresponse = await fetch('compose/v1alpha1/applications');
    const appdata     = await appresponse.json();
    const vanresponse = await fetch('api/v1alpha1/vans');
    const vandata     = await vanresponse.json();
    let   section     = document.getElementById("sectiondiv");

    section.innerHTML = '<h2>Create a Deployment</h2>';

    let errorbox = document.createElement('pre');
    errorbox.className = 'errorBox';

    let appSelector = document.createElement('select');
    let vanSelector = document.createElement('select');

    //
    // Populate the application selector
    //
    for (const app of appdata) {
        let option = document.createElement('option');
        option.setAttribute('value', `${app.id}`);
        option.textContent = app.name;
        appSelector.appendChild(option);
    }

    //
    // Populate the van selector
    //
    for (const van of vandata) {
        let option = document.createElement('option');
        option.setAttribute('value', `${van.id}`);
        option.textContent = van.name;
        vanSelector.appendChild(option);
    }

    const form = await FormLayout(
        //
        // Form fields
        //
        [
            ['Application:', appSelector],
            ['VAN:',         vanSelector],
        ],

        //
        // Submit button behavior
        //
        async () => {
            const response = await fetch('compose/v1alpha1/deployments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    app : appSelector.value,
                    van : vanSelector.value,
                }),
            });

            if (response.ok) {
                await toDeploymentTab();
            } else {
                errorbox.textContent = await response.text();
            }
        },

        //
        // Cancel button behavior
        //
        async () => { await toDeploymentTab(); }
    );

    section.appendChild(form);
    section.appendChild(errorbox);
}
