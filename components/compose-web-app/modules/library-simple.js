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

import { countLines, ExpandableRow, FormLayout, MultiSelectWithCheckbox, SetupTable } from "./util.js";

export async function LibraryEditSimple(panel, block, blockType) {
    panel.innerHTML = '<h2>Body Templates</h2>';
    const result = await fetch(`/compose/v1alpha1/library/blocks/${block.id}/body`);
    if (!result.ok) {
        panel.innerHTML = `<h2>Fetch Error: ${result.message}</h2>`;
        return;
    }
    var simpleBody = await result.json();
    const showAffinity = blockType.allocation == 'dependent';

    let columns  = ['', 'Platforms'];
    let colCount = 4;
    if (showAffinity) {
        columns.push('Affinity');
        colCount++;
    }
    columns.push('Description');
    columns.push('');

    let layout = SetupTable(columns);
    let index  = 0;
    for (const template of simpleBody) {
        let thisIndex = index;
        let row = ExpandableRow(
            layout,
            colCount,
            async (div, toDeleteRows, unexpandRow) => {
                await TemplatePanel(div, simpleBody, template, toDeleteRows, unexpandRow, block, showAffinity, panel, blockType);
            }
        );
        row.insertCell().textContent = template.targetPlatforms;
        if (showAffinity) {
            row.insertCell().textContent = template.affinity || '-';
        }
        row.insertCell().textContent = template.description;

        let del = document.createElement('button');
        del.textContent = 'delete';
        del.onclick = async () => {
            simpleBody.splice(thisIndex, 1);
            await fetch(`/compose/v1alpha1/library/blocks/${block.id}/body`, {
                method : 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(simpleBody),
            });
            await LibraryEditSimple(panel, block, blockType);
        }
        row.insertCell().appendChild(del);
        index++;
    }

    let addButton = document.createElement('button');
    addButton.textContent = 'Add New Template';
    let addButtonRow = layout.insertRow();
    addButtonRow.insertCell();
    let addCell = addButtonRow.insertCell()
    addCell.setAttribute('colspan', '4');
    addCell.appendChild(addButton);
    addCell.onclick = async () => {
        let newTemplate = {
            targetPlatforms : [],
            description     : "",
            template        : "",
        };
        if (showAffinity) {
            newTemplate.affinity = [];
        }
        simpleBody.push(newTemplate);
        let newRow = ExpandableRow(
            layout,
            colCount,
            async (div, toDeleteRows, unexpandRow) => {
                await TemplatePanel(div, simpleBody, newTemplate, toDeleteRows, unexpandRow, block, showAffinity, panel, blockType);
            },
            addButtonRow.rowIndex
        );
        newRow.insertCell().textContent = '-';
        if (showAffinity) {
            newRow.insertCell().textContent = '-';
        }
        newRow.insertCell().textContent = "New template... expand to edit";
    };

    panel.appendChild(layout);
}

async function TemplatePanel(div, body, template, toDeleteRows, unexpandRow, block, showAffinity, outerPanel, blockType) {
    let formFields = [];
    var tplist;
    var affinityItems;

    // Set up the description box
    let description = document.createElement('input');
    description.type = 'text';
    description.value = template.description || '';
    description.size = 80;
    formFields.push(['Description:', description]);

    // Set up the target platform selector
    let platformItems = [];
    const result      = await fetch('/compose/v1alpha1/targetplatforms');
    const platforms   = await result.json();
    for (const platform of platforms) {
        platformItems.push({
            id       : platform.shortname,
            text     : platform.longname,
            selected : template.targetPlatforms.indexOf(platform.shortname) >= 0,
        });
    }
    tplist = MultiSelectWithCheckbox(platformItems);
    formFields.push(['Target Platforms:', tplist]);

    // Set up the interface affinity selector
    if (showAffinity) {
        affinityItems = [];
        const result = await fetch(`/compose/v1alpha1/library/blocks/${block.id}/interfaces`);
        const iflist = await result.json();
        for (const iface of (iflist || [])) {
            affinityItems.push({
                id       : iface.name,
                text     : `${iface.name} (${iface.role})`,
                selected : template.affinity.indexOf(iface.name) >= 0,
            });
        }
        let afflist = MultiSelectWithCheckbox(affinityItems);
        formFields.push(['Interface Affinity:', afflist]);
    }

    // Set up the template edit box
    let templateText = document.createElement('textarea');
    templateText.setAttribute('cols', `80`);
    templateText.setAttribute('rows', `${countLines(template.template, 20) + 5}`);
    templateText.textContent = template.template;
    formFields.push(['Template:', templateText]);
    
    const form = await FormLayout(
        //
        // Form fields
        //
        formFields,

        //
        // Submit button behavior
        //
        async () => {
            template.description = description.value;
            template.targetPlatforms = [];
            for (const item of platformItems) {
                if (item.selected) {
                    template.targetPlatforms.push(item.id);
                }
            }
            if (showAffinity) {
                template.affinity = [];
                for (const item of affinityItems) {
                    if (item.selected) {
                        template.affinity.push(item.id);
                    }
                }
            }
            console.log(templateText.value);
            template.template = templateText.value;

            const result = await fetch(`/compose/v1alpha1/library/blocks/${block.id}/body`, {
                method : 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
            await LibraryEditSimple(outerPanel, block, blockType);
        },

        //
        // Cancel button behavior
        //
        async () => {
            unexpandRow();
        },

        'Accept Changes',
        'Discard Changes',
        true
    );

    div.appendChild(form);
}
