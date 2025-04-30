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

import { ConfirmDialog, LayoutRow, PollTable, SetupTable, TimeAgo } from "./util.js";

export async function MembersTab(parent, van) {
    parent.innerHTML = '';
    let panel = document.createElement('div');
    parent.appendChild(panel);

    let empty = document.createElement('i');
    empty.textContent = 'No members found for this VAN';
    panel.appendChild(empty);

    let layout = SetupTable(['', 'Name', 'TLS Status', 'Last Heartbeat', 'Invitation', 'First Active Time']);
    let isEmpty = true;

    await PollTable(panel, 5000, [
        {
            path  : `/api/v1alpha1/vans/${van.id}/members`,
            items : [
                async (member) => {
                    let found = false;
                    for (const row of layout.rows) {
                        if (row._mid == member.id) {
                            found = true;
                            ReconcileRow(row, member);
                        }
                    }

                    if (!found) {
                        if (isEmpty) {
                            panel.appendChild(layout);
                            isEmpty = false;
                            empty.remove();
                        }
                        let row = layout.insertRow();
                        row._mid = member.id;
                        row.className = 'list';
                        member._row      = row;
                        member._expanded = false;
                        let open = document.createElement('img');
                        open.src = 'images/angle-right.svg';
                        open.alt = 'open';
                        open.setAttribute('width', '12');
                        open.setAttribute('height', '12');
                        open.addEventListener('click', async () => {
                            member._expanded = !member._expanded;
                            open.src = member._expanded ? 'images/angle-down.svg' : 'images/angle-right.svg';
                            if (member._expanded) {
                                let subrow  = layout.insertRow(member._row.rowIndex + 1);
                                subrow.insertCell();
                                let subcell = subrow.insertCell();
                                subcell.setAttribute('colspan', '6');
                
                                let memberDiv = document.createElement('div');
                                memberDiv.className = 'subtable';
                                subcell.appendChild(memberDiv);
                                await MemberPanel(memberDiv, member.id);
                            } else {
                                layout.deleteRow(member._row.rowIndex + 1);
                            }
                        });
                        row.insertCell().appendChild(open);
                        row.insertCell();
                        row.insertCell();
                        row.insertCell();
                        row.insertCell();
                        row.insertCell();
                        ReconcileRow(row, member);
                    }
                }
            ]
        },
    ]);
}

function ReconcileRow(row, member) {
    const nameCell          = row.cells[1];
    const lifecycleCell     = row.cells[2];
    const lastHeartbeatCell = row.cells[3];
    const invitationCell    = row.cells[4];
    const firstActiveCell   = row.cells[5];

    const sinceLastHeartbeat = TimeAgo(new Date(member.lastheartbeat));
    const firstTime          = new Date(member.firstactivetime).toUTCString();

    if (nameCell.textContent != member.name) {
        nameCell.textContent = member.name;
    }
    if (lifecycleCell.textContent != member.lifecycle) {
        lifecycleCell.textContent = member.lifecycle;
    }
    if (firstActiveCell.textContent != firstTime) {
        firstActiveCell.textContent = firstTime;
    }
    if (lastHeartbeatCell.textContent != sinceLastHeartbeat) {
        lastHeartbeatCell.textContent = sinceLastHeartbeat;
    }
    if (invitationCell.textContent != member.invitationname) {
        invitationCell.textContent = member.invitationname;
    }
}

async function MemberPanel(div, mid) {
    const result = await fetch(`/api/v1alpha1/members/${mid}`);
    const member = await result.json();
    div.innerHTML = '';
    let layout = document.createElement('table');
    layout.setAttribute('cellPadding', '4');

    let errorbox = document.createElement('pre');
    errorbox.className = 'errorBox';

    let evictButton = document.createElement('button');
    evictButton.textContent = 'Evict Member...';
    evictButton.onclick = async () => {
        let confirm = await ConfirmDialog(
            'The member will be evicted from the network, and will no longer be able to communicate with other members',
            'Confirm Member Eviction',
            async () => {
                const result = await fetch(`/api/v1alpha1/members/${member.id}/evict`, { method : 'PUT'});
                if (!result.ok) {
                    errorbox.textContent = await result.text();
                } else {
                    evictButton.disabled = true;
                }
            }
        );
        div.appendChild(confirm);
    };
    if (member.lifecycle == 'expired') {
        evictButton.disabled = true;
    }

    LayoutRow(layout, ['Last Heartbeat:', new Date(member.lastheartbeat).toUTCString()]);

    if (member.certificate) {
        const tlsResult = await fetch(`/api/v1alpha1/tls-certificates/${member.certificate}`);
        if (tlsResult.ok) {
            const tls = await tlsResult.json();
            LayoutRow(layout, ['Certificate Expiration:', new Date(tls.expiration).toUTCString()]);
            LayoutRow(layout, ['Certificate Renewal Time:', new Date(tls.renewaltime).toUTCString()]);
        }
    }

    let siteclasses = member.siteclasses || [];


    LayoutRow(layout, ['Site Classes:', `${siteclasses}`]);
    LayoutRow(layout, ['Metadata:', member.metadata]);

    LayoutRow(layout, [evictButton]);
    div.appendChild(layout);
    div.appendChild(errorbox);
}
