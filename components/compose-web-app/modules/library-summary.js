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

import { LayoutRow } from "./util.js";

export async function LibrarySummary(panel, block) {
    panel.innerHTML = '';

    let layout = document.createElement('table');
    LayoutRow(layout, ['Block Name:',  block.name]);
    LayoutRow(layout, ['Revision:',    `${block.revision}`]);
    LayoutRow(layout, ['Provider:',    block.provider]);
    LayoutRow(layout, ['Block Type:',  block.type]);
    LayoutRow(layout, ['Body Type:',   !!block.iscomposite ? 'Composite' : 'Simple']);
    LayoutRow(layout, ['Create Time:', block.created]);

    const result = await fetch(`/compose/v1alpha1/library/blocks/${block.id}/interfaces`);
    if (result.ok) {
        const interfaces = await result.json();
        for (const iface of interfaces || []) {
            LayoutRow(layout, [`Interface ${iface.name}:`, `${iface.role} (${iface.polarity})`]);
        }
    }

    panel.appendChild(layout);
}
