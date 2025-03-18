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
const BUILD_ERROR    = 'build-error';

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

class BuildLog {
    constructor(disabled) {
        this.disabled = !!disabled;
        this.text     = `Build log started ${new Date().toISOString()}\n`;
        this.result   = 'build-complete';
    }

    log(line) {
        this.text += line + '\n';
    }

    warning(line) {
        this.result = 'build-warnings';
        this.text += 'WARNING: ' + line + '\n';
    }

    error(line) {
        this.result = 'build-errors';
        this.text += 'ERROR: ' + line + '\n';
        if (!this.disabled) {
            throw new Error(BUILD_ERROR);
        }
    }

    getText() {
        return this.text;
    }

    getResult() {
        return this.result;
    }
}

class BlockInterface {
    constructor(ownerRef, ifaceSpec, blockType, buildLog) {
        this.ownerRef     = ownerRef;
        this.name         = ifaceSpec.name;
        this.role         = ifaceSpec.role;
        this.polarity     = ifaceSpec.polarity == 'north';
        this.blockType    = blockType;
        this.maxBindings  = ifaceSpec.maxBindings ? ifaceSpec.maxBindings == 'unlimited' ? 0 : parseInt(ifaceSpec.maxBindings) : 1;
        this.bindings     = [];
        this.boundThrough = false;

        buildLog.log(`    ${this}`);
    }

    toString() {
        return `BlockInterface ${this.ownerRef.name}.${this.name} (${this.blockType}.${this.role}) ${this.polarity ? 'north' : 'south'} max:${this.maxBindings}`;
    }

    getName() {
        return this.name;
    }

    getOwner() {
        return this.ownerRef;
    }

    addBinding(binding) {
        this.bindings.push(binding);
    }

    setBoundThrough() {
        this.boundThrough = true;
    }

    canAcceptBinding() {
        return this.maxBindings == 0 || this.bindings.length < this.maxBindings;
    }

    hasBinding() {
        return this.bindings.length > 0 || this.boundThrough;
    }
}

class InstanceBlock {
    constructor(libraryBlock, name, buildLog) {
        this.libraryBlock = libraryBlock;
        this.name         = name;
        this.labels       = {};
        this.interfaces   = {};
        this.derivative   = {};
        this.dbid         = null;

        buildLog.log(`${this}`);

        const ilist = libraryBlock.object().spec.interfaces;
        if (ilist) {
            for (const iface of ilist) {
                this.interfaces[iface.name] = new BlockInterface(this, iface, iface.blockType || libraryBlock.nameNoRev(), buildLog);
            }
        }
    }

    toString() {
        return `InstanceBlock ${this.name} [${this.libraryBlock}]`;
    }

    setDatabaseId(id) {
        this.dbid = id;
    }

    databaseId() {
        return this.dbid;
    }

    setLabel(key, value) {
        this.labels[key] = value;
    }

    addDerivative(key, value) {
        this.derivative[key] = value;
    }

    getDerivative() {
        return this.derivative;
    }

    object() {
        return this.libraryBlock.object();
    }

    findInterface(name) {
        return this.interfaces[name];
    }

    getLibraryBlock() {
        return this.libraryBlock;
    }

    libraryBlockDatabaseId() {
        return this.libraryBlock.databaseId();
    }
}

class LibraryBlock {
    constructor(dbRecord, buildLog) {
        this.item = {
            apiVersion : API_VERSION,
            kind       : 'Block',
            type       : dbRecord.type,
            metadata   : {
                name     : dbRecord.name,
                revision : dbRecord.revision,
            },
            spec : {
                interfaces : yaml.load(dbRecord.interfaces),
                body       : yaml.load(dbRecord.specbody),
            }
        };
        this.flag = false;
        this.dbid = dbRecord.id;

        buildLog.log(`${this}`);
    }

    toString() {
        return `LibraryBlock ${this.name()} (${this.item.type})`;
    }

    name() {
        return `${this.item.metadata.name};${this.item.metadata.revision}`;
    }

    nameNoRev() {
        return this.item.metadata.name;
    }

    getType() {
        return this.item.type;
    }

    databaseId() {
        return this.dbid;
    }

    object() {
        return this.item;
    }

    isComposite() {
        return !!this.item.spec.body.composite;
    }

    overWriteObject(updated) {
        this.item = updated;
    }

    expandFrom() {
        return this.item.spec.body.base;
    }

    body() {
        return this.item.spec.body;
    }

    setFlag(value) {
        this.flag = !!value;
    }

    isFlagSet() {
        return this.flag;
    }
}

class InterfaceBinding {
    constructor(left, right, buildLog) {
        if (left.polarity == right.polarity) {
            buildLog.error(`Attempting to bind interfaces with the same polarity: ${left}, ${right}`)
        }

        this.northRef = left.polarity ? left : right;
        this.southRef = left.polarity ? right : left;

        for (const ref of [this.southRef, this.northRef]) {
            if (!ref.canAcceptBinding()) {
                buildLog.error(`Attempting to bind an interface that will exceed the interface's maxBinding count: ${ref}`)
            }
        }

        if (this.southRef.role != this.northRef.role) {
            buildLog.error(`Attempting to bind interfaces with different roles: ${this.southRef}, ${this.northRef}`)
        }

        // TODO - check the compatibility of the block-types

        this.northRef.addBinding(this);
        this.southRef.addBinding(this);

        buildLog.log(`${this}`);
    }

    toString() {
        return `InterfaceBinding [${this.northRef}] <=> [${this.southRef}]`;
    }

    getNorthInterface() {
        return this.northRef;
    }

    getSouthInterface() {
        return this.southRef;
    }
}

class Application {
    constructor(rootBlockName, appName, van, libraryBlocks, buildLog) {
        this.rootBlockName       = rootBlockName;
        this.appName             = appName;
        this.van                 = van;
        this.libraryBlocks       = libraryBlocks;
        this.instanceBlocks      = {}; // Blocks referenced in the application tree by their deployed names
        this.bindings            = []; // List of north/south interface bindings
        this.unmatchedInterfaces = []; // List of (block-name; interface-name) for unconnected interfaces
        this.derivative          = {};

        //
        // Create Bindings for each pairing of BlockInterfaces
        //
        this.pairInterfaces(buildLog);

        buildLog.log(`${this}`);
    }

    toString() {
        return `Application ${this.name()}`;
    }

    name() {
        return this.appName;
    }

    addDerivative(key, value) {
        this.derivative[key] = value;
    }

    getDerivative() {
        return this.derivative;
    }

    getInstanceBlocks() {
        return this.instanceBlocks;
    }

    getBindings() {
        return this.bindings;
    }

    //
    // Create an InterfaceBinding object for every matched pair of opposite-polarity interfaces in the application.
    // The matched interfaces must involve monolithic (non-composite) components and connectors.
    // When complete, make a list of unmatched interfaces for reference.
    //
    pairInterfaces(buildLog) {
        this.bindings = [];
        this.unmatchedInterfaces = [];

        //
        // Recursively connect all of the interfaces
        //
        if (!this.libraryBlocks[this.rootBlockName]) {
            buildLog.error(`Application references non-existant root block: ${this.rootBlockName}`)
        }
        const rootBlock = this.libraryBlocks[this.rootBlockName];
        const path      = '/' + this.name();
        this.instanceBlocks[path] = new InstanceBlock(rootBlock, path, buildLog);
        this.instantiateSubComponents(path + '/', rootBlock, this.rootBlockName, buildLog);

        //
        // Build a list of unpaired interfaces.
        //
        for (const block of Object.values(this.instanceBlocks)) {
            for (const iface of Object.values(block.interfaces)) {
                if (!iface.hasBinding()) {
                    this.unmatchedInterfaces.push(iface);
                    buildLog.warning(`Unbound interface: ${iface}`);
                }
            }
        }
    }

    //
    // Recursive component instantiation function.
    //
    instantiateSubComponents(path, libraryBlock, instanceName, buildLog) {
        const body = libraryBlock.body();
        if (body.composite) {
            //
            // This is a composite block.  Begin by creating instances of all of the block's children.
            //
            for (const child of body.composite.blocks) {
                if (!child.name || !child.block) {
                    buildLog.error(`Invalid item in composite blocks for ${instanceName}`)
                }
                const libraryChild = this.libraryBlocks[child.block];
                if (!libraryChild) {
                    buildLog.error(`Composite component ${instanceName} references a nonexistent library block ${child.block}`)
                }
                const subPath = path + child.name;
                this.instanceBlocks[subPath] = new InstanceBlock(libraryChild, subPath, buildLog);
                this.instantiateSubComponents(subPath + '/', libraryChild, child.name, buildLog);
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
                            // No action is needed here because "super" bindings are
                            // resolved downward from composite blocks that instantiate
                            // this composite sub-block.
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

                            if (!remoteInstance) {
                                buildLog.error(`Unknown reference ${remoteBlockPath} in ${libraryBlock}`);
                            }

                            const childInterface  = this.findBaseInterface(childInstance, childInterfaceName, buildLog);
                            const remoteInterface = this.findBaseInterface(remoteInstance, remoteBlockInterfaceName, buildLog);

                            const ifBinding = new InterfaceBinding(childInterface, remoteInterface, buildLog);
                            this.bindings.push(ifBinding);
                        }
                    }
                }
            }
        }
    }

    //
    // Locate and return a reference to the base interface in an instance block by the interface's name.
    // If the instance block is composite, it may be necessary to recurse downward until a monolithic block is found.
    // Throw an error if the interface cannot be found.
    //
    findBaseInterface(instanceBlock, interfaceName, buildLog) {
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
                                        const result = this.findBaseInterface(recurseBlock, recurseInterfaceName, buildLog);

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

        buildLog.error(`Base Interface ${interfaceName} not found in block ${instanceBlock}`)
    }
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
    const name        = block.metadata.name;
    const newRevision = blockRevisions[name] ? blockRevisions[name].revision + 1 : 1;
    const ifObject    = yaml.dump(block.spec.interfaces);
    const bodyObject  = yaml.dump(block.spec.body);

    //
    // If there's an existing revision of this block, check to see if it is the same as the new one.
    // Only insert a new revision into the database if it is different from the current revision.
    //
    if (newRevision > 1) {
        const mostRecent = await client.query("SELECT Interfaces, SpecBody FROM LibraryBlocks WHERE Name = $1 AND Revision = $2", [name, newRevision - 1]);
        if (mostRecent.rowCount == 1
            && ifObject   == mostRecent.rows[0].interfaces
            && bodyObject == mostRecent.rows[0].specbody) {
            return 0;
        }
    }

    await client.query("INSERT INTO LibraryBlocks (Type, Name, Revision, Format, Interfaces, SpecBody) VALUES ($1, $2, $3, 'application/yaml', $4, $5)",
                       [block.type, name, newRevision, ifObject, bodyObject]);
    return 1;
}

//
// Recursive library loader by library block name
// Name syntax:  <blockname>         - latest revision
//               <blockname>;<rev>   - specified revision
//
const loadLibraryBlock = async function(client, library, blockName, buildLog) {
    const elements = blockName.split(';');
    const latest   = elements.length == 1;

    if (elements.length > 2) {
        buildLog.error(`Malformed library block name: ${blockName}`)
    }

    //
    // Fetch all revisions of this block from the database.
    //
    const result = await client.query("SELECT * FROM LibraryBlocks WHERE Name = $1 ORDER BY Revision DESC", [elements[0]]);

    if (result.rowCount == 0) {
        buildLog.error(`Library block ${elements[0]} not found`)
    }

    //
    // Identify the desired revision and get the latest and desired row records (they may be the same).
    //
    const revision = latest ? result.rows[0].revision : parseInt(elements[1]);
    const latestBlock = result.rows[0];
    var revisionBlock;

    for (var row of result.rows) {
        if (row.revision == revision) {
            revisionBlock = row;
            break;
        }
    }

    if (!revisionBlock) {
        buildLog.error(`Revision of library block not found: ${elements[0]};${revision}`)
    }

    //
    // Populate the library map with the latest and desired blocks.  If they are the same, alias the one object.
    // Don't overwrite any blocks already in the library.
    //
    if (!library[elements[0]]) {
        library[elements[0]] = new LibraryBlock(latestBlock, buildLog);
        library[`${elements[0]};${latestBlock.revision}`] = library[elements[0]];
    }

    if (latestBlock.revision != revisionBlock.revision && !library[`${elements[0]};${revision}`]) {
        library[`${elements[0]};${revision}`] = new LibraryBlock(revisionBlock, buildLog);
    }

    //
    // If the body of the desired block references other blocks (it's composite or derived), load those into the map as well.
    //
    const body = yaml.load(revisionBlock.specbody);
    if (typeof(body.composite) == "object") {
        for (const subblock of body.composite.blocks) {
            await loadLibraryBlock(client, library, subblock.block, buildLog)
        }
    } else if (body.base) {
        await loadLibraryBlock(client, library, body.base, buildLog);
    }
}

//
// Recursive block expander
//
const expandBlock = function(library, blockName, buildLog) {
    const block         = library[blockName];
    const baseBlockName = block.expandFrom();
    if (!!baseBlockName) {
        if (block.isFlagSet()) {
            buildLog.error(`Circular dependencies detected in hierarchy for block ${blockName}`)
        }
        block.setFlag(true);

        //
        // If the base block is unexpanded, recursively expand it before using it as a base.
        //
        const baseBlock = library[baseBlockName];
        if (!!baseBlock.expandFrom()) {
            expandBlock(library, baseBlock.name(), buildLog);
        }

        //
        // Do the expansion from the base.
        //
        let   expanded = block.object();
        const specbody = deepCopy(expanded.spec.body);
        if (specbody.base) {
            const parent = baseBlock.object();
            expanded.spec.body = deepCopy(parent.spec.body);
            if (specbody.transformOverwrite) {
                expanded.spec.body = deepAppend(expanded.spec.body, specbody.transformOverwrite);
            }
            if (specbody.transformDelete) {
                // TODO - array of paths to be removed from the base
                buildLog.error(`transformDelete not implemented in ${block}`);
            }
            if (specbody.transformListItem) {
                // TODO - array of path/index/transform[Overwrite|Delete|ListItem]
                buildLog.error(`ERROR: transformListItem not implemented in ${block}`);
            }
        }
        block.overWriteObject(expanded);
        block.setFlag(false);

        buildLog.log(`Expanded block ${block.name()} from base ${baseBlock.name()}`);
    }
}

//
// Expand derivative library blocks, recursively if necessary.
// Ensure that no block is derived from another not-yet-expanded derivative block.
// Detect and throw an error for circular derivation conditions.
//
const expandLibraryBlocks = function(library, buildLog) {
    for (const name of Object.keys(library)) {
        //
        // We will only process revisioned (non-aliased) blocks.
        //
        if (name.indexOf(';') > 0) {
            expandBlock(library, name, buildLog);
        }
    }
}

//
// Given a root block, create a map of library blocks referenced by the tree rooted at the root block.
// If any of the blocks are derived from other library blocks, expand those into their final form.
//
const loadLibrary = async function(client, rootBlockName, buildLog) {
    var   library = {};
    await loadLibraryBlock(client, library, rootBlockName, buildLog);
    expandLibraryBlocks(library, buildLog);
    return library;
}

const generateDerivativeData = function(application, buildLog, blockTypes) {
    const instanceBlocks = application.getInstanceBlocks();
    for (const [name, block] of Object.entries(instanceBlocks)) {
        const libraryBlock  = block.getLibraryBlock();
        const libraryRecord = libraryBlock.object();
        const body          = libraryRecord.spec.body;

        if (typeof(body) == "object") {
            if (body.address) {
                const rkey = `${body.address.keyPrefix || ''}${name}`;
                block.addDerivative('routingKey', rkey);
            } else if (body.addresses) {
                let value = [];
                for (const address of body.addresses) {
                    value.push(`${address.keyPrefix || ''}${name}`);
                }
                block.addDerivative('routingKeys', value);
            }
        }

        //
        // Generate an allocateToSite flag for appropriate blocks.
        //
        // Appropriate if:
        //    - The allocateToSite flag is TRUE for the block type
        //    - The block is not composite
        //
        const btype = libraryBlock.getType();
        if (blockTypes[btype].allocatetosite && !libraryBlock.isComposite()) {
            block.addDerivative('allocateToSite', true);
        }
    }
}

//
// For every instance block in the application, check for the allocateToSite flag.  If true,
// generate the configuration to allocate the block to this site.
//
// For every block that is allocated to this site, run through the interfaces and find the bound
// blocks for each interface.  Use the content of the bound blocks to generate interconnect configuration:
//   - Skupper listeners and connectors
//   - Deployed agents to handle active interconnect
//   - Kubernetes network policies to restrict access to that specified
//
const addMemberSite = async function(client, app, site, depid) {
}

const deleteMemberSite = async function(client, app, site, depid) {
}

const preLoadApplication = async function(client, appid) {
    if (storedApplications[appid]) {
        return storedApplications[appid];
    }

    storedApplications[appid] = new Application()
}

const deployApplication = async function(client, appid, vanid, depid) {
    const app    = await preLoadApplication(client, appid);
    const result = await client.query("SELECT Id, Metadata, SiteClasses FROM MemberSites WHERE MemberOf = $1", [vanid]);
    for (const site of result.rows) {
        await addMemberSite(client, app, site, depid);
    }
}

//=========================================================================================================
// API Functions
//=========================================================================================================
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
                    allowSouth : row.allowsouth,
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
            let importCount = 0;
            for (const block of items) {
                importCount += await importBlock(client, block, blockRevisions);
            }
            await client.query("COMMIT");
            res.status(201).send(`Imported ${importCount} Blocks`);
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
            'name'      : {type: 'string', optional: false},
            'rootblock' : {type: 'uuid',   optional: false},
        });

        const result = await client.query("INSERT INTO Applications (Name, RootBlock) VALUES ($1, $2) RETURNING Id",
                                          [norm.name, norm.rootblock]);
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
    var returnStatus = 200;
    const client   = await db.ClientFromPool();
    let   buildLog = new BuildLog();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT LibraryBlocks.Name as lbname, LibraryBlocks.Revision, Applications.Name as appname, Lifecycle FROM Applications " +
                                          "JOIN LibraryBlocks ON LibraryBlocks.Id = RootBlock " +
                                          "WHERE Applications.Id = $1", [apid]);
        if (result.rowCount == 1) {
            const app = result.rows[0];

            //
            // Prevent against re-building applications that are deployed.  This needs to be well thought-through.
            //
            if (app.lifecycle == 'deployed') {
                buildLog.error('Cannot build an application that is deployed');
            }

            //
            // Get an in-memory cache of the library blocks referenced from the root block.
            //
            const rootBlockName = `${app.lbname};${app.revision}`;
            const library = await loadLibrary(client, rootBlockName, buildLog);

            //
            // Construct the application, resolving all of the inter-block bindings.
            //
            const application = new Application(rootBlockName, app.appname, null, library, buildLog);
            storedApplications[apid] = application;

            //
            // Get the block types to feed into the derivative generator.
            //
            const btypes = await client.query("SELECT * FROM BlockTypes");
            let   blockTypes = {};
            for (const rec of btypes.rows) {
                blockTypes[rec.name] = rec;
            }

            //
            // Generate the derivative data
            //
            generateDerivativeData(application, buildLog, blockTypes);

            //
            // Generate database entries for the instance blocks.
            //
            await client.query("DELETE FROM Bindings WHERE Application = $1", [apid]);
            await client.query("DELETE FROM InstanceBlocks WHERE Application = $1", [apid]);
            const instanceBlocks = application.getInstanceBlocks();
            for (const [name, block] of Object.entries(instanceBlocks)) {
                const result = await client.query("INSERT INTO InstanceBlocks (Application, LibraryBlock, InstanceName, Derivative) VALUES ($1, $2, $3, $4) RETURNING Id",
                                                  [apid, block.libraryBlockDatabaseId(), name, JSON.stringify(block.getDerivative())]);
                if (result.rowCount == 1) {
                    block.setDatabaseId(result.rows[0].id);
                }
            }

            //
            // Insert Bindings records into the database
            //
            const bindings = application.getBindings();
            for (const binding of bindings) {
                const northInterface = binding.getNorthInterface();
                const northBlock     = northInterface.getOwner();
                const southInterface = binding.getSouthInterface();
                const southBlock     = southInterface.getOwner();
                await client.query("INSERT INTO Bindings (Application, NorthBlock, NorthInterface, SouthBlock, SouthInterface) " +
                                   "VALUES ($1, $2, $3, $4, $5)",
                                   [apid, northBlock.databaseId(), northInterface.getName(), southBlock.databaseId(), southInterface.getName()]);
            }

            //
            // Add final success log
            //
            if (buildLog.getResult() == 'build-warnings') {
                buildLog.log("WARNING: Build completed with warnings");
            } else {
                buildLog.log("SUCCESS: Build completed successfully");
            }

            //
            // Update the lifecycle of the application and add the build log.
            //
            await client.query("UPDATE Applications SET Lifecycle = $3, BuildLog = $2 WHERE Id = $1", [apid, buildLog.getText(), buildLog.getResult()]);
        }
        await client.query("COMMIT");
        res.status(returnStatus).send('Ok - See build log for details');
    } catch (error) {
        if (error.message == BUILD_ERROR) {
            //
            // If we got a build error, update the build log for user visibility.
            //
            await client.query("UPDATE Applications SET Lifecycle = $3, BuildLog = $2 WHERE Id = $1", [apid, buildLog.getText(), buildLog.getResult()]);
            await client.query("COMMIT");
            returnStatus = 200;
            res.status(returnStatus).send("Ok - See build log for build errors");
        } else {
            await client.query("ROLLBACK");
            returnStatus = 400;
            res.status(returnStatus).send(error.stack);
        }
    } finally {
        client.release();
    }

    return returnStatus;
}

const listApplications = async function(req, res) {
    var   returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT Id, Name, RootBlock, Lifecycle FROM Applications");
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
        const result = await client.query("SELECT * FROM Applications WHERE Id = $1", [apid]);
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

const getApplicationBuildLog = async function(apid, req, res) {
    var   returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT BuildLog FROM Applications WHERE Id = $1", [apid]);
        if (result.rowCount == 1) {
            res.status(returnStatus).send(result.rows[0].buildlog);
        } else {
            returnStatus = 404;
            res.status(returnStatus).send('Not Found');
        }
        await client.query("COMMIT");
    } catch (error) {
        Log(`Exception in getApplicationBuildLog: ${error.message}`);
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
        await client.query("DELETE FROM Bindings WHERE Application = $1", [apid]);
        await client.query("DELETE FROM InstanceBlocks WHERE Application = $1", [apid]);
        const result = await client.query("DELETE FROM Applications WHERE Id = $1", [apid]);
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

const postDeployment = async function(req, res) {
    var returnStatus = 201;
    const client = await db.ClientFromPool();
    const form = new formidable.IncomingForm();
    try {
        await client.query("BEGIN");
        const [fields, files] = await form.parse(req);
        const norm = util.ValidateAndNormalizeFields(fields, {
            'app' : {type: 'uuid', optional: false},
            'van' : {type: 'uuid', optional: false},
        });

        const result = await client.query("INSERT INTO DeployedApplications (Application, Van) VALUES ($1, $2) RETURNING Id",
                                          [norm.app, norm.van]);
        if (result.rowCount == 1) {
            await deployApplication(client, norm.app, norm.van, result.rows[0].id);
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

const listDeployments = async function(req, res) {
    var   returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT Id, Application, Van FROM DeployedApplications");
        res.status(returnStatus).json(result.rows);
        await client.query("COMMIT");
    } catch (error) {
        Log(`Exception in listDeployments: ${error.message}`);
        await client.query("ROLLBACK");
        returnStatus = 500;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const getDeployment = async function(depid, req, res) {
    var   returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT * FROM DeployedApplications WHERE Id = $1", [depid]);
        if (result.rowCount == 1) {
            res.status(returnStatus).json(result.rows[0]);
        } else {
            returnStatus = 404;
            res.status(returnStatus).send('Not Found');
        }
        await client.query("COMMIT");
    } catch (error) {
        Log(`Exception in getDeployment: ${error.message}`);
        await client.query("ROLLBACK");
        returnStatus = 500;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const deleteDeployment = async function(depid, req, res) {
    var   returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        await client.query("DELETE FROM SiteData WHERE DeployedApplication = $1", [depid]);
        const result = await client.query("DELETE FROM DeployedApplications WHERE Id = $1 RETURNING Application", [depid]);
        if (result.rowCount != 1) {
            returnStatus = 404;
            res.status(returnStatus).send('Not Found');
        } else {
            const appid = result.rows[0].application;
            const listResult = await client.query("SELECT Id FROM DeployedApplications WHERE Application = $1", [appid]);
            if (listResult.rowCount == 0) {
                //
                // If we just deleted the last deployment of the application, move its lifecycle back to 'build-complete'.
                //
                await client.query("UPDATE Applications SET LifeCycle = 'build-complete' WHERE Id = $1", [appid]);
            }
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

const getSiteData = async function(depid, siteid, req, res) {
    var   returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT Configuration FROM SiteData WHERE DeployedApplication = $1 AND MemberSite = $2", [depid, siteid]);
        if (result.rowCount == 1) {
            res.status(returnStatus).send(result.rows[0].configuration);
        } else {
            returnStatus = 404;
            res.status(returnStatus).send('Not Found');
        }
        await client.query("COMMIT");
    } catch (error) {
        Log(`Exception in getSiteData: ${error.message}`);
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

    app.get(COMPOSE_PREFIX + 'applications', async (req, res) => {
        await listApplications(req, res);
    });

    app.get(COMPOSE_PREFIX + 'application/:apid', async (req, res) => {
        await getApplication(req.params.apid, req, res);
    });

    app.get(COMPOSE_PREFIX + 'application/:apid/log', async (req, res) => {
        await getApplicationBuildLog(req.params.apid, req, res);
    });

    app.delete(COMPOSE_PREFIX + 'application/:apid', async (req, res) => {
        await deleteApplication(req.params.apid, req, res);
    });

    app.post(COMPOSE_PREFIX + 'deployment', async (req, res) => {
        await postDeployment(req, res);
    });

    app.get(COMPOSE_PREFIX + 'deployments', async (req, res) => {
        await listDeployments(req, res);
    });

    app.get(COMPOSE_PREFIX + 'deployment/:depid', async (req, res) => {
        await getDeployment(req.params.depid, req, res);
    });

    app.delete(COMPOSE_PREFIX + 'deployment/:depid', async (req, res) => {
        await deleteDeployment(req.params.depid, req, res);
    });

    app.get(COMPOSE_PREFIX + 'deployment/:depid/sitedata/:siteid', async (req, res) => {
        await getSiteData(req.params.depid, req.params.siteid, req, res);
    });
}

exports.Start = async function() {
    Log('[Compose module starting]');
}

exports.AddMemberSite = async function(siteid) {
}

exports.DeleteMemberSite = async function(siteid) {
}

