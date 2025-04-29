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

import { ConfirmDialog, FormLayout, LayoutRow, PollTable, SetupTable } from "./util.js";

export async function InvitationsTab(panel, van) {
    panel.innerHTML = '';

    const result  = await fetch(`/api/v1alpha1/vans/${van.id}/invitations`);
    const invites = await result.json();

    if (invites.length == 0) {
        let empty = document.createElement('i');
        empty.textContent = 'No invitations found for this VAN';
        panel.appendChild(empty);
    } else {
        await InivitationList(panel, van.id, invites);
    }

    let button = document.createElement('button');
    button.addEventListener('click', async () => {
        await CreateForm(panel, van, async () => {
            await InvitationsTab(panel, van);
        });
    });
    button.textContent = 'Create Invitation...';
    panel.appendChild(document.createElement('p'));
    panel.appendChild(button);
}

async function InivitationList(parent, vanid, invites) {
    let panel = document.createElement('div');
    parent.appendChild(panel);

    let layout = SetupTable(['', 'Name', 'Interactive', 'TLS Status', 'Join-Deadline', 'Limit', 'Member-Count', 'Fetch-Count']);
    for (const invite of invites) {
        let row = layout.insertRow();
        row._iid = invite.id;
        row.className = 'list';
        invite._row      = row;
        invite._expanded = false;
        let open = document.createElement('img');
        open.src = 'images/angle-right.svg';
        open.alt = 'open';
        open.setAttribute('width', '12');
        open.setAttribute('height', '12');
        open.addEventListener('click', async () => {
            invite._expanded = !invite._expanded;
            open.src = invite._expanded ? 'images/angle-down.svg' : 'images/angle-right.svg';
            if (invite._expanded) {
                let subrow  = layout.insertRow(invite._row.rowIndex + 1);
                subrow.insertCell();
                let subcell = subrow.insertCell();
                subcell.setAttribute('colspan', '8');

                let inviteDiv = document.createElement('div');
                inviteDiv.className = 'subtable';
                subcell.appendChild(inviteDiv);
                await InvitePanel(inviteDiv, invite, [row, subrow]);
            } else {
                layout.deleteRow(invite._row.rowIndex + 1);
            }
        });
        row.insertCell().appendChild(open);                                 // 0
        row.insertCell().textContent = invite.name;                         // 1
        row.insertCell().textContent = invite.interactive ? 'yes' : 'no';   // 2
        row.insertCell().textContent;                                       // 3
        row.insertCell().textContent = invite.joindeadline || '-';          // 4
        row.insertCell().textContent = invite.instancelimit || 'unlimited'; // 5
        row.insertCell().textContent;                                       // 6
        row.insertCell().textContent;                                       // 7
    }
    panel.appendChild(layout);

    await PollTable(panel, 5000, [
        {
            path  : `/api/v1alpha1/vans/${vanid}/invitations`,
            items : [
                async (invite) => {
                    for (const row of layout.rows) {
                        if (row._iid == invite.id) {
                            const lifecycleCell   = row.cells[3];
                            const memberCountCell = row.cells[6];
                            const fetchCountCell  = row.cells[7];

                            if (lifecycleCell.textContent != invite.lifecycle) {
                                lifecycleCell.textContent = invite.lifecycle;
                            }
                            const ic = `${invite.instancecount}`;
                            if (memberCountCell.textContent != ic) {
                                memberCountCell.textContent = ic;
                            }
                            const fc = `${invite.fetchcount}`;
                            if (fetchCountCell.textContent != fc) {
                                fetchCountCell.textContent = fc;
                            }
                        }
                    }
                }
            ]
        },
    ]);
}

async function InvitePanel(div, invite, toRemoveOnDelete) {
    div.innerHTML = '';
    let layout = document.createElement('table');
    layout.setAttribute('cellPadding', '4');

    let errorbox = document.createElement('pre');
    errorbox.className = 'errorBox';

    let anchor = document.createElement('a');
    anchor.textContent = 'download invitation';
    anchor.href        = `/api/v1alpha1/invitations/${invite.id}/kube`;
    anchor.download    = `${invite.name}.yaml`;

    let expireButton = document.createElement('button');
    expireButton.textContent = 'Expire Invitation...';
    expireButton.onclick = async () => {
        let confirm = await ConfirmDialog(
            'The invitation will be expired immediately.  Subsequent claims will be rejected.',
            'Confirm Accelerated Expiration',
            async () => {
                const result = await fetch(`/api/v1alpha1/invitations/${invite.id}/expire`, { method : 'PUT'});
                if (!result.ok) {
                    errorbox.textContent = await result.text();
                } else {
                    expireButton.disabled = true;
                }
            }
        );
        div.appendChild(confirm);
    };
    if (invite.lifecycle == 'expired') {
        expireButton.disabled = true;
    }

    let deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async () => {
        const response = await fetch(`/api/v1alpha1/invitations/${invite.id}`, { method : 'DELETE'});
        if (response.ok) {
            for (const element of toRemoveOnDelete) {
                element.remove();
            }
        } else {
            errorbox.textContent = await response.text();
        }
    });

    LayoutRow(layout, ['Invitation', anchor]);
    LayoutRow(layout, [expireButton]);
    LayoutRow(layout, [deleteButton]);
    div.appendChild(layout);
    div.appendChild(errorbox);
}

async function CreateForm(panel, van, completion) {
    panel.innerHTML = '<b>Create a VAN Invitation</b>';

    let errorbox = document.createElement('pre');
    errorbox.className = 'errorBox';

    let name = document.createElement('input');
    name.type = 'text';

    let siteClass = document.createElement('input');
    siteClass.type = 'text';

    let instanceGroup = document.createElement('div');
    instanceGroup.className = 'onerow';
    let instanceLimit = document.createElement('input');
    instanceLimit.type = 'text';
    instanceLimit.value = "1";
    let unlimited     = document.createElement('input');
    unlimited.type = 'checkbox';
    let label = document.createElement('div');
    label.textContent = 'unlimited';
    instanceGroup.appendChild(instanceLimit);
    instanceGroup.appendChild(unlimited);
    instanceGroup.appendChild(label);
    unlimited.addEventListener('change', () => {
        if (unlimited.checked) {
            instanceLimit.value = '';
            instanceLimit.disabled = true;
        } else {
            instanceLimit.disabled = false;
        }
    });

    let prefix = document.createElement('input');
    prefix.type = 'text';

    let isInteractive = document.createElement('input');
    isInteractive.type = 'checkbox';
    isInteractive.value = false;

    const accessResult = await fetch(`/api/v1alpha1/backbones/${van.backbone}/accesspoints`);
    const apList       = await accessResult.json();

    // Populate the claim and member selectors
    let claimAccess  = document.createElement('select');
    let memberAccess = document.createElement('select');
    for (const ap of apList) {
        if (ap.kind == 'claim') {
            let claimOption = document.createElement('option');
            claimOption.value = ap.id;
            claimOption.textContent = `${ap.sitename}/${ap.name}`;
            claimAccess.appendChild(claimOption);
        } else if (ap.kind == 'member') {
            let memberOption = document.createElement('option');
            memberOption.value = ap.id;
            memberOption.textContent = `${ap.sitename}/${ap.name}`;
            memberAccess.appendChild(memberOption);
        }
    }

    let deadlineGroup = document.createElement('div');
    deadlineGroup.className = 'onerow';
    let joinDeadline = document.createElement('input');
    joinDeadline.type = 'datetime-local';
    let defaultDeadline = new Date(Date.now() + 15 * 60000);
    joinDeadline.value = defaultDeadline.toISOString().slice(0, 16);
    deadlineGroup.appendChild(joinDeadline);

    let dlHour = document.createElement('button');
    dlHour.style.marginLeft = '5px';
    dlHour.textContent = 'One Hour';
    dlHour.onclick = () => {
        let dl = new Date(Date.now() + 60 * 60000);
        joinDeadline.value = dl.toISOString().slice(0, 16);
    }
    deadlineGroup.appendChild(dlHour);

    let dlDay = document.createElement('button');
    dlDay.style.marginLeft = '5px';
    dlDay.textContent = 'One Day';
    dlDay.onclick = () => {
        let dl = new Date(Date.now() + 24 * 60 * 60000);
        joinDeadline.value = dl.toISOString().slice(0, 16);
    }
    deadlineGroup.appendChild(dlDay);

    let dlYear = document.createElement('button');
    dlYear.style.marginLeft = '5px';
    dlYear.textContent = 'One Year';
    dlYear.onclick = () => {
        let dl = new Date(Date.now() + 365 * 24 * 60 * 60000);
        joinDeadline.value = dl.toISOString().slice(0, 16);
    }
    deadlineGroup.appendChild(dlYear);

    const form = await FormLayout(
        //
        // Form fields
        //
        [
            ['Invitation Name:',               name],
            ['Claim Access Point:',            claimAccess],
            ['Member Access Point:',           memberAccess],
            ['Join Deadline:',                 deadlineGroup],
            ['Site Class (optional):',         siteClass],
            ['Instance Limit:',                instanceGroup],
            ['Interactive:',                   isInteractive],
            ['Member Name Prefix (optional):', prefix],
        ],

        //
        // Submit button behavior
        //
        async () => {
            let body = {
                name          : name.value,
                claimaccess   : claimAccess.value,
                primaryaccess : memberAccess.value,
                siteclass     : siteClass.value,
                interactive   : isInteractive.checked ? 'true' : 'false',
                joindeadline  : joinDeadline.value,
            };
            if (instanceLimit.value.length > 0) {
                body.instancelimit = instanceLimit.value;
            }
            if (prefix.value.length > 0) {
                body.prefix = prefix.value;
            }
            const response = await fetch(`api/v1alpha1/vans/${van.id}/invitations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            if (response.ok) {
                await completion();
            } else {
                errorbox.textContent = await response.text();
            }
        },

        //
        // Cancel button behavior
        //
        async () => { await completion(); }
    );

    panel.appendChild(form);
    panel.appendChild(errorbox);
    name.focus();
}
