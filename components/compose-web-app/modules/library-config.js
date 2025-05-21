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

export async function LibraryConfiguration(panel, block) {
    panel.innerHTML = '<h2>Configuration Template</h2>';
    const ADD_TEXT  = 'New Attribute...';

    const result = await fetch(`/compose/v1alpha1/library/blocks/${block.id}/config`);
    if (!result.ok) {
        return;
    }

    let configmap = await result.json();
    if (!configmap) {
      configmap = {};
    }
    let layout = SetupTable(['', 'Attribute', 'Type', 'Default', 'Description', '']);
    const entries = Object.entries(configmap);
    entries.push([ADD_TEXT, {type:'', default:'', description:''} ]);
    for (const [name, config] of entries) {
        let row = layout.insertRow();
        row.className = 'list';
        config._row      = row;
        config._expanded = false;
        let open = document.createElement('img');
        open.src = 'images/angle-right.svg';
        open.alt = 'open';
        open.setAttribute('width', '12');
        open.setAttribute('height', '12');
        open.addEventListener('click', async () => {
            config._expanded = !config._expanded;
            open.src = config._expanded ? 'images/angle-down.svg' : 'images/angle-right.svg';
            if (config._expanded) {
                let subrow  = layout.insertRow(config._row.rowIndex + 1);
                subrow.insertCell();
                let subcell = subrow.insertCell();
                subcell.setAttribute('colspan', '5');

                let configDiv = document.createElement('div');
                configDiv.className = 'subtable';
                subcell.appendChild(configDiv);
                await ConfigPanel(configDiv, panel, block, name == ADD_TEXT ? undefined : name, configmap, [row, subrow]);
            } else {
                layout.deleteRow(config._row.rowIndex + 1);
            }
        });

        row.insertCell().appendChild(open);
        row.insertCell().textContent = name;
        row.insertCell().textContent = config.type;
        row.insertCell().textContent = config.default;
        row.insertCell().textContent = config.description;
        if (name != ADD_TEXT) {
            let del = document.createElement('button');
            del.textContent = 'delete';
            del.onclick = async () => {
                delete configmap[name];
                await fetch(`/compose/v1alpha1/library/blocks/${block.id}/config`, {
                    method : 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(configmap),
                });
                await LibraryConfiguration(panel, block);
            }
            row.insertCell().appendChild(del);
        }
    }
    panel.appendChild(layout);
}

async function ConfigPanel(panel, outerPanel, block, name, configmap, toRemoveOnDelete) {
    panel.innerHTML = '';
    var attribute;

    if (name) {
        attribute = configmap[name];
    } else {
        attribute = {
            type        : 'string-name',
            description : '',
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
    // Type Field
    //
    let typeField = document.createElement('div');
    let typeSelect = document.createElement('select');
    let typeSelectOption = document.createElement('option');
    typeSelectOption.value = 'string-name';
    typeSelectOption.textContent = 'string-name';
    if (attribute.type == 'string-name') {
        typeSelectOption.selected = true;
    }
    typeSelect.appendChild(typeSelectOption);

    typeSelectOption = document.createElement('option');
    typeSelectOption.value = 'numeric';
    typeSelectOption.textContent = 'numeric';
    if (attribute.type == 'numeric') {
        typeSelectOption.selected = true;
    }
    typeSelect.appendChild(typeSelectOption);

    typeSelectOption = document.createElement('option');
    typeSelectOption.value = 'enum';
    typeSelectOption.textContent = 'enumerated';
    let typeEnumerations = document.createElement('input');
    typeEnumerations.type = 'text';
    typeEnumerations.size = 50;
    typeEnumerations.style.marginLeft = '5px';
    if (attribute.type == 'enum') {
        typeSelectOption.selected = true;
        typeEnumerations.value = attribute.typeValues.join(',');
        typeEnumerations.hidden = false;
    } else {
        typeEnumerations.hidden = true;
    }
    typeSelect.appendChild(typeSelectOption);

    typeSelectOption = document.createElement('option');
    typeSelectOption.value = 'bool';
    typeSelectOption.textContent = 'boolean';
    if (attribute.type == 'bool') {
        typeSelectOption.selected = true;
    }
    typeSelect.appendChild(typeSelectOption);
    typeSelect.onclick = () => {
        if (typeSelect.value == 'enum') {
            if (!attribute.typeValues) {
                attribute.typeValues = [];
            }
            typeEnumerations.value = attribute.typeValues.join(',');
            typeEnumerations.hidden = false;
        } else {
            typeEnumerations.hidden = true;
        }
    };

    typeField.appendChild(typeSelect);
    typeField.appendChild(typeEnumerations);

    //
    // Default Field
    //
    let defaultField = document.createElement('input');
    defaultField.type = 'text';
    defaultField.value = attribute.default || '';

    //
    // Description Field
    //
    let descriptionField = document.createElement('input');
    descriptionField.type = 'text'
    descriptionField.size = 60;
    descriptionField.value = attribute.description;

    const form = await FormLayout(
        //
        // Form fields
        //
        [
            ['Attribute Name:',     nameField],
            ['Type:',               typeField],
            ['Default (optional):', defaultField],
            ['Description:',        descriptionField],
        ],

        //
        // Submit button behavior
        //
        async () => {
            if (!name) {
                configmap[nameField.value] = attribute;
            }
            attribute.type = typeSelect.value;
            if (attribute.type == 'enum') {
                attribute.typeValues = typeEnumerations.value.split(',');
            }
            attribute.default = defaultField.value == '' ? undefined : defaultField.value;
            attribute.description = descriptionField.value;
            await fetch(`/compose/v1alpha1/library/blocks/${block.id}/config`, {
                method : 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(configmap),
            });
            await LibraryConfiguration(outerPanel, block);
        },

        //
        // Cancel button behavior
        //
        async () => {
            await LibraryConfiguration(outerPanel, block);
        },
        'Accept Changes',
        'Discard Changes'
    );

    panel.appendChild(form);
    if (name) {
        nameField.focus();
    }
}
