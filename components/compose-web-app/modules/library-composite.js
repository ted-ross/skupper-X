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

function NewDiv(className, children) {
    let div = document.createElement('div');
    div.className = className;
    for (const child of children || []) {
        div.appendChild(child);
    }
    return div;
}

function DivTitle(div, title) {
    let titleDiv = document.createElement('div');
    titleDiv.className = 'ceditTitle';
    titleDiv.textContent = title;
    div.appendChild(titleDiv);
}

function BlockDiv(name) {
    let div = document.createElement('div');
    div.className = 'ceditBlock';
    div.textContent = name;
    return div;
}

function OpButton(div, text, onclick) {
    let button = document.createElement('button');
    button.className = 'ceditButton';
    button.textContent = text;
    button.hidden = true;
    button.onclick = onclick;
    div.appendChild(button);
    return button;
}

function ExpandComposite(spec, libraryBlocks) {
    let composite = {};

    // TODO

    return composite;
}

function RenderComposite(composite) {
    // TODO - Render the expanded composite as a body specification
}

export async function LibraryEditComposite(panel, block, libraryBlocks) {
    panel.innerHTML = '';
    let selectedLibraryBlockNames  = [];
    let selectedInstanceBlockNames = [];

    //
    // Get the block body
    //
    const result  = await fetch(`/compose/v1alpha1/library/blocks/${block.id}/body`);
    const body    = await result.json();
    let composite = ExpandComposite(body, libraryBlocks);

    //
    // Set up the editor layout
    //
    let blocksDiv          = NewDiv('ceditBlocks');
    let libraryDiv         = NewDiv('ceditLibrary');
    let operationsDiv      = NewDiv('ceditOperations');
    let interfacesLeftDiv  = NewDiv('ceditInterfacesLeft');
    let interfacesRightDiv = NewDiv('ceditInterfacesRight');
    let centerMiddleDiv    = NewDiv('ceditCenterMiddle');
    let centerTopDiv       = NewDiv('ceditCenterTop', [interfacesLeftDiv, interfacesRightDiv]);
    let centerDiv          = NewDiv('ceditCenter', [centerTopDiv, centerMiddleDiv, operationsDiv]);
    let outerDiv           = NewDiv('ceditOuter', [blocksDiv, centerDiv, libraryDiv]);
    DivTitle(blocksDiv,          'InstanceBlocks');
    DivTitle(libraryDiv,         'Library');
    DivTitle(operationsDiv,      'Context-Specific Operations');
    DivTitle(interfacesLeftDiv,  'Block Interfaces');
    DivTitle(interfacesRightDiv, 'Block Interfaces');

    await SetupLibrary(libraryDiv, libraryBlocks, (libSelected) => {
        //
        // Invoked when the set of selected library blocks changes.
        //
        selectedLibraryBlockNames = libSelected;
        instantiateButton.hidden = selectedLibraryBlockNames.length == 0;
    });

    await SetupInstanceBlocks(blocksDiv, composite, libraryBlocks, (selected) => {
        // TODO
    });

    //
    // Set up the context-specific operations in hidden state
    //
    let instantiateButton = OpButton(operationsDiv, 'Instantiate Selected Library Blocks', () => {
        // TODO - Instantiate the library blocks named in selectedLibraryBlockNames
    });

    let bindButton = OpButton(operationsDiv, 'Bind the Selected Interfaces', () => {
        // TODO
    });

    let unbindButton = OpButton(operationsDiv, 'Unbind the Selected Interfaces', () => {
        // TODO
    });

    let connectButton = OpButton(operationsDiv, 'Find Connectors for the Selected Interfaces', () => {
        // TODO
    });

    let configureButton = OpButton(operationsDiv, 'Configure Instance Block', () => {
        // TODO
    });

    panel.appendChild(outerDiv);
}

async function SetupLibrary(libraryDiv, libraryBlocks, selectUpdate) {
    let selectList = [];
    for (const name of Object.keys(libraryBlocks)) {
        let blockDiv = BlockDiv(name);
        let selected = false;
        blockDiv.onclick = () => {
            selected = !selected;
            if (selected) {
                selectList.push(name);
            } else {
                selectList.splice(selectList.indexOf(name), 1);
            }
            blockDiv.className = selected ? 'ceditBlock Selected' : 'ceditBlock';
            selectUpdate(selectList);
        };
        libraryDiv.appendChild(blockDiv);
    }
}

async function SetupInstanceBlocks(blocksDiv, body, libraryBlocks, selectUpdate) {
    // TODO
}
