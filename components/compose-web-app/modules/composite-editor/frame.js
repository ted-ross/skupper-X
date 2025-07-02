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

import { FormLayout, LayoutRow } from "../util.js";

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
        const result1 = await fetch(`/compose/v1alpha1/library/blocks/${library.id}/interfaces`);
        library._interfaces = await result1.json();
        const result2 = await fetch(`/compose/v1alpha1/library/blocks/${library.id}/config`);
        library._configuration = await result2.json();
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

export async function CompositeEditor(panel, block, libraryBlocks, blockTypes) {
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
    centerDiv.id = 'center-box';

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

    panel.appendChild(outerDiv);
}

