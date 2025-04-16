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
    table.setAttribute('border', '1');
    table.setAttribute('cellpadding', '5');
    table.setAttribute('cellspacing', '0');
    table.setAttribute('bordercolor', 'lightgrey');

    const headerRow = table.insertRow();

    for (const header of headers) {
        let hdr = document.createElement('th');
        hdr.textContent = header;
        headerRow.appendChild(hdr);
    }
    return table;
}

export function countLines(str) {
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

