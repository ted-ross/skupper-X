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

function BlockDiv(name, kind) {
    let div = document.createElement('div');
    div.className = `ceditBlock ${kind}`;
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

async function ExpandComposite(spec, libraryBlocks, blockTypes, superIf, superBlock) {
    let composite = {
        superInterfaces : {},
        instances       : {},
        bindings        : [],
    };

    //
    // Load up the super-interfaces
    //
    for (const sif of superIf) {
        composite.superInterfaces[sif.name] = new Interface(sif, blockTypes[superBlock.type]);
    }

    //
    // Pass 1 - Set up the instances
    //
    for (const instance of spec) {
        let library = libraryBlocks[instance.block];
        const result = await fetch(`/compose/v1alpha1/library/blocks/${library.id}/interfaces`);
        library._interfaces = await result.json();
        composite.instances[instance.name] = new Instance(library, instance, blockTypes[library.type]);
    }

    //
    // Pass 2 - Resolve bindings
    //
    for (var instance of Object.values(composite.instances)) {
        const bindingSpec = instance.getBindingsSpec();
        for (const bspec of bindingSpec) {
            let localInterface = instance.findInterface(bspec.interface);
            var remoteInterface;
            if (bspec.block) {
                let remoteInstance = composite.instances[bspec.block];
                remoteInterface = remoteInstance.findInterface(bspec.blockInterface);
            } else {
                if (bspec.super) {
                    remoteInterface = composite.superInterfaces[bspec.super];
                }
            }

            if (localInterface && remoteInterface) {
                composite.bindings.push(new Binding(localInterface, remoteInterface));
            }
        }
    }

    return composite;
}

function RenderComposite(composite) {
    // TODO - Render the expanded composite as a body specification
}

class Instance {
    constructor(library, spec, blockType) {
        this.library    = library;
        this.name       = this.computeName(spec, library);
        this.blockType  = blockType;
        this.interfaces = {};
        for (const iface of library._interfaces) {
            this.interfaces[iface.name] = new Interface(iface, blockType);
        }
        this.configSpec  = library.config || {};
        this.config      = (spec ? spec.config : undefined) || {};
        this.bindingSpec = (spec ? spec.bindings : undefined) || [];
    }

    computeName(spec, library) {
        if (spec) {
            return spec.name;
        }

        if (!library._instanceNum) {
            library._instanceNum = 0
        }
        library._instanceNum++;
        return `${library.name}.${library._instanceNum}`;
    }

    findInterface(name) {
        return this.interfaces[name];
    }

    getInterfaces() {
        return this.interfaces;
    }

    getBindingsSpec() {
        return this.bindingSpec;
    }
}

class Interface {
    constructor(library, blockType) {
        this.name = library.name;
        this.role = library.role;
        if (blockType.allownorth && !blockType.allowsouth) {
            this.polarity = 'north';
        } else if (!blockType.allownorth && blockType.allowsouth) {
            this.polarity = 'south';
        } else {
            this.polarity = library.polarity;
        }
        this.data = library.data || {};
        this.bindings = [];
    }

    addBinding(binding) {
        this.bindings.push(binding);
    }
}

class Binding {
    constructor(left, right, isSuper) {
        this.left    = left;
        this.right   = right;
        this.isSuper = this.isSuper;

        left.addBinding(this);
        right.addBinding(this);
    }
}

export async function LibraryEditComposite(panel, block, libraryBlocks, blockTypes) {
    panel.innerHTML = '';
    let selectedLibraryBlockNames  = [];

    //
    // Get the block body
    //
    const result1 = await fetch(`/compose/v1alpha1/library/blocks/${block.id}/body`);
    const body    = await result1.json();
    const result2 = await fetch(`/compose/v1alpha1/library/blocks/${block.id}/interfaces`);
    const superIf = await result2.json();
    let composite = await ExpandComposite(body, libraryBlocks, blockTypes, superIf, block);

    //
    // Set up the editor layout
    //
    let blocksDiv          = NewDiv('ceditBlocks');
    let libraryDiv         = NewDiv('ceditLibrary');
    let operationsDiv      = NewDiv('ceditOperations');
    let interfacesLeftDiv  = NewDiv('ceditInterfaces Left');
    let interfacesRightDiv = NewDiv('ceditInterfaces Right');
    let centerMiddleDiv    = NewDiv('ceditCenterMiddle');
    let centerTopDiv       = NewDiv('ceditCenterTop', [interfacesLeftDiv, interfacesRightDiv]);
    let centerDiv          = NewDiv('ceditCenter', [centerTopDiv, centerMiddleDiv, operationsDiv]);
    let outerDiv           = NewDiv('ceditOuter', [blocksDiv, centerDiv, libraryDiv]);
    DivTitle(blocksDiv,          'InstanceBlocks');
    DivTitle(libraryDiv,         'Library');
    DivTitle(operationsDiv,      'Context-Specific Operations');

    //
    // Create encompassing records for the interface panels
    //
    let interfacesLeft = {
        side  : 'left',
        div   : interfacesLeftDiv,
        block : undefined,
        iList : [], // { div, Interface, isSelected }
    };
    let interfacesRight = {
        side  : 'right',
        div   : interfacesRightDiv,
        block : undefined,
        iList : [], // { div, Interface, isSelected }
    };

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

    //
    // Set up the library panel
    //
    await SetupLibrary(libraryDiv, libraryBlocks, (libSelected) => {
        //
        // Invoked when the set of selected library blocks changes.
        //
        selectedLibraryBlockNames = libSelected;
        instantiateButton.hidden = selectedLibraryBlockNames.length == 0;
    });

    //
    // Set up the instance panel
    //
    let instanceColumn = await SetupInstanceBlocks(blocksDiv, composite, libraryBlocks, (entry) => {
        if (entry.lastState == SELECTED_LEFT ) {
            ClearInterfacePanel(interfacesLeft);
        } else if (entry.lastState == SELECTED_RIGHT) {
            ClearInterfacePanel(interfacesRight);
        }
        if (entry.selectState == SELECTED_LEFT) {
            SetupInterfacePanel(interfacesLeft, entry, composite);
        } else if (entry.selectState == SELECTED_RIGHT) {
            SetupInterfacePanel(interfacesRight, entry, composite);
        }
    });

    panel.appendChild(outerDiv);
}

function ClearInterfacePanel(ipanel) {
    ipanel.div.innerHTML = '';
    ipanel.block = undefined;
    ipanel.iList = [];
}

function SetupInterfacePanel(ipanel, entry, composite) {
    ipanel.div.innerHTML = '';
    if (entry.isSuper) {
        DivTitle(ipanel.div, 'Super Block');
        for (const iface of Object.values(composite.superInterfaces)) {
            // Assume we're driving the left panel
            let idiv = document.createElement('div');
            idiv.className = 'ceditInterface Super';
            idiv.textContent = `${iface.name} [${iface.role}] (${iface.polarity == 'north' ? 'N' : 'S'})`;
            ipanel.iList.push({
                div        : idiv,
                iface      : iface,
                isSelected : false,
            });
            ipanel.div.appendChild(idiv);
        }
    } else {
        const instance = composite.instances[entry.instanceName];
        DivTitle(ipanel.div, entry.instanceName);
        ipanel.block = instance;
        const ifaces = instance.getInterfaces();
        for (const iface of Object.values(ifaces)) {
            let idiv = document.createElement('div');
            if (ipanel.side == 'left') {
                idiv.className = 'ceditInterface Left';
                idiv.textContent = `${iface.name} [${iface.role}] (${iface.polarity == 'north' ? 'N' : 'S'})`;
            } else {
                idiv.className = 'ceditInterface Right';
                idiv.textContent = `(${iface.polarity == 'north' ? 'N' : 'S'}) [${iface.role}] ${iface.name}`;
            }
            ipanel.iList.push({
                div        : idiv,
                iface      : iface,
                isSelected : false,
            });
            idiv.onclick = () => {
                // TODO
            }
            ipanel.div.appendChild(idiv);
        }
    }
}

async function SetupLibrary(libraryDiv, libraryBlocks, onSelectChange) {
    let selectList = [];
    for (const name of Object.keys(libraryBlocks)) {
        let blockDiv = BlockDiv(name, 'Library');
        let selected = false;
        blockDiv.onclick = () => {
            selected = !selected;
            if (selected) {
                selectList.push(name);
            } else {
                selectList.splice(selectList.indexOf(name), 1);
            }
            blockDiv.className = selected ? 'ceditBlock Library Selected' : 'ceditBlock Library';
            onSelectChange(selectList);
        };
        libraryDiv.appendChild(blockDiv);
    }
}

const UNSELECTED     = 0;
const SELECTED       = 1;
const SELECTED_LEFT  = 2;
const SELECTED_RIGHT = 3

function UpdateInstanceDiv(entry, newState, onChange, entryList) {
    entry.lastState   = entry.selectState;
    entry.selectState = newState;
    switch (newState) {
        case UNSELECTED     : entry.div.className = 'ceditBlock Instance';                 break;
        case SELECTED       : entry.div.className = 'ceditBlock Instance Selected';        break;
        case SELECTED_LEFT  : entry.div.className = 'ceditBlock Instance Selected Left';   break;
        case SELECTED_RIGHT : entry.div.className = 'ceditBlock Instance Selected Right';  break;
    }

    if (entryList) {
        for (var other of entryList) {
            if (other != entry && other.selectState == newState) {
                UpdateInstanceDiv(other, UNSELECTED, onChange);
            }
        }
    }

    if (entry.lastState != entry.selectState) {
        onChange(entry);
    }
}

async function SetupInstanceBlocks(blocksDiv, composite, libraryBlocks, onSelectChange) {
    let instanceDivs = [];
    let blockDiv = BlockDiv('SUPER', 'Instance');
    let superEntry = {
        isSuper     : true,
        div         : blockDiv,
        lastState   : UNSELECTED,
        selectState : UNSELECTED,
    };
    blockDiv.onclick = () => {
        if (superEntry.selectState == UNSELECTED) {
            UpdateInstanceDiv(superEntry, SELECTED_LEFT, onSelectChange, instanceDivs);
        } else {
            UpdateInstanceDiv(superEntry, UNSELECTED, onSelectChange);
        }
    };
    blockDiv.oncontextmenu = (e) => {
        e.preventDefault();
        if (superEntry.selectState != UNSELECTED) {
            UpdateInstanceDiv(superEntry, UNSELECTED, onSelectChange);
        }
    };
    instanceDivs.push(superEntry);
    blocksDiv.appendChild(blockDiv);
    for (const name of Object.keys(composite.instances)) {
        blockDiv = BlockDiv(name, 'Instance');
        let entry = {
            instanceName : name,
            isSuper      : false,
            div          : blockDiv,
            lastState    : UNSELECTED,
            selectState  : UNSELECTED,
        };
        blockDiv.onclick = () => {
            if (entry.selectState == UNSELECTED) {
                UpdateInstanceDiv(entry, SELECTED_LEFT, onSelectChange, instanceDivs);
            } else {
                UpdateInstanceDiv(entry, UNSELECTED, onSelectChange);
            }
        };
        blockDiv.oncontextmenu = (e) => {
            e.preventDefault();
            if (entry.selectState == UNSELECTED) {
                UpdateInstanceDiv(entry, SELECTED_RIGHT, onSelectChange, instanceDivs);
            } else {
                UpdateInstanceDiv(entry, UNSELECTED, onSelectChange);
            }
        }
        instanceDivs.push(entry);
        blocksDiv.appendChild(blockDiv);
    }

    return instanceDivs;
}
