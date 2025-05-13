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

//
// tabs: list of { title, selectAction }
//
export async function TabSheet(tabs) {
    let tabsheet = document.createElement('div');
    let tsHeader = document.createElement('div');
    let tsStart  = document.createElement('div');
    let tsFiller = document.createElement('div');
    let tsBody   = document.createElement('div');

    tabsheet.className = 'tabsheet';
    tsHeader.className = 'tabsheetHeader';
    tsStart.className  = 'tabsheetStart';
    tsFiller.className = 'tabsheetFiller';
    tsBody.className   = 'tabsheetBody';

    let tabDivs = [];
    for (const tab of tabs) {
        let tabDiv = document.createElement('div');
        tabDiv.textContent = tab.title;
        if (tab.enabled) {
            tabDiv.className = 'tabsheetUnselected';
            tabDiv.onclick = async () => {
                for (const td of tabDivs) {
                    if (td.className == 'tabsheetSelected') {
                        td.className = 'tabsheetUnselected';
                    }
                }
                tabDiv.className = 'tabsheetSelected';
                await tab.selectAction(tsBody);
            }
        } else {
            tabDiv.className = 'tabsheetDisabled';
        }
        tabDivs.push(tabDiv);
    }

    tabsheet.appendChild(tsHeader);
    tabsheet.appendChild(tsBody);
    tsHeader.appendChild(tsStart);
    for (const td of tabDivs) {
        tsHeader.append(td);
    }
    tsHeader.appendChild(tsFiller);

    //
    // Activate the first tab
    //
    tabDivs[0].className = 'tabsheetSelected';
    await tabs[0].selectAction(tsBody);

    return tabsheet;
}
