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
const db   = require('./db.js');

const COMPOSE_PREFIX = '/compose/v1alpha1/';
const API_VERSION    = 'skupperx.io/compose/v1alpha1';
const TYPE_COMPONENT = 'skupperx.io/component';
const TYPE_CONNECTOR = 'skupperx.io/connector';
const TYPE_MIXED     = 'skupperx.io/mixed';
const TYPE_INGRESS   = 'skupperx.io/ingress';

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
        this.ownerRef     = ownerRef;
        this.name         = name;
        this.role         = role;
        this.polarity     = polarity;
        this.blockType    = blockType;
        this.binding      = undefined;
        this.boundThrough = false;

        Log(`Constructed: ${this}`);
    }

    toString() {
        return `BlockInterface ${this.ownerRef.name}.${this.name} (${this.blockType}.${this.role}) ${this.polarity ? 'north' : 'south'}`;
    }

    setBinding(binding) {
        this.binding = binding;
    }

    setBoundThrough() {
        this.boundThrough = true;
    }

    hasBinding() {
        return !!this.binding || this.boundThrough;
    }
}

class InstanceBlock {
    constructor(libraryBlock, name) {
        this.libraryBlock = libraryBlock;
        this.name         = name;
        this.labels       = {};
        this.interfaces   = {};

        const ilist = libraryBlock.object().spec.interfaces;
        if (ilist) {
            for (const iface of ilist) {
                this.interfaces[iface.name] = new BlockInterface(this, iface.name, iface.role, iface.polarity, iface.blockType);
            }
        }

        Log(`Constructed: ${this}`);
    }

    toString() {
        return `InstanceBlock ${this.name} [${this.libraryBlock}]`;
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
        } else if (this.blockType == TYPE_CONNECTOR || this.blockType == TYPE_INGRESS) {
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
                throw new Error(`Attempting to bind an interface that is already bound: ${ref}`);
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
        return `InterfaceBinding [${this.northRef}] <=> [${this.southRef}]`;
    }
}

class Application {
    constructor(items) {
        this.application = undefined;
        this.componentLibrary = {}; // Component blocks indexed by name
        this.connectorLibrary = {}; // Connector blocks indexed by name
        this.mixedLibrary     = {}; // Mixed blocks indexed by name
        this.ingressLibrary   = {}; // Ingresses indexed by name

        this.instanceBlocks      = {}; // Blocks referenced in the application tree by their deployed names
        this.bindings            = []; // List of north/south interface bindings
        this.unmatchedInterfaces = []; // List of (block-name; interface-name) for unconnected interfaces

        //
        // Parse the items list and collate into objects for various kinds of Blocks.
        // We also need to find exactly one Application object.
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
                    } else if (item.type == TYPE_INGRESS) {
                        this.ingressLibrary[name] = new LibraryBlock(item, TYPE_INGRESS);
                    } else {
                        Log(`Unrecognized block type: ${item.type}`);
                    }
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
        for (var list of [this.componentLibrary, this.connectorLibrary, this.mixedLibrary, this.ingressLibrary]) {
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
        return `Application ${this.name()}`;
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

        //
        // Build a list of unpaired interfaces.
        //
        for (const block of Object.values(this.instanceBlocks)) {
            for (const iface of Object.values(block.interfaces)) {
                if (!iface.hasBinding()) {
                    this.unmatchedInterfaces.push(iface);
                    Log(`Unbound interface: ${iface}`);
                }
            }
        }
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
                const libraryChild = this.componentLibrary[child.block] || this.connectorLibrary[child.block] || this.mixedLibrary[child.block] || this.ingressLibrary[child.block];
                if (!libraryChild) {
                    throw new Error(`Composite component ${instanceName} references a nonexistent library block ${child.block}`);
                }
                const subPath = path + child.name;
                this.instanceBlocks[subPath] = new InstanceBlock(libraryChild, subPath);
                this.instantiateComponent(subPath + '/', libraryChild, child.name);
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
                                        const recurseBlock         = this.instanceBlocks[instanceBlock.name + '/' + cblock.name];
                                        const recurseInterfaceName = cbinding.interface;
                                        const result = this.findBaseInterface(recurseBlock, recurseInterfaceName);

                                        //
                                        // Mark the intermediate interface as bound-through.  This will prevent it from being flagged
                                        // later as an unbound interface.
                                        //
                                        const throughInterface = instanceBlock.findInterface(cbinding.super);
                                        throughInterface.setBoundThrough();

                                        return result;
                                    }
                                }
                            }
                        }
                    } else {
                        const result = instanceBlock.findInterface(interfaceName);
                        if (result) {
                            return result;
                        } // else fall through to the throw at the end of the function.
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
}

const validateBlock = async function(block, validTypes, validRoles, blockRevisions) {
    if (typeof(block) != "object") {
        return "Non-object element received";
    }

    if (block.apiVersion != API_VERSION) {
        return `Unknown apiVersion: ${block.apiVersion}`;
    }

    if (block.kind != 'Block') {
        return `Expected record of type Block, got ${block.kind}`;
    }

    if (typeof(block.metadata) != "object") {
        return 'Record does not have metadata';
    }

    if (!block.metadata.name) {
        return 'Record does not have metadata.name';
    }

    const name = block.metadata.name;

    let allowNorth = false;
    let allowSouth = false;
    if (block.type && validTypes[block.type]) {
        allowNorth = validTypes[block.type].allowNorth;
        allowSouth = validTypes[block.type].allowSouth;
    } else {
        return `Invalid block type: ${block.type}`;
    }

    if (blockRevisions[name] && blockRevisions[name].btype != block.type) {
        return `Block ${name} conflicts with another block of the same name but different type`;
    }

    const polarityMandatory    = allowNorth && allowSouth;
    const defaultPolarityNorth = allowNorth;

    if (typeof(block.spec) != "object") {
        return 'Record does not have a spec';
    }

    if (block.spec.interfaces) {
        for (const iface of block.spec.interfaces) {
            if (!iface.name) {
                return `Interface in block ${name} with no name`;
            }

            if (!iface.role || !(validRoles.indexOf(iface.role) >= 0)) {
                return `Invalid role in block ${name}, interface ${iface.name}`;
            }

            if (iface.polarity === undefined) {
                if (polarityMandatory) {
                    return `Missing mandatory polarity for interface ${iface.name}, block ${name}`;
                }

                iface.polarity = defaultPolarityNorth ? 'north' : 'south';
            } else {
                if (iface.polarity != 'north' && iface.polarity != 'south') {
                    return `Polarity must be 'north' or 'south' for interface ${iface.name}, block ${name}`
                }

                if (iface.polarity == 'north' && !allowNorth) {
                    return `North polarity not permitted for interface ${iface.name}, block ${name}`;
                }

                if (iface.polarity == 'south' && !allowSouth) {
                    return `South polarity not permitted for interface ${iface.name}, block ${name}`;
                }
            }
        }
    }

    if (!block.spec.body) {
        return `Record (${name}) does not have a spec.body`;
    }

    return undefined;
}

const importBlock = async function(client, block, blockRevisions) {
    const name = block.metadata.name;

    const newRevision = blockRevisions[name] ? blockRevisions[name].revision + 1 : 1;
    await client.query("INSERT INTO LibraryBlocks (Type, Name, Revision, Format, Interfaces, SpecBody) VALUES ($1, $2, $3, 'application/yaml', $4, $5)",
                       [block.type, name, newRevision, yaml.dump(block.spec.interfaces), yaml.dump(block.spec.body)]);
}

const postLibraryBlocks = async function(req, res) {
    if (req.is('application/yaml')) {
        const client = await db.ClientFromPool();
        try {
            await client.query("BEGIN");
            let items = yaml.loadAll(req.body);

            //
            // Get the set of valid block types.
            //
            let validTypes = {};
            const result = await client.query("SELECT Name, AllowNorth, AllowSouth FROM BlockTypes");
            for (const row of result.rows) {
                validTypes[row.name] = {
                    allowNorth : row.allownorth,
                    allowSoute : row.allowsouth
                };
            }

            //
            // Get the set of valid interface roles.
            //
            let validRoles = [];
            const roleResult = await client.query("SELECT Name FROM InterfaceRoles");
            for (const row of roleResult.rows) {
                validRoles.push(row.name);
            }

            //
            // Get a list of block names with their revision numbers
            //
            var blockRevisions = {};
            const blockResult = await client.query("SELECT Name, Type, Revision FROM LibraryBlocks");
            for (const br of blockResult.rows) {
                if (!blockRevisions[br.name] || blockRevisions[br.name].revision < br.revision) {
                    blockRevisions[br.name] = {
                        revision : br.revision,
                        btype    : br.type,
                    };
                }
            }

            //
            // Validate the items.  Ensure they are all Blocks with valid types, names, and specs
            //
            for (const block of items) {
                const errorText = await validateBlock(block, validTypes, validRoles, blockRevisions);
                if (errorText) {
                    res.status(400).send(`Bad Request - ${errorText}`);
                    await client.query("ROLLBACK");
                    return;
                }
            }

            //
            // Import the validated blocks into the database
            //
            for (const block of items) {
                await importBlock(client, block, blockRevisions);
            }
            await client.query("COMMIT");
            res.status(200).send('OK');
        } catch (error) {
            res.status(500).send(error.stack);
            await client.query("ROLLBACK");
        } finally {
            client.release();
        }
    } else {
        res.status(400).send('Not YAML');
    }
}

const listLibraryBlocks = async function(req, res) {
    var   returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT Id, Type, Name, Revision, Created FROM LibraryBlocks");
        res.status(returnStatus).json(result.rows);
        await client.query("COMMIT");
    } catch (error) {
        Log(`Exception in listLibraryBlocks: ${error.message}`);
        await client.query("ROLLBACK");
        returnStatus = 500;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const getLibraryBlock = async function(blockid, req, res) {
    var   returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT * FROM LibraryBlocks WHERE Id = $1", [blockid]);
        if (result.rowCount == 1) {
            res.status(returnStatus).json(result.rows[0]);
        } else {
            returnStatus = 404;
            res.status(returnStatus).send('Not Found');
        }
        await client.query("COMMIT");
    } catch (error) {
        Log(`Exception in getLibraryBlock: ${error.message}`);
        await client.query("ROLLBACK");
        returnStatus = 500;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const postYaml = async function(apid, req, res) {
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

exports.ApiInit = function(app) {
    app.post(COMPOSE_PREFIX + 'library/blocks', async (req, res) => {
        await postLibraryBlocks(req, res);
    });

    app.get(COMPOSE_PREFIX + 'library/blocks', async (req, res) => {
        await listLibraryBlocks(req, res);
    });

    app.get(COMPOSE_PREFIX + 'library/block/:blockid', async (req, res) => {
        await getLibraryBlock(req.params.blockid, req, res);
    });

    app.post(COMPOSE_PREFIX + 'application/:apid/submit', async (req, res) => {  // TODO - Deprecate this in favor of better workflow.
        await postYaml(req.params.apid, req, res);
    });
}

exports.Start = async function() {
    Log('[Compose module starting]');
}
