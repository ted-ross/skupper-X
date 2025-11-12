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

import { ConfirmDialog, countLines, LayoutRow } from "./util.js";

export async function ConfigTab(parent, van) {
    parent.innerHTML = '';
    let panel = document.createElement('div');
    parent.appendChild(panel);

    let errorbox = document.createElement('pre');
    errorbox.className = 'errorBox';

    let layout = document.createElement('table');
    layout.setAttribute('cellPadding', '4');

    LayoutRow(layout, [`VAN Name: ${van.name}`]);

    let apSelector = document.createElement('select');
    const apResult = await fetch(`/api/v1alpha1/backbones/${van.backbone}/accesspoints`);
    const apList   = await apResult.json();
    let defaultAp  = document.createElement('option');
    apSelector.hidden = true;
    defaultAp.textContent = '-- Select a Management Backbone Access Point --';
    apSelector.appendChild(defaultAp);
    for (const ap of apList) {
        if (ap.kind == 'van') {
            let option = document.createElement('option');
            option.textContent = `${ap.sitename}/${ap.name}`;
            option.value       = ap.id;
            apSelector.appendChild(option);
        }
    }
    apSelector.onchange = async (ev) => {
        if (apSelector.selectedIndex == 0) {
            textbox.textContent = '';
            textbox.setAttribute('rows', 5);
            download.hidden = true;
        } else {
            const configResult = await fetch(`/api/v1alpha1/vans/${van.id}/config/connecting/${apSelector.value}`);
            textbox.textContent = await configResult.text();
            textbox.setAttribute('rows', countLines(textbox.textContent));
            download.href = `/api/v1alpha1/vans/${van.id}/config/connecting/${apSelector.value}`;
            download.download = `connecting.yaml`;
            download.hidden = false;
        }
    };

    let textbox = document.createElement('textarea');
    textbox.readOnly = true;
    textbox.setAttribute('rows', 5);

    let download = document.createElement('a');
    download.innerHTML = 'download configuration';
    download.hidden = true;

    let typeSelector = document.createElement('select');
    for (const t of [
        '-- Select a Configuration Type --',
        'VAN Site Not Connected to the Management Backbone',
        'VAN Site Connected to the Management Backbone'
    ]) {
        let option = document.createElement('option');
        option.textContent = t;
        typeSelector.appendChild(option);
    }
    typeSelector.onchange = async (ev) => {
        switch (typeSelector.selectedIndex) {
            case 0:
                apSelector.hidden = true;
                apSelector.selectedIndex = 0;
                textbox.textContent = '';
                textbox.setAttribute('rows', 5);
                download.hidden = true;
                break;
            case 1:
                apSelector.hidden = true;
                apSelector.selectedIndex = 0;
                const config1Result = await fetch(`/api/v1alpha1/vans/${van.id}/config/nonconnecting`);
                textbox.textContent = await config1Result.text();
                textbox.setAttribute('rows', countLines(textbox.textContent));
                download.href = `/api/v1alpha1/vans/${van.id}/config/nonconnecting`;
                download.download = 'nonconnecting.yaml';
                download.hidden = false;
                break;
            case 2:
                apSelector.hidden = false;
                textbox.textContent = '';
                textbox.setAttribute('rows', 5);
                download.hidden = true;
                break;
        }
    };
    LayoutRow(layout, [typeSelector]);
    LayoutRow(layout, [apSelector]);
    LayoutRow(layout, [download]);

    panel.appendChild(layout);
    panel.appendChild(textbox);
    panel.appendChild(errorbox);
}