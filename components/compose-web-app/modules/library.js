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

import { toLibraryTab } from "../page.js";
import { LibraryTestBuild } from "./library-build.js";
import { LibraryEditComposite } from "./library-composite.js";
import { LibraryConfiguration } from "./library-config.js";
import { LibraryEditInterfaces } from "./library-interfaces.js";
import { LibraryEditSimple } from "./library-simple.js";
import { LibrarySummary } from "./library-summary.js";
import { TabSheet } from "./tabsheet.js";
import { FormLayout, SetupTable, TextArea } from "./util.js";

export async function BuildLibraryTable() {
    const response = await fetch('compose/v1alpha1/library/blocks');
    const rawdata  = await response.json();
    let section    = document.getElementById("sectiondiv");
    let data = {};
    for (const d of rawdata) {
        if (!data[d.name] || d.revision > data[d.name].revision) {
            data[d.name] = d;
        }
    }

    let addButton = document.createElement('button');
    addButton.textContent = 'Add Library Block...';
    addButton.style.marginBottom = '5px';
    addButton.onclick     = async () => { await BlockForm(); }
    section.appendChild(addButton);
    section.appendChild(document.createElement('br'));

    if (rawdata.length == 0) {
        let empty = document.createElement('i');
        empty.textContent = 'No Library Blocks Found';
        section.appendChild(empty);

        // TODO - Add a create/upload button
    } else {
        let table = SetupTable(['Name', 'Provider', 'Type', 'Rev', 'Composite', 'Created']);
        for (const item of Object.values(data)) {
            let row = table.insertRow();
            let anchor = document.createElement('a');
            anchor.setAttribute('href', '#');
            anchor.onclick = async () => { await LibTabSheet(item.id); };
            anchor.textContent = item.name;
            row.insertCell().appendChild(anchor);
            row.insertCell().textContent = item.provider || '-';
            row.insertCell().textContent = item.type.replace('skupperx.io/', '');
            row.insertCell().textContent = item.revision;
            row.insertCell().textContent = item.iscomposite ? 'Y' : '';
            row.insertCell().textContent = item.created;
        }
        section.appendChild(table);
    }
}

async function BlockForm() {
    const btresponse = await fetch('compose/v1alpha1/library/blocktypes');
    const btdata     = await btresponse.json();
    let   section    = document.getElementById("sectiondiv");

    section.innerHTML = '<h2>Create a new library block</h2>';

    let errorbox = document.createElement('pre');
    errorbox.className = 'errorBox';

    let lbName       = document.createElement('input');
    let btSelector   = document.createElement('select');
    let provider     = document.createElement('input');
    let bodySelector = document.createElement('select');

    lbName.type = 'text';

    //
    // Populate the block-type selector
    //
    for (const btname of Object.keys(btdata)) {
        let option = document.createElement('option');
        option.setAttribute('value', btname);
        option.textContent = btname;
        btSelector.appendChild(option);
    }

    //
    // Populate the body type selector
    //
    let simple = document.createElement('option');
    simple.setAttribute('value', 'false');
    simple.textContent = 'Simple';
    bodySelector.appendChild(simple);

    let composite = document.createElement('option');
    composite.setAttribute('value', 'true');
    composite.textContent = 'Composite';
    bodySelector.appendChild(composite);

    const form = await FormLayout(
        //
        // Form fields
        //
        [
            ['Library Block Name:',  lbName],
            ['Block Type:',          btSelector],
            ['Provider (optional):', provider],
            ['Body Type:',           bodySelector],
        ],

        //
        // Submit button behavior
        //
        async () => {
            const response = await fetch('compose/v1alpha1/library/blocks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name      : lbName.value,
                    type      : btSelector.value,
                    provider  : provider.value,
                    composite : bodySelector.value,
                }),
            });
        
            if (response.ok) {
                let responsedata = await response.json();
                await LibTabSheet(responsedata.id);
            } else {
                errorbox.textContent = await response.text();
            }
        },

        //
        // Cancel button behavior
        //
        async () => { await toLibraryTab(); }
    );

    section.appendChild(form);
    section.appendChild(errorbox);
    lbName.focus();
}

async function LibTabSheet(lbid) {
    const section  = document.getElementById("sectiondiv");
    let   panel    = document.createElement('div');
    section.innerHTML = '';
    section.appendChild(panel);

    const result = await fetch(`/compose/v1alpha1/library/blocks/${lbid}`);
    const block  = await result.json();

    let title = document.createElement('b');
    title.textContent = `Library Block: ${block.name}`;
    panel.appendChild(title);

    let tabsheet = await TabSheet([
        {
            title        : 'Block Summary',
            selectAction : async (body) => { LibrarySummary(body, block); },
            enabled      : true,
        },
        {
            title        : 'Configuration',
            selectAction : async (body) => { LibraryConfiguration(body, block); },
            enabled      : true,
        },
        {
            title        : 'Edit Interfaces',
            selectAction : async (body) => { LibraryEditInterfaces(body, block); },
            enabled      : true,
        },
        {
            title        : 'Edit Simple Body',
            selectAction : async (body) => { LibraryEditSimple(body, block); },
            enabled      : !block.iscomposite,
        },
        {
            title        : 'Edit Composite Body',
            selectAction : async (body) => { LibraryEditComposite(body, block); },
            enabled      : block.iscomposite,
        },
        {
            title        : 'Test Build',
            selectAction : async (panel) => { LibraryTestBuild(panel, block); },
            enabled      : block.iscomposite,
        },
    ]);

    panel.appendChild(tabsheet);
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

