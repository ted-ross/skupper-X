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

import { SetupTable } from "./util.js";

export async function LibraryConfiguration(panel, block) {
    panel.innerHTML = '<h2>Configuration Template</h2>';

    const result = await fetch(`/compose/v1alpha1/library/blocks/${block.id}/config`);
    if (!result.ok) {
        return;
    }

    let configmap = await result.json();
    if (!configmap) {
      configmap = {};
    }
    let layout = SetupTable(['', '', 'Attribute', 'Type', 'Default', 'Description']);
    for (const [name, config] of Object.entries(configmap)) {
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
                await ConfigPanel(configDiv, config, [row, subrow]);
            } else {
                layout.deleteRow(config._row.rowIndex + 1);
            }
        });
        row.insertCell().appendChild(open);
        row.insertCell();
        row.insertCell().textContent = name;
        row.insertCell().textContent = config.type;
        row.insertCell().textContent = config.default;
        row.insertCell().textContent = config.description;
    }
    panel.appendChild(layout);
}

async function ConfigPanel(panel, config, toRemoveOnDelete) {
    panel.innerHTML = '';
}
