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

"use strict";

const yaml = require('js-yaml');
const Log  = require('./common/log.js').Log;

const API_VERSION = 'skupperx.io/compose/v1alpha1';
const TYPE_COMPONENT = 'skupperx.io/component';
const TYPE_CONNECTOR = 'skupperx.io/connector';
const TYPE_MIXED     = 'skupperx.io/mixed';

var storedApplications = {};

const deepCopy = function(from) {
    var to;
    if (Array.isArray(from)) {
        to = [];
        for (const value of from) {
            to.push(deepCopy(value));
        }
    } else if (typeof(from) === 'object') {
        to = {};
        for (const [key, value] of Object.entries(from)) {
            to[key] = deepCopy(value);
        }
    } else {
        return from;
    }
    return to;
}

const deepAppend = function(base, overlay) {
    let modified = base;
    if (typeof(overlay) === 'object') {
        for (const [key, value] of Object.entries(overlay)) {
            modified[key] = deepAppend(modified[key], value);
        }
        return modified;
    } else {
        return overlay;
    }
}

class BlockInterface {
    constructor(ownerRef, name, role, polarity, blockType) {
        this.ownerRef  = ownerRef;
        this.name      = name;
        this.role      = role;
        this.polarity  = polarity;
        this.blockType = blockType;
        this.binding   = undefined;
    }

    toString() {
        return `BlockInterface ${this.ownerRef.name}.${this.name} (${this.role}) ${this.polarity ? 'N' : 'S'}`;
    }

    setBinding(binding) {
        this.binding = binding;
    }

    hasBinding() {
        return !!this.binding;
    }
}

class InstanceBlock {
    constructor(libraryBlock, name) {
        this.libraryBlock = libraryBlock;
        this.name         = name;
        this.labels       = {};
        this.interfaces   = {};

        const ilist = libraryBlock.object().spec.interfaces;
        for (const iface of ilist) {
            this.interfaces[iface.name] = new BlockInterface(this, iface.name, iface.role, iface.polarity, iface.blockType);
        }

        Log(`Constructed: ${this}`);
    }

    toString() {
        return `InstanceBlock: ${this.name} (${this.libraryBlock})`;
    }

    setLabel(key, value) {
        this.labels[key] = value;
    }

    object() {
        return this.libraryBlock.object();
    }

    findInterface(name) {
        return this.interfaces[name];
    }
}

class LibraryBlock {
    constructor(item, blockType) {
        this.item       = item;
        this.blockName  = item.metadata.name;
        this.blockType  = blockType;
        this.interfaces = {};
        this.labels     = {};

        Log(`Constructed: ${this}`);
    }

    toString() {
        return `LibraryBlock ${this.blockName} (${this.blockType})`;
    }

    //
    // Create BlockInterface instances for each interface in the specification.
    //
    validateInterfaces() {
        let expectedPolarity = undefined;

        if (this.blockType == TYPE_COMPONENT) {
            expectedPolarity = true;
        } else if (this.blockType == TYPE_CONNECTOR) {
            expectedPolarity = false;
        }

        if (this.item.spec.interfaces) {
            for (const iface of this.item.spec.interfaces) {
                if (!iface.polarity) {
                    if (expectedPolarity === undefined) {
                        throw new Error(`Polarity must be specified for interface ${this.blockName}.${iface.name}`);
                    } else {
                        iface.polarity = expectedPolarity;
                    }
                } else {
                    if (expectedPolarity !== undefined && iface.polarity != expectedPolarity) {
                        throw new Error(`Invalid polarity for interface ${this.blockName}.${iface.name}`);
                    }
                }
            }
        }
    }

    name() {
        return this.blockName;
    }

    object() {
        return this.item;
    }

    body() {
        return this.item.spec.body;
    }

    blockInterfaces() {
        return this.interfaces;
    }
}

class InterfaceBinding {
    constructor(left, right) {
        if (left.polarity == right.polarity) {
            throw new Error(`Attempting to bind interfaces with the same polarity: ${left}, ${right}`);
        }

        this.northRef = left.polarity ? left : right;
        this.southRef = left.polarity ? right : left;

        for (const ref of [this.southRef, this.northRef]) {
            if (ref.hasBinding()) {
                throw new Error(`Attempting to bind and already bound interface: ${ref}`);
            }
        }

        if (this.southRef.role != this.northRef.role) {
            throw new Error(`Attempting to bind interfaces with different roles: ${this.southRef}, ${this.northRef}`);
        }

        // TODO - check the compatibility of the block-types

        this.northRef.setBinding(this);
        this.southRef.setBinding(this);

        Log(`Constructed: ${this}`);
    }

    toString() {
        return `InterfaceBinding north: ${this.northRef} south: ${this.southRef}`;
    }
}

class Application {
    constructor(items) {
        this.application = undefined;
        this.componentLibrary = {}; // Component blocks indexed by name
        this.connectorLibrary = {}; // Connector blocks indexed by name
        this.mixedLibrary     = {}; // Mixed blocks indexed by name
        this.ingressLibrary   = {}; // Ingresses indexed by name
        this.egressLibrary    = {}; // Egresses indexed by name

        this.instanceBlocks      = {}; // Blocks referenced in the application tree by their deployed names
        this.bindings            = []; // List of north/south interface bindings
        this.unmatchedInterfaces = []; // List of (block-name; interface-name) for unconnected interfaces

        //
        // Parse the items list and collate into objects for three kinds of Blocks, Ingresses, and Egresses.
        // We also need to find exactly one Application objects.
        //
        for (const item of items) {
            item.status = {};
            const name = item.metadata.name;
            if (item.apiVersion == API_VERSION) {
                if (item.kind == 'Block') {
                    if (item.type == TYPE_COMPONENT) {
                        this.componentLibrary[name] = new LibraryBlock(item, TYPE_COMPONENT);
                    } else if (item.type == TYPE_CONNECTOR) {
                        this.connectorLibrary[name] = new LibraryBlock(item, TYPE_CONNECTOR);
                    } else if (item.type == TYPE_MIXED) {
                        this.mixedLibrary[name] = new LibraryBlock(item, TYPE_MIXED);
                    } else {
                        Log(`Unrecognized block type: ${item.type}`);
                    }
                } else if (item.kind == 'Ingress') {
                    this.ingressLibrary[name] = item;
                } else if (item.kind == 'Egress') {
                    this.egressLibrary[name] = item;
                } else if (item.kind == 'Application') {
                    if (this.application) {
                        throw new Error(`More than one Application record supplied`);
                    }
                    this.application = item;
                } else {
                    Log(`Unrecognized record kind: ${item.kind}`);
                }
            } else {
                Log('Unrecognized API version');
            }
        }

        //
        // Fail out if we didn't see an Application object.
        //
        if (!this.application) {
            throw new Error('Missing Application record');
        }

        //
        // If any of the objects use inheritance, expand/flatten them so they are each fully specified.
        //
        for (var list of [this.componentLibrary, this.connectorLibrary, this.mixedLibrary]) {
            for (const block of Object.values(list)) {
                this.expandInheritance(list, block);

                //
                // Create BlockInterface objects in the Block
                //
                block.validateInterfaces();
            }
        }

        //
        // Create Bindings for each pairing of BlockInterfaces
        //
        this.pairInterfaces();

        Log(`Constructed: ${this}`);
    }

    toString() {
        return `Application: ${this.name()}`;
    }

    name() {
        return this.application.metadata.name;
    }

    //
    // Create an InterfaceBinding object for every matched pair of opposite-polarity interfaces in the application.
    // The matched interfaces must involve monolithic (non-composite) components and connectors.
    // When complete, make a list of unmatched interfaces for reference.
    //
    pairInterfaces() {
        this.bindings = [];
        this.unmatchedInterfaces = [];

        //
        // Recursively connect all of the interfaces
        //
        const rootName = this.application.spec.rootBlock;
        if (!this.componentLibrary[rootName]) {
            throw new Error(`Application references non-existant root block: ${rootName}`);
        }
        const rootBlock = this.componentLibrary[rootName];
        const path      = '/' + this.name();
        this.instanceBlocks[path] = new InstanceBlock(rootBlock, path);
        this.instantiateComponent(path + '/', rootBlock, rootName);
    }

    //
    // Recursive component instantiation function.
    //
    instantiateComponent(path, libraryBlock, instanceName) {
        const body = libraryBlock.body();
        if (body.composite) {
            //
            // This is a composite block.  Begin by creating instances of all of the block's children.
            //
            for (const child of body.composite.blocks) {
                if (!child.name || !child.block) {
                    throw new Error(`Invalid item in composite blocks for ${instanceName}`);
                }
                const libraryChild = this.componentLibrary[child.block] || this.connectorLibrary[child.block] || this.mixedLibrary[child.block];
                if (!libraryChild) {
                    throw new Error(`Composite component ${instanceName} references a nonexistent library block ${child.block}`);
                }
                const subPath = path + child.name;
                this.instanceBlocks[subPath] = new InstanceBlock(libraryChild, subPath);
            }

            //
            // Iterate again through the children and look for bindings.
            //
            for (const child of body.composite.blocks) {
                if (child.bindings) {
                    const childPath = path + child.name;
                    for (const binding of child.bindings) {
                        if (binding.super) {
                            //
                            // This is a binding to the containing composite block.
                            //
                        } else {
                            //
                            // This is a binding between child blocks within this composite.
                            //
                            const childInterfaceName       = binding.interface;
                            const remoteBlockPath          = path + binding.block;
                            const remoteBlockInterfaceName = binding.blockInterface;

                            const childInstance  = this.instanceBlocks[childPath];
                            const remoteInstance = this.instanceBlocks[remoteBlockPath];

                            const childInterface  = this.findBaseInterface(childInstance, childInterfaceName);
                            const remoteInterface = this.findBaseInterface(remoteInstance, remoteBlockInterfaceName);

                            const ifBinding = new InterfaceBinding(childInterface, remoteInterface);
                            this.bindings.push(ifBinding);
                        }
                    }
                }
            }

            //
            // Iterate again through the children and recursively process them.
            //
            for (const child of body.composite.blocks) {
                const libraryChild = this.componentLibrary[child.block] || this.connectorLibrary[child.block] || this.mixedLibrary[child.block];
                this.instantiateComponent(path + child.name + '/', libraryChild, child.name);
            }
        } else {
            // This space intentionally left blank.
        }
    }

    //
    // Locate and return a reference to the base interface in an instance block by the interface's name.
    // If the instance block is composite, it may be necessary to recurse downward until a monolithic block is found.
    // Throw an error if the interface cannot be found.
    //
    findBaseInterface(instanceBlock, interfaceName) {
        const spec = instanceBlock.object().spec;
        if (spec.interfaces) {
            for (const specif of spec.interfaces) {
                if (specif.name == interfaceName) {
                    //
                    // We have verified that the instance has an interface with the desired name.
                    // If this is a monolithic block, return the interface instance for this interface, otherwise
                    // find the sub-block that binds this interface and recurse down into it.
                    //
                    if (spec.body && typeof(spec.body) == 'object' && spec.body.composite) {
                        //
                        // The referenced block is a composite.  We must find a sub-block that binds to this interface.
                        // Note that the name of the sub-block interface may differ from the interface on this block.
                        //
                        for (const cblock of spec.body.composite.blocks) {
                            if (cblock.bindings) {
                                for (const cbinding of cblock.bindings) {
                                    if (cbinding.super == interfaceName) {
                                        const recurseBlock         = this.instanceBlocks[cblock.name];
                                        const recurseInterfaceName = cbinding.interface;
                                        return this.findBaseInterface(recurseBlock, recurseInterfaceName);
                                    }
                                }
                            }
                        }
                    } else {
                        const result = instanceBlock.findInterface(interfaceName);
                        if (result) {
                            return result;
                        }
                    }
                }
            }
        }

        throw new Error(`Base Interface ${interfaceName} not found in block ${instanceBlock}`);
    }

    //
    // Fully specify any blocks that inherit content from other blocks.
    //
    expandInheritance(list, block) {
        let   expanded = block.object();
        const spec     = expanded.spec;
        if (spec.base) {
            const parentBlock = list[spec.base];
            if (!parentBlock) {
                throw new Error(`Base reference not found: ${spec.base}`);
            }

            const parent = parentBlock.object();
            expanded.spec = deepCopy(parent.spec);
            if (spec.transformOverwrite) {
                expanded.spec = deepAppend(expanded.spec, spec.transformOverwrite);
            }
            if (spec.transformDelete) {
                // TODO - array of paths to be removed from the base
                throw new Error('transformDelete not implemented');
            }
            if (spec.transformListItem) {
                // TODO - array of path/index/transform[Overwrite|Delete|ListItem]
                throw new Error('transformListItem not implemented');
            }
        }
        block.item = expanded;
    }
}

const processItems = async function(apid, items) {
    let application = new Application(items);
    let name        = application.name();

    storedApplications[name] = application;

    Log(`Application processed: ${application}`);

    //
    // Flatten composites into a non-hierarchical set of component blocks
    //

    //
    // Annotate all interfaces with peer (opposite polarity) interfaces.
    // Make a list of unused interfaces to report.
    //

    //
    // Assign routing keys to each connector
    //

    //
    // Allocate components to sites
    //

    //
    // Generate per-site Yaml:  Components, Skupper Listeners, Skupper Connectors, NetworkPolicies
    //
}

exports.Start = async function() {
    Log('[Compose module starting]');
}

exports.PostYaml = async function(apid, req, res) {
    if (req.is('application/yaml')) {
        try {
            let items = yaml.loadAll(req.body);
            await processItems(apid, items);
            res.status(200).send('OK');
        } catch (error) {
            res.status(500).send(error.stack);
        }
    } else {
        res.status(400).send('Not YAML');
    }
}