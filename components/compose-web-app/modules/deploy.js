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
            anchor.setAttribute('onclick', `DepDetail('${item.id}', '${item.van}')`);
            anchor.textContent = 'detail';
            row.insertCell().appendChild(anchor);

            anchor = document.createElement('a');
            anchor.setAttribute('href', '#');
            anchor.setAttribute('onclick', `AppDetail('${item.application}')`);
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
    button.addEventListener('click', () => { DepForm(); });
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
        <tr><td><button onClick="DepDetail('${depid}', '${vanid}', 'deploy')">Deploy</button></td><td id="deploytextcell"></td></tr>
        <tr><td><button onClick="DepDetail('${depid}', '${vanid}', 'delete')">Delete</button></td><td id="deletetextcell"></td></tr>
      </table>`;

    if (data.lifecycle == 'deployed') {
        innerHtml += `
        <h2>Site-Specific Configuration for members of this VAN</h2>
        <table cellPadding="4">
            <tr><td><select id="vanmember" onchange="DepMemberChange('${depid}')"></select></td><td><a id="vananchor" download></a></td></tr>
        </table>
        `;
    }

    section.innerHTML = innerHtml;

    TextArea(data.deploylog, 'Deploy Log', section, 150);

    //
    // Populate the VAN member selector
    //
    vanresponse = await fetch(`api/v1alpha1/vans/${vanid}/members`);
    console.log(vanresponse);
    vandata     = await vanresponse.json();
    for (const member of vandata) {
        console.log('Member', member);
        let option = document.createElement('option');
        option.setAttribute('value', `${member.id}`);
        option.textContent = member.name;
        document.getElementById('vanmember').appendChild(option);
    }

    await DepMemberChange(depid);

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

async function DepForm() {
    const appresponse = await fetch('compose/v1alpha1/applications');
    const appdata     = await appresponse.json();
    const vanresponse = await fetch('api/v1alpha1/vans');
    const vandata     = await vanresponse.json();

    let   section  = document.getElementById("sectiondiv");
    section.innerHTML = `
    <h2>Create a Deployment</h2>
    <table cellPadding="4">
      <tr><td style="text-align:right">Application:</td><td><select id="appselect"></select></td></tr>
      <tr><td style="text-align:right">VAN:</td><td><select id="vanselect"></select></td></tr>
      <tr><td style="text-align:right"></td><td><button onclick="DepSubmit(document.getElementById('appselect').value, document.getElementById('vanselect').value)">Submit</button></td></tr>
    </table>
    `;

    //
    // Populate the application selector
    //
    for (const app of appdata) {
        let option = document.createElement('option');
        option.setAttribute('value', `${app.id}`);
        option.textContent = app.name;
        document.getElementById('appselect').appendChild(option);
    }

    //
    // Populate the van selector
    //
    for (const van of vandata) {
        let option = document.createElement('option');
        option.setAttribute('value', `${van.id}`);
        option.textContent = van.name;
        document.getElementById('vanselect').appendChild(option);
    }
}

async function DepSubmit(app, van) {
    console.log(`DepSubmit: app=${app} van=${van}`);
    const response = await fetch('compose/v1alpha1/deployments', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            app : app,
            van : van,
        }),
    });

    let notice = response.ok ? 'Deployment Create Successful' : `Deployment Create Failed: ${await response.text()}`;
    console.log('Notice', notice);
    await toDeploymentTab(notice);
}

