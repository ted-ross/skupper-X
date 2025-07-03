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

import { FormLayout, SetupTable } from "./util.js";

function list2map(inlist) {
    let outmap = {};
    for (const item of inlist) {
        outmap[item.name] = item;
    }
    return outmap;
}

function map2list(inmap) {
    let outlist = [];
    for (const [name, value] of Object.entries(inmap)) {
        value.name = name;
        outlist.push(value);
    }
    return outlist;
}

export async function LibraryEditInterfaces(panel, block, blockType, interfaceRoles) {
    panel.innerHTML = '<h2>Block Interfaces</h2>';
    const ADD_TEXT  = 'New Interface...';

    const result = await fetch(`/compose/v1alpha1/library/blocks/${block.id}/interfaces`);
    if (!result.ok) {
        return;
    }

    let ifmap = await result.json();
    if (!ifmap) {
      ifmap = {};
    }

    let layout = SetupTable(['', 'Interface Name', 'Role', 'Polarity', 'Max Bindings', 'Data', '']);
    const entries = Object.entries(ifmap);
    entries.push([ADD_TEXT, {role:'', polarity:''} ]);
    for (const [name, iface] of entries) {
        let row = layout.insertRow();
        row.className = 'list';
        iface._row      = row;
        iface._expanded = false;
        let open = document.createElement('img');
        open.src = 'images/angle-right.svg';
        open.alt = 'open';
        open.setAttribute('width', '12');
        open.setAttribute('height', '12');
        open.addEventListener('click', async () => {
            iface._expanded = !iface._expanded;
            open.src = iface._expanded ? 'images/angle-down.svg' : 'images/angle-right.svg';
            if (iface._expanded) {
                let subrow  = layout.insertRow(iface._row.rowIndex + 1);
                subrow.insertCell();
                let subcell = subrow.insertCell();
                subcell.setAttribute('colspan', '6');

                let configDiv = document.createElement('div');
                configDiv.className = 'subtable';
                subcell.appendChild(configDiv);
                await InterfacePanel(configDiv, panel, block, blockType, name == ADD_TEXT ? undefined : name, ifmap, interfaceRoles, [row, subrow]);
            } else {
                layout.deleteRow(iface._row.rowIndex + 1);
            }
        });

        row.insertCell().appendChild(open);
        row.insertCell().textContent = name;
        row.insertCell().textContent = iface.role;
        row.insertCell().textContent = iface.polarity;
        row.insertCell().textContent = iface.maxBindings || '1';
        row.insertCell().textContent = iface.data ? JSON.stringify(iface.data) : '';
        row.insertCell();
        if (name != ADD_TEXT) {
            let del = document.createElement('button');
            del.textContent = 'delete';
            del.onclick = async () => {
                delete ifmap[name];
                await fetch(`/compose/v1alpha1/library/blocks/${block.id}/interfaces`, {
                    method : 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(map2list(ifmap)),
                });
                await LibraryEditInterfaces(panel, block, blockType, interfaceRoles);
            }
            row.insertCell().appendChild(del);
        }
    }
    panel.appendChild(layout);
}

async function InterfacePanel(panel, outerPanel, block, blockType, name, interfaces, interfaceRoles, toRemoveOnDelete) {
    panel.innerHTML = '';
    var iface;

    if (name) {
        iface = interfaces[name];
    } else {
        iface = {
            name     : '',
            role     : '',
            polarity : '',
        };
    }

    //
    // Name Field
    //
    var nameField;
    if (name) {
        nameField = document.createElement('div');
        nameField.textContent = name;
    } else {
        nameField = document.createElement('input');
        nameField.type = 'text';
    }

    //
    // Role Field
    //
    let roleField = document.createElement('select');
    for (const role of interfaceRoles) {
        let roleSelectOption = document.createElement('option');
        roleSelectOption.value = role.name;
        roleSelectOption.textContent = role.name;
        if (iface.role == role.name) {
            roleSelectOption.selected = true;
        }
        roleField.appendChild(roleSelectOption);
    }

    //
    // Polarity Field
    //
    var polarityField;
    if (blockType.allownorth && blockType.allowsouth) {
        polarityField = document.createElement('select');
        for (const p of ['north', 'south']) {
            let polarityOption = document.createElement('option');
            polarityOption.value = p;
            polarityOption.textContent = p;
            polarityField.appendChild(polarityOption);
        }
    } else {
        polarityField = document.createElement('div');
        polarityField.textContent = blockType.allownorth ? 'north' : 'south';
        polarityField.value = polarityField.textContent;
    }

    //
    // Max Bindings Field
    //
    let maxBindingsField = document.createElement('div');
    maxBindingsField.className = 'onerow';
    let bindingsLimit = document.createElement('input');
    bindingsLimit.type = 'text';
    let unlimited     = document.createElement('input');
    unlimited.type = 'checkbox';
    let label = document.createElement('div');
    label.textContent = 'unlimited';
    maxBindingsField.appendChild(bindingsLimit);
    maxBindingsField.appendChild(unlimited);
    maxBindingsField.appendChild(label);
    unlimited.addEventListener('change', () => {
        if (unlimited.checked) {
            bindingsLimit.value = 'unlimited';
            bindingsLimit.disabled = true;
        } else {
            bindingsLimit.value = '1';
            bindingsLimit.disabled = false;
        }
    });
    if (!iface.maxBindings) {
        unlimited.checked   = false;
        bindingsLimit.value = '1';
    } else if (iface.maxBindings == 'unlimited') {
        unlimited.checked = true;
    } else {
        unlimited.checked   = false;
        bindingsLimit.value = iface.maxBindings;
    }

    //
    // Data Field
    //
    let dataField = document.createElement('input');
    dataField.type = 'text'
    dataField.size = 60;
    dataField.value = iface.data ? JSON.stringify(iface.data) : '';

    const form = await FormLayout(
        //
        // Form fields
        //
        [
            ['Interface Name:',  nameField],
            ['Role:',            roleField],
            ['Polarity:',        polarityField],
            ['Max Bindings:',    maxBindingsField],
            ['Data (optional):', dataField],
        ],

        //
        // Submit button behavior
        //
        async () => {
            if (!name) {
                interfaces[nameField.value] = iface;
            }
            iface.role        = roleField.value;
            iface.polarity    = polarityField.value;
            iface.maxBindings = bindingsLimit.value;
            if (dataField.value != '') {
                iface.data = JSON.parse(dataField.value);
            } else {
                iface.data = {};
            }

            await fetch(`/compose/v1alpha1/library/blocks/${block.id}/interfaces`, {
                method : 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(map2list(interfaces)),
            });
            await LibraryEditInterfaces(outerPanel, block, blockType, interfaceRoles);
        },

        //
        // Cancel button behavior
        //
        async () => {
            await LibraryEditInterfaces(outerPanel, block, blockType, interfaceRoles);
        },
        'Accept Changes',
        'Discard Changes'
    );

    panel.appendChild(form);
    if (name) {
        nameField.focus();
    }
}
