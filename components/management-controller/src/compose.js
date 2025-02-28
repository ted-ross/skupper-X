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

const yaml       = require('js-yaml');
const Log        = require('./common/log.js').Log;
const db         = require('./db.js');
const formidable = require('formidable');
const util       = require('./common/util.js');

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
    constructor(name, blockType, specInterfaces, specBody) {
        this.item = {
            apiVersion : 'skupperx.io/compose/v1alpha1',
            kind       : 'Block',
            type       : blockType,
            metadata   : {
                name : name,
            },
            spec : {
                interfaces : specInterfaces,
                body       : specBody,
            }
        };

        Log(`Constructed: ${this}`);
    }

    toString() {
        return `LibraryBlock ${this.item.metadata.name} (${this.item.type})`;
    }

    name() {
        return this.item.metadata.name;
    }

    object() {
        return this.item;
    }

    isDerivative() {
        return !!this.item.spec.body.base;
    }

    body() {
        return this.item.spec.body;
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
    constructor(rootBlock, van, libraryBlocks) {
        this.rootBlock           = rootBlock;
        this.van                 = van;
        this.libraryBlocks       = libraryBlocks;
        this.instanceBlocks      = {}; // Blocks referenced in the application tree by their deployed names
        this.bindings            = []; // List of north/south interface bindings
        this.unmatchedInterfaces = []; // List of (block-name; interface-name) for unconnected interfaces

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
                const libraryChild = this.libraryBlocks[child.block];
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

//
// Recursive library loader
//
const loadLibraryBlock = async function(client, library, blockName) {
    const result = await client.query("SELECT * FROM LibraryBlocks WHERE Name = $1 ORDER BY Revision DESC LIMIT 1", [blockName]);
    if (result.rowCount == 0) {
        throw new Error(`Library block ${blockName} not found`);
    }

    const block = result.rows[0];
    const body  = yaml.parse(block.specbody);
    library[block.name] = new LibraryBlock(block.name, block.type, yaml.parse(block.interfaces), body);

    if (typeof(body.composite) == "object") {
        for (const subblock of body.composite.blocks) {
            loadLibraryBlock(client, library, subblock.block)
        }
    } else if (body.base) {
        loadLibraryBlock(client, library, body.base);
    }
}

//
// Expand derivative library blocks, recursively if necessary.
//
const expandLibraryBlock = function(library, name) {

}

//
// Given a root block, create a map of library blocks referenced by the tree rooted at the root block.
// If any of the blocks are derived from other library blocks, expand those into their final form.
//
const loadLibrary = async function(rootBlockName) {
    const client  = await db.ClientFromPool();
    var   library = {};
    try {
        await client.query("BEGIN");
        loadLibraryBlock(client, library, rootBlockName);

        for (const [name, lblock] of Object.entries(library)) {
            if (lblock.isDerivative()) {
                expandLibraryBlock(library, name);
            }
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Exception in library loading: ${error.message}`);
    } finally {
        client.release();
    }

    return library;
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
            res.status(201).send('Created');
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

const deleteLibraryBlock = async function(blockid, req, res) {
    var   returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("DELETE FROM LibraryBlocks WHERE Id = $1", [blockid]);
        if (result.rowCount != 1) {
            returnStatus = 404;
            res.status(returnStatus).send('Not Found');
        } else {
            res.status(returnStatus).send('Deleted');
        }
        await client.query("COMMIT");
    } catch (error) {
        Log(`Exception in deleteLibraryBlock: ${error.message}`);
        await client.query("ROLLBACK");
        returnStatus = 500;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const postApplication = async function(req, res) {
    var returnStatus = 201;
    const client = await db.ClientFromPool();
    const form = new formidable.IncomingForm();
    try {
        await client.query("BEGIN");
        const [fields, files] = await form.parse(req);
        const norm = util.ValidateAndNormalizeFields(fields, {
            'rootblock' : {type: 'uuid', optional: false},
            'van'       : {type: 'uuid', optional: false},
        });

        const result = await client.query("INSERT INTO DeployedApplications (RootBlock, Van) VALUES ($1, $2) RETURNING Id",
                                          [norm.rootblock, norm.van]);
        if (result.rowCount == 1) {
            res.status(returnStatus).json(result.rows[0]);
        } else {
            returnStatus = 400;
            res.status(returnStatus).send(result.error);
        }

        await client.query("COMMIT");
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
        await client.query("ROLLBACK");
    } finally {
        client.release();
    }

    return returnStatus;
}

const buildApplication = async function(apid, req, res) {
}

const deployApplication = async function(apid, req, res) {
}

const listApplications = async function(req, res) {
    var   returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT Id, RootBlock, Van, Lifecycle FROM DeployedApplications");
        res.status(returnStatus).json(result.rows);
        await client.query("COMMIT");
    } catch (error) {
        Log(`Exception in listApplications: ${error.message}`);
        await client.query("ROLLBACK");
        returnStatus = 500;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const getApplication = async function(apid, req, res) {
    var   returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT * FROM DeployedApplications WHERE Id = $1", [apid]);
        if (result.rowCount == 1) {
            res.status(returnStatus).json(result.rows[0]);
        } else {
            returnStatus = 404;
            res.status(returnStatus).send('Not Found');
        }
        await client.query("COMMIT");
    } catch (error) {
        Log(`Exception in getApplication: ${error.message}`);
        await client.query("ROLLBACK");
        returnStatus = 500;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const deleteApplication = async function(apid, req, res) {
    var   returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("DELETE FROM DeployedApplications WHERE Id = $1", [apid]);
        if (result.rowCount != 1) {
            returnStatus = 404;
            res.status(returnStatus).send('Not Found');
        } else {
            res.status(returnStatus).send('Deleted');
        }
        await client.query("COMMIT");
    } catch (error) {
        Log(`Exception in deleteApplication: ${error.message}`);
        await client.query("ROLLBACK");
        returnStatus = 500;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
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

    app.delete(COMPOSE_PREFIX + 'library/block/:blockid', async (req, res) => {
        await deleteLibraryBlock(req.params.blockid, req, res);
    });

    app.post(COMPOSE_PREFIX + 'application', async (req, res) => {
        await postApplication(req, res);
    });

    app.put(COMPOSE_PREFIX + 'application/:apid/build', async (req, res) => {
        await buildApplication(req.params.apid, req, res);
    });

    app.put(COMPOSE_PREFIX + 'application/:apid/deploy', async (req, res) => {
        await deployApplication(req.params.apid, req, res);
    });

    app.get(COMPOSE_PREFIX + 'applications', async (req, res) => {
        await listApplications(req, res);
    });

    app.get(COMPOSE_PREFIX + 'application/:apid', async (req, res) => {
        await getApplication(req.params.apid, req, res);
    });

    app.delete(COMPOSE_PREFIX + 'application/:apid', async (req, res) => {
        await deleteApplication(req.params.apid, req, res);
    })
}

exports.Start = async function() {
    Log('[Compose module starting]');
}
