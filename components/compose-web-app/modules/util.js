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

export function SetupTable(headers) {
    let table = document.createElement('table');
    table.setAttribute('cellpadding', '5');
    table.setAttribute('cellspacing', '0');
    table.setAttribute('bordercolor', 'lightgrey');

    const headerRow = table.insertRow();

    for (const header of headers) {
        let hdr = document.createElement('th');
        hdr.style.textAlign = 'left';
        hdr.textContent = header;
        headerRow.appendChild(hdr);
    }
    return table;
}

function countLines(str) {
    return !!str ? (str.match(/\r\n|\r|\n/g) || []).length + 1 : 1;
}

export function TextArea(item, title, section, cols=60) {
    let hdr = document.createElement('h3');
    hdr.textContent = title;
    section.appendChild(hdr);
    let textarea = document.createElement('textarea');
    textarea.setAttribute('cols', `${cols}`);
    textarea.setAttribute('rows', `${countLines(item)}`);
    textarea.setAttribute('readonly', 't');
    textarea.textContent = item;
    section.appendChild(textarea);
}

//
// items:  [ [caption, element] ]
// action: function
// cancel: function
//
export async function FormLayout(items, action, cancel) {
    //
    // Use a table as a layout tool for the form.
    // Captions right-justified on the left, form-inputs left-justified on the right.
    //
    let layout = document.createElement('table');
    layout.setAttribute('cellPadding', '4');

    for (const [caption, element] of items) {
        let row  = layout.insertRow();
        let cell = row.insertCell();
        cell.style.textAlign = 'right';
        cell.textContent = caption;
        cell = row.insertCell();
        cell.appendChild(element);
    }

    if (action) {
        //
        // Put the Submit button in the right column
        //
        let row = layout.insertRow();
        row.insertCell();
        let cell = row.insertCell();
        let submit = document.createElement('button');
        submit.textContent = 'Submit';
        submit.addEventListener('click', action);
        cell.appendChild(submit);

        //
        // Put the Cancel button in the right column
        //
        let cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', cancel);
        let nobr = document.createElement('i');
        nobr.textContent = ' ';
        cell.appendChild(nobr);
        cell.appendChild(cancelButton);
    }

    return layout;
}

export function LayoutRow(layout, cells) {
    let row = layout.insertRow();
    for (const obj of cells) {
        let cell = row.insertCell();
        if (!obj) {
            cell.textContent = '-';
        } else if (typeof(obj) == 'string') {
            cell.textContent = obj;
        } else {
            cell.appendChild(obj)
        }
    }

    return row;
}

export async function PollObject(trackedDiv, delayMs, actions) {
    //
    // Exit and don't reschedule if the div is no longer visible.
    //
    if (!trackedDiv.checkVisibility()) {
        console.log('Poller stopped due to div invisibility');
        return;
    }

    var stopPolling = false;

    for (const action of actions) {
        console.log(`Poll fetching ${action.path}`);
        const fetchResult = await fetch(action.path);
        if (fetchResult.ok) {
            const fetchData = await fetchResult.json();
            for (const [attr, fn] of Object.entries(action.items)) {
                stopPolling = await fn(fetchData[attr]);
                if (stopPolling) {
                    console.log('  stop-polling');
                }
            }
        }
    }

    //
    // Schedule the next pass
    //
    if (!stopPolling) {
        setTimeout(async () => {
            await PollObject(trackedDiv, delayMs, actions);
        }, delayMs);
    }
}

export async function PollTable(trackedDiv, delayMs, actions) {
    //
    // Exit and don't reschedule if the div is no longer visible.
    //
    if (!trackedDiv.checkVisibility()) {
        console.log('Table poller stopped due to div invisibility');
        return;
    }

    var stopPolling = false;

    for (const action of actions) {
        console.log(`Poll fetching ${action.path}`);
        const fetchResult = await fetch(action.path);
        if (fetchResult.ok) {
            const table = await fetchResult.json();
            let stop = true;
            for (const row of table) {
                for (const fn of action.items) {
                    let s = await fn(row);
                    if (!s) {
                        stop = false;
                    }
                }
            }
            if (stop) {
                stopPolling = true;
                console.log('  stop table poll');
            }
        }
    }

    //
    // Schedule the next pass
    //
    if (!stopPolling) {
        setTimeout(async () => {
            await PollTable(trackedDiv, delayMs, actions);
        }, delayMs);
    }
}

export async function ConfirmDialog(text, buttonText, asyncAction) {
    let modalBox = document.createElement('div');
    modalBox.className = 'modal';
    let content = document.createElement('div');
    content.className = 'modal-content';

    let span = document.createElement('span');
    span.className = 'close';
    span.innerHTML = '&times;';
    span.onclick = () => { modalBox.remove(); };
    content.appendChild(span);

    let modalText = document.createElement('p');
    modalText.textContent = text;
    content.appendChild(modalText);
    modalBox.appendChild(content);

    let confirm = document.createElement('button');
    confirm.textContent = buttonText;
    confirm.onclick = async () => {
        await asyncAction();
        modalBox.remove();
    };
    content.appendChild(confirm);

    let cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.style.marginLeft = '5px';
    cancel.onclick = () => {
        modalBox.remove();
    };
    content.appendChild(cancel);

    modalBox.style.display = 'block';
    return modalBox;
}

export function TimeAgo(date) {
    var seconds = Math.floor((new Date() - date) / 1000);

    var interval = Math.floor(seconds / 31536000);
    if (interval > 0) {
      return  `${interval} year${interval > 1 ? 's' : ''}`;
    }

    interval = Math.floor(seconds / 2592000);
    if (interval > 0) {
      return `${interval} month${interval > 1 ? 's' : ''}`
    }

    interval = Math.floor(seconds / 86400);
    if (interval > 0) {
      return `${interval} day${interval > 1 ? 's' : ''}`
    }

    interval = Math.floor(seconds / 3600);
    if (interval > 0) {
      return `${interval} hour${interval > 1 ? 's' : ''}`
    }

    interval = Math.floor(seconds / 60);
    if (interval > 0) {
      return `${interval} minute${interval > 1 ? 's' : ''}`
    }

    interval = Math.floor(seconds);
    return `${interval} second${interval != 1 ? 's' : ''}`
  }