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

import { ExpandableRow, FormLayout, SetupTable } from "./util.js";

export async function LibraryEditSimple(panel, block) {
    panel.innerHTML = '';
    const result = await fetch(`/compose/v1alpha1/library/blocks/${block.id}/body`);
    if (!result.ok) {
        panel.innerHTML = `<h2>Fetch Error: ${result.message}</h2>`;
        return;
    }
    var simpleBody = await result.json();
    const blockTypeResult = await fetch('/compose/v1alpha1/library/blocktypes');
    const blockTypes      = await blockTypeResult.json();
    const blockTypeData   = blockTypes[block.type];
    const showAffinity    = !blockTypeData.allocatetosite;

    let columns  = ['', 'Platforms'];
    let colCount = 3;
    if (showAffinity) {
        columns.push('Affinity');
        colCount++;
    }
    columns.push('Description');

    let layout = SetupTable(columns);
    for (const template of simpleBody.simple) {
        let row = ExpandableRow(
            layout,
            template,
            colCount,
            async (div, toDeleteRows, unexpandRow) => {
                await TemplatePanel(div, template, toDeleteRows, unexpandRow, block, showAffinity);
            }
        );
        row.insertCell().textContent = template.targetPlatforms;
        if (showAffinity) {
            row.insertCell().textContent = template.affinity || '-';
        }
        row.insertCell().textContent = template.description;
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
            affinity        : [],
            targetPlatforms : [],
            description     : "",
            template        : "",
        };
        simpleBody.simple.push(newTemplate);
        let newRow = ExpandableRow(layout,
            newTemplate,
            colCount,
            async (div, toDeleteRows, unexpandRow) => {
                await TemplatePanel(div, newTemplate, toDeleteRows, unexpandRow, block, showAffinity);
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

async function TemplatePanel(div, template, toDeleteRows, unexpandRow, block, showAffinity) {
    const form = await FormLayout(
        //
        // Form fields
        //
        [
            //['Target Platforms:',    name],
            //['Interface Affinity:',  claimAccess],
            //['Template:',            memberAccess],
        ],

        //
        // Submit button behavior
        //
        async () => {
            unexpandRow();
        },

        //
        // Cancel button behavior
        //
        async () => {
            unexpandRow();
        },

        'Accept Changes',
        'Discard Changes'
    );

    div.appendChild(form);
}
