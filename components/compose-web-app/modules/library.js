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
import { LibraryHistory } from "./library-history.js";
import { LibraryEditInterfaces } from "./library-interfaces.js";
import { LibraryEditSimple } from "./library-simple.js";
import { TabSheet } from "./tabsheet.js";
import { FormLayout, LayoutRow, SetupTable, TextArea } from "./util.js";

export async function BuildLibraryTable() {
    const response = await fetch('/compose/v1alpha1/library/blocks');
    const rawdata  = await response.json();
    let section    = document.getElementById("sectiondiv");
    let libraryBlocks = {};
    for (const d of rawdata) {
        if (!libraryBlocks[d.name] || d.revision > libraryBlocks[d.name].revision) {
            libraryBlocks[d.name] = d;
        }
    }

    const btresponse = await fetch('/compose/v1alpha1/library/blocktypes');
    const blockTypes = await btresponse.json();

    const irresponse     = await fetch('/compose/v1alpha1/interfaceroles');
    const interfaceRoles = await irresponse.json();

    let addButton = document.createElement('button');
    addButton.textContent = 'Add Library Block...';
    addButton.style.marginBottom = '5px';
    addButton.onclick     = async () => { await BlockForm(blockTypes, interfaceRoles); }
    section.appendChild(addButton);
    section.appendChild(document.createElement('br'));

    if (rawdata.length == 0) {
        let empty = document.createElement('i');
        empty.textContent = 'No Library Blocks Found';
        section.appendChild(empty);

        // TODO - Add a create/upload button
    } else {
        let table = SetupTable(['Name', 'Provider', 'Type', 'Latest', 'Body Style', 'Created']);
        for (const item of Object.values(libraryBlocks)) {
            let row = table.insertRow();
            let anchor = document.createElement('a');
            anchor.setAttribute('href', '#');
            anchor.onclick = async () => { await LibTabSheet(item.id, blockTypes, interfaceRoles, libraryBlocks); };
            anchor.textContent = item.name;
            row.insertCell().appendChild(anchor);
            row.insertCell().textContent = item.provider || '-';
            row.insertCell().textContent = item.type.replace('skupperx.io/', '');
            row.insertCell().textContent = item.revision;
            row.insertCell().textContent = item.bodystyle;
            row.insertCell().textContent = item.created;
        }
        section.appendChild(table);
    }
}

async function BlockForm(blockTypes, interfaceRoles) {
    let section = document.getElementById("sectiondiv");
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
    for (const btname of Object.keys(blockTypes)) {
        let option = document.createElement('option');
        option.setAttribute('value', btname);
        option.textContent = btname;
        btSelector.appendChild(option);
    }

    //
    // Populate the body type selector
    //
    let simple = document.createElement('option');
    simple.setAttribute('value', 'simple');
    simple.textContent = 'Simple';
    bodySelector.appendChild(simple);

    let composite = document.createElement('option');
    composite.setAttribute('value', 'composite');
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
            console.log('Submit Button!');
            const response = await fetch('/compose/v1alpha1/library/blocks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name      : lbName.value,
                    type      : btSelector.value,
                    provider  : provider.value,
                    bodystyle : bodySelector.value,
                }),
            });
            console.log('   fetch completed');
        
            if (response.ok) {
                let responsedata = await response.json();
                await LibTabSheet(responsedata.id, blockTypes, interfaceRoles);
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

async function LibTabSheet(lbid, blockTypes, interfaceRoles, libraryBlocks) {
    const section  = document.getElementById("sectiondiv");
    let   panel    = document.createElement('div');
    section.innerHTML = '';
    section.appendChild(panel);

    const result    = await fetch(`/compose/v1alpha1/library/blocks/${lbid}`);
    const block     = await result.json();
    const blockType = blockTypes[block.type];

    let headerDiv  = document.createElement('div');
    headerDiv.className = 'onerow'
    let headerDiv1 = document.createElement('div');
    let headerDiv2 = document.createElement('div');
    headerDiv2.className = 'inlinecell';

    let layout = document.createElement('table');
    LayoutRow(layout, ['Block Name:',  block.name]);
    LayoutRow(layout, ['Provider:',    block.provider]);
    LayoutRow(layout, ['Block Type:',  block.type]);
    LayoutRow(layout, ['Body Type:',   block.bodystyle]);
    headerDiv1.appendChild(layout);

    layout = document.createElement('table');
    LayoutRow(layout, ['Revision:',    `${block.revision}`]);
    LayoutRow(layout, ['Create Time:', block.created]);
    headerDiv2.appendChild(layout);

    headerDiv.appendChild(headerDiv1);
    headerDiv.appendChild(headerDiv2);
    panel.appendChild(headerDiv);

    let tabsheet = await TabSheet([
        {
            title        : 'Configuration',
            enabled      : true,
            selectAction : async (body) => { LibraryConfiguration(body, block); },
        },
        {
            title        : 'Interfaces',
            enabled      : blockType.allownorth || blockType.allowsouth,
            selectAction : async (body) => { LibraryEditInterfaces(body, block, blockType, interfaceRoles); },
        },
        {
            title        : 'Body',
            enabled      : true,
            selectAction : async (body) => {
                if (block.bodystyle == 'composite') {
                    LibraryEditComposite(body, block, libraryBlocks);
                } else {
                    LibraryEditSimple(body, block, blockType);
                }
            },
        },
        {
            title        : 'Test',
            enabled      : block.bodystyle == 'composite',
            selectAction : async (panel) => { LibraryTestBuild(panel, block); },
        },
        {
            title        : 'Revision History',
            enabled      : true,
            selectAction : async (panel) => { LibraryHistory(panel, block); },
        },
    ]);

    panel.appendChild(tabsheet);
}

export async function LibDetail(lbid) {
    const response = await fetch(`/compose/v1alpha1/library/blocks/${lbid}`);
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

