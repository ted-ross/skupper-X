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

const express    = require('express');
const yaml       = require('js-yaml');
const Log        = require('./common/log.js').Log;
const db         = require('./db.js');
const formidable = require('formidable');
const util       = require('./common/util.js');
const ident      = require('./ident.js');

const COMPOSE_PREFIX = '/compose/v1alpha1/';
const API_VERSION    = 'skupperx.io/compose/v1alpha1';
const PROCESS_ERROR  = 'process-error';

var cachedApplications = {};

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
    let modified = deepCopy(base);
    if (typeof(overlay) === 'object') {
        for (const [key, value] of Object.entries(overlay)) {
            modified[key] = deepAppend(modified[key], value);
        }
        return modified;
    } else {
        return overlay;
    }
}

class ProcessLog {
    constructor(enabled, kind) {
        this.kind     = kind || 'unused';
        this.kindCap  = this.kind.charAt(0).toUpperCase() + this.kind.slice(1);
        this.disabled = !enabled;
        this.text     = `${this.kindCap} log started ${new Date().toISOString()}\n`;
        this.result   = `${this.kind}-complete`;
    }

    log(line) {
        this.text += line + '\n';
    }

    warning(line) {
        this.result = `${this.kind}-warnings`;
        this.text += 'WARNING: ' + line + '\n';
    }

    error(line) {
        this.result = `${this.kind}-errors`;
        this.text += 'ERROR: ' + line + '\n';
        if (!this.disabled) {
            throw new Error(PROCESS_ERROR);
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
        this.ownerRef      = ownerRef;
        this.name          = ifaceSpec.name;
        this.role          = ifaceSpec.role;
        this.polarity      = ifaceSpec.polarity == 'north';
        this.blockType     = blockType;
        this.maxBindings   = ifaceSpec.maxBindings ? ifaceSpec.maxBindings == 'unlimited' ? 0 : parseInt(ifaceSpec.maxBindings) : 1;
        this.bindings      = [];
        this.boundThrough  = false;
        this.metadata      = {};

        this.metadata = deepCopy(ifaceSpec);

        buildLog.log(`    ${this}`);
    }

    toString() {
        return `BlockInterface ${this.ownerRef.name}.${this.name} (${this.blockType}.${this.role}) ${this.polarity ? 'north' : 'south'} max:${this.maxBindings ? this.maxBindings : 'unl'}`;
    }

    getName() {
        return this.name;
    }

    getOwner() {
        return this.ownerRef;
    }

    getRole() {
        return this.role;
    }

    getData(key) {
        return this.metadata[key];
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

    getBindings() {
        return this.bindings;
    }

    isNorth() {
        return this.polarity;
    }
}

class InstanceBlock {
    constructor(instanceConfig) {
        this.libraryBlock = undefined;
        this.name         = undefined;
        this.config       = instanceConfig;
        this.interfaces   = {};
        this.derivative   = {};
        this.dbid         = null;
        this.metadata     = {};
        this.flag         = false;
    }

    _buildInterfaces(buildLog) {
        const ilist = this.libraryBlock.interfaces();
        if (ilist) {
            for (const iface of ilist) {
                this.interfaces[iface.name] = new BlockInterface(this, iface, iface.blockType || this.libraryBlock.nameNoRev(), buildLog);
            }
        }
    }

    buildFromApi(libraryBlock, name, buildLog) {
        this.libraryBlock = libraryBlock;
        this.name         = name;

        const libConfig = libraryBlock.config();
        if (!!libConfig) {
            this.metadata = deepAppend(libConfig, this.config);
        }

        this.metadata.ident = ident.NewIdentity();

        buildLog.log(`${this}`);
        this._buildInterfaces(buildLog);
    }

    buildFromDatabase(row, libraryBlock, buildLog) {
        this.libraryBlock = libraryBlock;
        this.name         = row.instancename;
        this.dbid         = row.id;
        this.config       = JSON.parse(row.config);
        this.metadata     = JSON.parse(row.metadata);
        this.derivative   = JSON.parse(row.derivative);
        this._buildInterfaces(buildLog);
    }

    toString() {
        return `InstanceBlock(${this.metadata.ident}) ${this.name} [${this.libraryBlock}]`;
    }

    getName() {
        return this.name;
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

    getConfig() {
        return this.config;
    }

    getMetadata() {
        return this.metadata;
    }

    addDerivative(key, value) {
        this.derivative[key] = value;
    }

    getDerivative() {
        return this.derivative;
    }

    setFlag(value) {
        this.flag = !!value;
    }

    isFlagSet() {
        return this.flag;
    }

    getBlockData(key) {
        switch (key) {
            case 'name' : return this.name;
            default     : return this.metadata[key];
        }
    }

    getLocalInterfaceData(localIfName, key) {
        if (!this.interfaces[localIfName]) {
            throw new Error(`Unknown interface '${localIfName}' for instance block ${this.name}`);
        }

        return this.interfaces[localIfName].getData(key);
    }

    getPeerInterfaceData(localIfName, key) {
        if (!this.interfaces[localIfName]) {
            throw new Error(`Unknown interface '${localIfName}' for instance block ${this.name}`);
        }

        const localInterface = this.interfaces[localIfName];
        const bindings       = localInterface.getBindings();

        if (bindings.length == 0) {
            throw new Error(`Attempting to access peer interface key '${key}' on interface ${this.name}/${localIfName} which has no bound peer`);
        }

        if (bindings.length > 1) {
            throw new Error(`Attempting to access peer interface key '${key}' on interface ${this.name}/${localIfName} which has more than one bound peer - not permitted`);
        }

        const peerInterface = localInterface.isNorth() ? bindings[0].getSouthInterface() : bindings[0].getNorthInterface();
        return peerInterface.getData(key);
    }

    getPeerBlockData(localIfName, key) {
        if (!this.interfaces[localIfName]) {
            throw new Error(`Unknown interface '${localIfName}' for instance block ${this.name}`);
        }

        const localInterface = this.interfaces[localIfName];
        const bindings       = localInterface.getBindings();

        if (bindings.length == 0) {
            throw new Error(`Attempting to access peer block key '${key}' on interface ${this.name}/${localIfName} which has no bound peer`);
        }

        if (bindings.length > 1) {
            throw new Error(`Attempting to access peer block key '${key}' on interface ${this.name}/${localIfName} which has more than one bound peer - not permitted`);
        }

        const peerInterface = localInterface.isNorth() ? bindings[0].getSouthInterface() : bindings[0].getNorthInterface();
        const peerBlock     = peerInterface.getOwner();
        return peerBlock.getBlockData(key);
    }

    object() {
        return this.libraryBlock.object();
    }

    getInterfaces() {
        return this.interfaces;
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

    siteClassMatches(siteClasses) {
        if (!siteClasses) {
            return false;
        }
        if (this.derivative.siteClasses) {
            for (const left of this.derivative.siteClasses) {
                for (const right of siteClasses) {
                    if (left == right) {
                        return true;
                    }
                }
            }
        }
        return false;
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
                inherit    : yaml.load(dbRecord.inherit),
                config     : yaml.load(dbRecord.config),
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

    overWriteSpec(updated) {
        this.item.spec = updated;
    }

    expandFrom() {
        return this.item.spec.inherit ? this.item.spec.inherit.base : undefined;
    }

    config() {
        return this.item.spec.config;
    }

    interfaces() {
        return this.item.spec.interfaces;
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
    constructor() {
        this.rootBlockName       = undefined;
        this.appName             = undefined;
        this.libraryBlocks       = {};
        this.instanceBlocks      = {}; // Blocks referenced in the application tree by their deployed names
        this.bindings            = []; // List of north/south interface bindings
        this.unmatchedInterfaces = []; // List of (block-name; interface-name) for unconnected interfaces
        this.derivative          = {};

    }

    buildFromApi(rootBlockName, appName, libraryBlocks, buildLog) {
        this.rootBlockName = rootBlockName;
        this.appName       = appName;
        this.libraryBlocks = libraryBlocks;

        //
        // Create Bindings for each pairing of BlockInterfaces
        //
        this.pairInterfaces(buildLog);

        buildLog.log(`${this}`);
    }

    async buildFromDatabase(client, appid) {
        let   buildLog  = new ProcessLog(false);   // Disabled build log
        const appResult = await client.query("SELECT Applications.name as apname, LibraryBlocks.name as lbname, LibraryBlocks.revision FROM Applications " +
                                             "JOIN LibraryBlocks ON LibraryBlocks.Id = RootBlock " +
                                             "WHERE Applications.Id = $1", [appid]);
        if (appResult.rowCount == 0) {
            throw new Error(`Cannot find application with id ${appid}`);
        }

        //
        // Populate the needed attributes of this Application record.
        //
        const row          = appResult.rows[0];
        this.appName       = row.apname;
        this.rootBlockName = `${row.lbname};${row.revision}`;
        this.libraryBlocks = await loadLibrary(client, this.rootBlockName, buildLog);

        //
        // Build an index of library blocks by database-id.
        //
        let libraryBlocksById = {};
        for (const [name, lb] of Object.entries(this.libraryBlocks)) {
            libraryBlocksById[lb.databaseId()] = name;
        }

        //
        // Populate the instance blocks from the database.  Set up the interfaces from the referenced library blocks.
        //
        const iblockResult = await client.query("SELECT * FROM InstanceBlocks WHERE Application = $1", [appid]);
        for (const iblock of iblockResult.rows) {
            let instanceBlock = new InstanceBlock({});
            instanceBlock.buildFromDatabase(iblock, this.libraryBlocks[libraryBlocksById[iblock.libraryblock]], buildLog);
            this.instanceBlocks[instanceBlock.getName()] = instanceBlock;
        }

        //
        // Populate the interface bindings from the database.
        //
        const bindingResult = await client.query("SELECT * FROM Bindings WHERE Application = $1", [appid]);
        for (const b of bindingResult.rows) {
            const northBlock = this.instanceBlocks[b.northblock];
            const southBlock = this.instanceBlocks[b.southblock];
            const northInterface = northBlock.findInterface(b.northinterface);
            const southInterface = southBlock.findInterface(b.southinterface);
            const binding = new InterfaceBinding(northInterface, southInterface, buildLog);
            this.bindings.push(binding);
        }
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
        this.instanceBlocks[path] = new InstanceBlock({});
        this.instanceBlocks[path].buildFromApi(rootBlock, path, buildLog);
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
                const subConfig = child.config || {};
                const subPath = path + child.name;
                let instanceBlock = new InstanceBlock(subConfig);
                this.instanceBlocks[subPath] = instanceBlock;
                instanceBlock.buildFromApi(libraryChild, subPath, buildLog);

                if (child.siteClasses && typeof(child.siteClasses) == "object") {
                    let siteClasses = [];
                    for (const sclass of child.siteClasses) {
                        siteClasses.push(sclass);
                    }
                    instanceBlock.addDerivative('siteClasses', siteClasses);
                }

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
                return `Invalid role '${iface.role}' in block ${name}, interface ${iface.name}`;
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

    return undefined;
}

const importBlock = async function(client, block, blockRevisions) {
    const name        = block.metadata.name;
    const newRevision = blockRevisions[name] ? blockRevisions[name].revision + 1 : 1;
    const inherit     = yaml.dump(block.spec.inherit);
    const config      = yaml.dump(block.spec.config);
    const ifObject    = yaml.dump(block.spec.interfaces);
    const bodyObject  = yaml.dump(block.spec.body);

    //
    // If there's an existing revision of this block, check to see if it is the same as the new one.
    // Only insert a new revision into the database if it is different from the current revision.
    //
    if (newRevision > 1) {
        const mostRecent = await client.query("SELECT Inherit, Config, Interfaces, SpecBody FROM LibraryBlocks WHERE Name = $1 AND Revision = $2", [name, newRevision - 1]);
        if (mostRecent.rowCount == 1
            && inherit    == mostRecent.rows[0].inherit
            && config     == mostRecent.rows[0].config
            && ifObject   == mostRecent.rows[0].interfaces
            && bodyObject == mostRecent.rows[0].specbody) {
            return 0;
        }
    }

    const isComposite = !!block.spec.body && !!block.spec.body.composite;

    await client.query("INSERT INTO LibraryBlocks (Type, Name, Revision, IsComposite, Format, Inherit, Config, Interfaces, SpecBody) VALUES ($1, $2, $3, $4, 'application/yaml', $5, $6, $7, $8)",
                       [block.type, name, newRevision, isComposite, inherit, config, ifObject, bodyObject]);
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
    if (body && typeof(body.composite) == "object") {
        for (const subblock of body.composite.blocks) {
            await loadLibraryBlock(client, library, subblock.block, buildLog)
        }
    }

    const inherit = yaml.load(revisionBlock.inherit);
    if (inherit && inherit.base) {
        await loadLibraryBlock(client, library, inherit.base, buildLog);
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
            buildLog.error(`Circular dependencies detected in inheritance hierarchy for block ${blockName}`);
        }
        block.setFlag(true);

        //
        // If the base block is unexpanded, recursively expand it before using it as a base.
        //
        const baseBlock = library[baseBlockName];
        if (!!baseBlock.expandFrom()) {
            expandBlock(library, baseBlock.name(), buildLog);
        }

        // TODO - Inherit the entire spec, but expand only the config

        //
        // Do the expansion from the base.
        //
        let   expanded   = block.object();
        const transform  = deepCopy(expanded.spec.inherit);
        const parentspec = baseBlock.object().spec;

        expanded.spec = deepCopy(parentspec);
        if (expanded.spec.config) {
            if (transform.transformOverwrite) {
                expanded.spec.config = deepAppend(expanded.spec.config, transform.transformOverwrite);
            }
            if (transform.transformDelete) {
                // TODO - array of paths to be removed from the base
                buildLog.error(`transformDelete not implemented in ${block}`);
            }
            if (transform.transformListItem) {
                // TODO - array of path/index/transform[Overwrite|Delete|ListItem]
                buildLog.error(`ERROR: transformListItem not implemented in ${block}`);
            }
        }
        block.overWriteSpec(expanded.spec);
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
    for (const block of Object.values(instanceBlocks)) {
        const libraryBlock  = block.getLibraryBlock();
        const libraryRecord = libraryBlock.object();

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
// Input variables are of one of the following forms:
//
//   <variable>
//   localif.<local-if-name>:<variable>
//   peerif.<local-if-name>:<variable>
//   peerif:<variable>
//   peerblock.<local-if-name>:<variable>
//   peerblock:<variable>
//   site:<variable>
//
const evaluateVariable = function(key, block, affinityInterface, site) {
    const colon = key.indexOf(':');

    if (colon < 0) {
        return block.getBlockData(key);
    }

    const section = key.split(':');
    if (section.length != 2) {
        throw new Error(`Malformed variable '${key}' (block ${block.name()})`);
    }

    const scope = section[0].split('.');
    switch (scope[0]) {
        case 'localif':
            if (scope.length != 2) {
                throw new Error(`Malformed variable '${key}' - 'localif' requires a local interface name qualifier`);
            }
            return block.getLocalInterfaceData(scope[1], section[1]);

        case 'peerif':
            if (scope.length == 1) {
                if (!affinityInterface) {
                    throw new Error(`Malformed variables '${key}' - 'peerif' has no qualifiers but there is no interface with affinity`);
                }
                return block.getPeerInterfaceData(affinityInterface, section[1]);
            } else if (scope.length == 2) {
                return block.getPeerInterfaceData(scope[1], section[1]);
            } else {
                throw new Error(`Malformed variable '${key}' - 'peerif' may have zero or one qualifiers, not more`);
            }

        case 'peerblock':
            if (scope.length == 1) {
                if (!affinityInterface) {
                    throw new Error(`Malformed variables '${key}' - 'peerblock' has no qualifiers but there is no interface with affinity`);
                }
                return block.getPeerBlockData(affinityInterface, section[1]);
            } else if (scope.length == 2) {
                return block.getPeerBlockData(scope[1], section[1]);
            } else {
                throw new Error(`Malformed variable '${key}' - 'peerblock' may have zero or one qualifiers, not more`);
            }

        case 'site':
            if (scope.length == 2) {
                throw new Error(`Malformed variable '${key}' - 'site' does not permit qualifiers`);
            }
            return site && site[section[1]];
    }

    throw new Error(`Malformed variable '${key}' - Unrecognized qualifier`);
}

//
// Identify all variables in the string and expand each of them
//
const substituteString = function(text, block, affinityInterface, site, deployLog) {
    const varStart = text.indexOf('${');
    if (varStart < 0) {
        //
        // No variables in this text
        //
        return text;
    }

    const before = text.slice(0, varStart);
    const after  = text.slice(varStart + 2);
    const varEnd = after.indexOf('}');
    if (varEnd < 0) {
        //
        // No well-formed variable expression, don't substitute
        //
        return text;
    }

    const variable = after.slice(0, varEnd);
    const theRest  = after.slice(varEnd + 1)
    var   evalData = evaluateVariable(variable, block, affinityInterface, site);
    if (!evalData) {
        evalData = "UNDEFINED";
        deployLog.warning(`Unresolvable variable '${variable}' in block ${block.getName()}`);
    }

    var result;
    if (before.length == 0 && theRest.length == 0) {
        result = evalData;
    } else {
        result = before + evalData + substituteString(theRest, block, affinityInterface, site, deployLog);
    }

    return result;
}

//
// Substitute variables in the contents of an object.  Note that variables can be in map keys as
// well as map values.
//
const substituteObject = function(obj, block, affinityInterface, site, deployLog) {
    var result;
    if (Array.isArray(obj)) {
        result = [];
        for (const subobj of obj) {
            result.push(substituteObject(subobj, block, affinityInterface, site, deployLog));
        }
    } else if (typeof(obj) == 'object') {
        result = {};
        for (const [key, value] of Object.entries(obj)) {
            const subkey = substituteString(key, block, affinityInterface, site, deployLog);
            result[subkey] = substituteObject(value, block, affinityInterface, site, deployLog);
        }
    } else if (typeof(obj) == 'string') {
        result = substituteString(obj, block, affinityInterface, site, deployLog);
    } else {
        result = obj;
    }
    return result;
}

//
// For every instance block in the application, check for the allocateToSite flag.  If true,
// generate the configuration to allocate the block to this site.
//
// For every block that is allocated to this site, run through the interfaces and find the bound
// blocks for each interface.  Use the content of the bound blocks to generate interconnect configuration.
//
const addMemberSite = async function(client, app, site, depid, deployLog) {
    const siteClasses  = site.siteclasses;
    const siteMetadata = JSON.parse(site.metadata);
    const instanceBlocks = app.getInstanceBlocks();

    deployLog.log(`Adding member site: ${site.name}`)

    //
    // Start accumulating site configuration.
    //
    let siteConfiguration = [];

    for (const [path, instanceBlock] of Object.entries(instanceBlocks)) {
        const derivative = instanceBlock.getDerivative();

        //
        // Check to see if this is an allocate-to-site block
        //
        if (derivative.allocateToSite) {
            //
            // Now check to see if the block should be allocated to _this_ site.
            //
            if (instanceBlock.siteClassMatches(siteClasses)) {
                deployLog.log(`    Allocating block ${instanceBlock.getName()}`);
                instanceBlock.setFlag(true);

                //
                // Configure the allocation of the block to this site
                //
                const libraryBlock = instanceBlock.getLibraryBlock();
                const body         = substituteObject(libraryBlock.body(), instanceBlock, undefined, siteMetadata, deployLog);
                if (body.kubeTemplates) {
                    for (const element of body.kubeTemplates) {
                        for (const template of element.template) {
                            siteConfiguration.push(template);
                        }
                    }
                }

                //
                // For each interface of this block, follow the binding to the bound peer block.
                // The peer block may contain configuration that is needed for this site.
                //
                const interfaces = instanceBlock.getInterfaces();
                for (const iface of Object.values(interfaces)) {
                    //
                    // Process each peer block bound through this interface.
                    //
                    const bindings = iface.getBindings();
                    for (const binding of bindings) {
                        const peerInterface = iface.isNorth() ? binding.getSouthInterface() : binding.getNorthInterface();
                        const peer          = peerInterface.getOwner();
                        const peerBody      = deepCopy(peer.getLibraryBlock().body());

                        //
                        // Generate configuration data based on the content of the peer.
                        //
                        if (peerBody.kubeTemplates) {
                            for (const kt of peerBody.kubeTemplates) {
                                if (!kt.affinity || kt.affinity == peerInterface.getName()) {
                                    for (var templateItem of kt.template) {
                                        siteConfiguration.push(substituteObject(templateItem, peer, kt.affinity, siteMetadata, deployLog));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (siteConfiguration.length > 0) {
        let configtext = "";
        for (const item of siteConfiguration) {
            configtext += "---\n" + yaml.dump(item);
        }
        await client.query("INSERT INTO SiteData (DeployedApplication, MemberSite, Format, Configuration) " +
                           "VALUES ($1, $2, 'application/yaml', $3)", [depid, site.id, configtext]);
    }
}

const deleteMemberSite = async function(client, app, site, depid) {
}

const preLoadApplication = async function(client, appid) {
    if (cachedApplications[appid]) {
        return cachedApplications[appid];
    }

    let application = new Application();
    await application.buildFromDatabase(client, appid);
    cachedApplications[appid] = application;
    return application;
}

const deployApplication = async function(client, appid, vanid, depid, deployLog) {
    const app = await preLoadApplication(client, appid);

    //
    // Mark all of the instance blocks so we can check for unallocated blocks later.
    //
    const instanceBlocks = app.getInstanceBlocks();
    for (const iblock of Object.values(instanceBlocks)) {
        iblock.setFlag(false);
    }

    //
    // Find all of the member sites for the VAN and add them to the deployment.
    //
    const result = await client.query("SELECT Id, Name, Metadata, SiteClasses FROM MemberSites WHERE MemberOf = $1", [vanid]);
    for (const site of result.rows) {
        await addMemberSite(client, app, site, depid, deployLog);
    }

    //
    // Find and flag any unallocated components from the application.
    //
    for (const [name, iblock] of Object.entries(instanceBlocks)) {
        const derivative = iblock.getDerivative();
        if (derivative.allocateToSite && !iblock.isFlagSet()) {
            deployLog.warning(`Unallocated block: ${name}`);
        }
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

const createLibraryBlock = async function(req, res) {
    var returnStatus = 201;
    const client = await db.ClientFromPool();
    const form = new formidable.IncomingForm();
    try {
        await client.query("BEGIN");
        const [fields, files] = await form.parse(req);
        const norm = util.ValidateAndNormalizeFields(fields, {
            'name'      : {type: 'dnsname', optional: false},
            'type'      : {type: 'string',  optional: false},
            'provider'  : {type: 'dnsname', optional: true, default: ''},
            'composite' : {type: 'bool',    optional: true, default: 'false'},
        });

        const result = await client.query("INSERT INTO LibraryBlocks (Type, Name, Provider, IsComposite) VALUES ($1, $2, $3, $4) RETURNING Id",
                                          [norm.type, norm.name, norm.provider, norm.composite]);
        await client.query("COMMIT");
        if (result.rowCount == 1) {
            res.status(returnStatus).json(result.rows[0]);
        } else {
            returnStatus = 400;
            res.status(returnStatus).send(result.error);
        }
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).send(error.message);
        await client.query("ROLLBACK");
    } finally {
        client.release();
    }

    return returnStatus;
}

const listLibraryBlocks = async function(req, res) {
    var   returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT Id, Type, Name, Provider, IsComposite, Revision, Created FROM LibraryBlocks");
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

const getBlockTypes = async function(req, res) {
    var   returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT * FROM BlockTypes");
        let btmap = {};
        for (const row of result.rows) {
            btmap[row.name] = {
                allownorth     : row.allownorth,
                allowsouth     : row.allowsouth,
                allocatetosite : row.allocatetosite,
            };
        }
        res.status(returnStatus).json(btmap);
        await client.query("COMMIT");
    } catch (error) {
        Log(`Exception in getBlockTypes: ${error.message}`);
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
        const result = await client.query("SELECT Id, Type, Name, Provider, IsComposite, Revision, Created FROM LibraryBlocks WHERE Id = $1", [blockid]);
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

const getLibraryBlockSection = async function(blockid, section, req, res) {
    var   returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query(`SELECT ${section} as data FROM LibraryBlocks WHERE Id = $1`, [blockid]);
        if (result.rowCount == 1) {
            const jdata = yaml.load(result.rows[0].data);
            res.status(returnStatus).json(jdata);
        } else {
            returnStatus = 404;
            res.status(returnStatus).send('Not Found');
        }
        await client.query("COMMIT");
    } catch (error) {
        Log(`Exception in getLibraryBlockSection(${section}): ${error.message}`);
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
            'name'      : {type: 'dnsname', optional: false},
            'rootblock' : {type: 'uuid',    optional: false},
        });

        const result = await client.query("INSERT INTO Applications (Name, RootBlock) VALUES ($1, $2) RETURNING Id",
                                          [norm.name, norm.rootblock]);
        await client.query("COMMIT");
        if (result.rowCount == 1) {
            res.status(returnStatus).json(result.rows[0]);
        } else {
            returnStatus = 400;
            res.status(returnStatus).send(result.error);
        }
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
    let   buildLog = new ProcessLog(true, 'build');
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
                throw new Error('Cannot build an application that is deployed');
            }

            //
            // Get an in-memory cache of the library blocks referenced from the root block.
            //
            const rootBlockName = `${app.lbname};${app.revision}`;
            const library = await loadLibrary(client, rootBlockName, buildLog);

            //
            // Construct the application, resolving all of the inter-block bindings.
            //
            const application = new Application();
            application.buildFromApi(rootBlockName, app.appname, library, buildLog);
            cachedApplications[apid] = application;

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
                const result = await client.query("INSERT INTO InstanceBlocks (Application, LibraryBlock, InstanceName, Config, Metadata, Derivative) VALUES ($1, $2, $3, $4, $5, $6) RETURNING Id",
                                                  [apid, block.libraryBlockDatabaseId(), name, JSON.stringify(block.getConfig()), JSON.stringify(block.getMetadata()), JSON.stringify(block.getDerivative())]);
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
                                   [apid, northBlock.getName(), northInterface.getName(), southBlock.getName(), southInterface.getName()]);
            }

            //
            // Add final success log
            //
            var response;
            if (buildLog.getResult() == 'build-warnings') {
                buildLog.log("WARNING: Build completed with warnings");
                response = 'Warnings - See build log for details';
            } else {
                buildLog.log("SUCCESS: Build completed successfully");
                response = 'Success - See build log for details';
            }

            //
            // Update the lifecycle of the application and add the build log.
            //
            await client.query("UPDATE Applications SET Lifecycle = $3, BuildLog = $2 WHERE Id = $1", [apid, buildLog.getText(), buildLog.getResult()]);
        }
        await client.query("COMMIT");
        res.status(returnStatus).send(response);
    } catch (error) {
        await client.query("ROLLBACK");
        if (error.message == PROCESS_ERROR) {
            //
            // If we got a build error, update the build log for user visibility after rolling back the current transaction.
            //
            await client.query("BEGIN");
            await client.query("UPDATE Applications SET Lifecycle = $3, BuildLog = $2 WHERE Id = $1", [apid, buildLog.getText(), buildLog.getResult()]);
            await client.query("COMMIT");
            returnStatus = 200;
            res.status(returnStatus).send("Build Failed - See build log for details");
        } else {
            returnStatus = 400;
            res.status(returnStatus).send(error.message);
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
        const result = await client.query(
            "SELECT Applications.Id, Applications.Name, RootBlock, Lifecycle, LibraryBlocks.Name as rootname FROM Applications " +
            "JOIN LibraryBlocks ON LibraryBlocks.Id = RootBlock"
        );
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
        const result = await client.query(
            "SELECT Applications.*, LibraryBlocks.Name as rootname FROM Applications " +
            "JOIN LibraryBlocks ON LibraryBlocks.Id = RootBlock " +
            "WHERE Applications.Id = $1", [apid]
        );
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
        const check = await client.query("SELECT Lifecycle FROM Applications WHERE Id = $1", [apid]);
        if (check.rowCount == 1 && check.rows[0].lifecycle == 'deployed') {
            returnStatus = 400;
            await client.query("COMMIT");
            res.status(returnStatus).send('Cannot delete an Application that is deployed');
        } else {
            await client.query("DELETE FROM Bindings WHERE Application = $1", [apid]);
            await client.query("DELETE FROM InstanceBlocks WHERE Application = $1", [apid]);
            const result = await client.query("DELETE FROM Applications WHERE Id = $1", [apid]);
            await client.query("COMMIT");
            if (result.rowCount != 1) {
                returnStatus = 404;
                res.status(returnStatus).send('Not Found');
            } else {
                delete cachedApplications[apid];
                res.status(returnStatus).send('Deleted');
            }
        }
    } catch (error) {
        Log(`Exception in deleteApplication: ${error.stack}`);
        await client.query("ROLLBACK");
        returnStatus = 500;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const listApplicationBlocks = async function(apid, req, res) {
    var   returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query(
            "SELECT InstanceBlocks.Id, InstanceName, LibraryBlock, " +
            "LibraryBlocks.Name as libname, LibraryBlocks.Revision FROM InstanceBlocks " +
            "JOIN LibraryBlocks ON LibraryBlocks.Id = LibraryBlock " +
            "WHERE Application = $1",
            [apid]
        );
        res.status(returnStatus).json(result.rows);
        await client.query("COMMIT");
    } catch (error) {
        Log(`Exception in listApplicationBlocks: ${error.message}`);
        await client.query("ROLLBACK");
        returnStatus = 500;
        res.status(returnStatus).send(error.message);
    } finally {
        client.release();
    }
    return returnStatus;
}

const getApplicationBlock = async function(blockid, req, res) {
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

        const checkResult = await client.query("SELECT Lifecycle FROM Applications WHERE Id = $1", [norm.app]);
        if (checkResult.rowCount == 0) {
            throw new Error(`Application not found; ${norm.app}`);
        } else if (checkResult.rows[0].lifecycle == 'deployed') {
            throw new Error(`Attempting to deploy an application that is already deployed: ${norm.app}`);
        }
        const result = await client.query("INSERT INTO DeployedApplications (Application, Van) VALUES ($1, $2) RETURNING Id",
                                          [norm.app, norm.van]);
        await client.query("COMMIT");
        if (result.rowCount == 1) {
            await client.query("UPDATE Applications SET Lifecycle = 'deployed' WHERE Id = $1", [norm.app]);
            res.status(returnStatus).json(result.rows[0]);
        } else {
            returnStatus = 400;
            res.status(returnStatus).send(result.error);
        }
    } catch (error) {
        await client.query("ROLLBACK");
        returnStatus = 400;
        res.status(returnStatus).send(error.stack);
    } finally {
        client.release();
    }

    return returnStatus;
}

const deployDeployment = async function(depid, req, res) {
    var   returnStatus = 200;
    const client = await db.ClientFromPool();
    let   deployLog = new ProcessLog(true, 'deploy');
    try {
        await client.query("BEGIN");
        const checkResult = await client.query("SELECT Id, Lifecycle, Application, Van FROM DeployedApplications WHERE Id = $1", [depid]);
        if (checkResult.rowCount == 0) {
            throw new Error(`Deployment not found; ${depid}`);
        } else if (checkResult.rows[0].lifecycle == 'deployed') {
            throw new Error(`Deployment is already deployed: ${depid}`);
        }

        const deployment = checkResult.rows[0];
        await deployApplication(client, deployment.application, deployment.van, deployment.id, deployLog);

        //
        // Add final success log
        //
        var response;
        if (deployLog.getResult() == 'deploy-warnings') {
            deployLog.log("WARNING: Initial deployment completed with warnings");
            response = 'Warnings - See deploy log for details';
        } else {
            deployLog.log("SUCCESS: Initial deployment completed successfully");
            response = 'Success - See deploy log for details';
        }

        //
        // Update the lifecycle of the deployment and add the build log.
        //
        await client.query("UPDATE DeployedApplications SET Lifecycle = $3, DeployLog = $2 WHERE Id = $1", [depid, deployLog.getText(), 'deployed']);
        await client.query("COMMIT");
        res.status(returnStatus).send(response);
    } catch (error) {
        await client.query("ROLLBACK");
        if (error.message == PROCESS_ERROR) {
            //
            // If we got a process error, update the deploy log for user visibility after rolling back the current transaction.
            //
            await client.query("BEGIN");
            await client.query("UPDATE DeployedApplications SET Lifecycle = $3, DeployLog = $2 WHERE Id = $1", [depid, deployLog.getText(), deployLog.getResult()]);
            await client.query("COMMIT");
            returnStatus = 200;
            res.status(returnStatus).send("Deploy Failed - See deployment log for details");
        } else {
            returnStatus = 400;
            res.status(returnStatus).send(error.message);
        }
    } finally {
        client.release();
    }

    return returnStatus;
}

const getDeploymentLog = async function(depid, req, res) {
    var   returnStatus = 200;
    const client = await db.ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT DeployLog FROM DeployedApplications WHERE Id = $1", [depid]);
        if (result.rowCount == 1) {
            const reply = result.rows[0].deploylog || 'Deployment has not yet been deployed';
            res.status(returnStatus).send(reply);
        } else {
            returnStatus = 404;
            res.status(returnStatus).send('Not Found');
        }
        await client.query("COMMIT");
    } catch (error) {
        Log(`Exception in getDeploymentLog: ${error.message}`);
        await client.query("ROLLBACK");
        returnStatus = 500;
        res.status(returnStatus).send(error.message);
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
        const result = await client.query(
            "SELECT DeployedApplications.Id, DeployedApplications.Lifecycle, Application, Van, Applications.Name as appname, ApplicationNetworks.Name as vanname FROM DeployedApplications " +
            "JOIN Applications ON Applications.Id = Application " +
            "JOIN ApplicationNetworks ON ApplicationNetworks.Id = Van"
        );
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
        const result = await client.query(
            "SELECT DeployedApplications.*, Applications.Name as appname, ApplicationNetworks.Name as vanname FROM DeployedApplications " +
            "JOIN Applications ON Applications.Id = Application " +
            "JOIN ApplicationNetworks ON ApplicationNetworks.Id = Van " +
            "WHERE DeployedApplications.Id = $1",
            [depid]
        );
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
        let message = 'Not Found';
        if (result.rowCount != 1) {
            returnStatus = 404;
        } else {
            const appid = result.rows[0].application;
            const listResult = await client.query("SELECT Id FROM DeployedApplications WHERE Application = $1", [appid]);
            if (listResult.rowCount == 0) {
                //
                // If we just deleted the last deployment of the application, move its lifecycle back to 'build-complete'.
                //
                await client.query("UPDATE Applications SET LifeCycle = 'build-complete' WHERE Id = $1", [appid]);
                message = 'Deleted';
            }
        }
        await client.query("COMMIT");
        res.status(returnStatus).send(message);
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
            res.setHeader('content-type', 'application/yaml');
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
    app.use(express.static('../compose-web-app'));

    app.post(COMPOSE_PREFIX + 'library/blocks/import', async (req, res) => {
        await postLibraryBlocks(req, res);
    });

    app.post(COMPOSE_PREFIX + 'library/blocks', async (req, res) => {
        await createLibraryBlock(req, res);
    });

    app.get(COMPOSE_PREFIX + 'library/blocks', async (req, res) => {
        await listLibraryBlocks(req, res);
    });

    app.get(COMPOSE_PREFIX + 'library/blocktypes', async (req, res) => {
        await getBlockTypes(req, res);
    })

    app.get(COMPOSE_PREFIX + 'library/blocks/:blockid', async (req, res) => {
        await getLibraryBlock(req.params.blockid, req, res);
    });

    app.get(COMPOSE_PREFIX + 'library/blocks/:blockid/config', async (req, res) => {
        await getLibraryBlockSection(req.params.blockid, 'Config', req, res);
    });

    app.get(COMPOSE_PREFIX + 'library/blocks/:blockid/interfaces', async (req, res) => {
        await getLibraryBlockSection(req.params.blockid, 'Interfaces', req, res);
    });

    app.get(COMPOSE_PREFIX + 'library/blocks/:blockid/body', async (req, res) => {
        await getLibraryBlockSection(req.params.blockid, 'SpecBody', req, res);
    });

    app.delete(COMPOSE_PREFIX + 'library/blocks/:blockid', async (req, res) => {
        await deleteLibraryBlock(req.params.blockid, req, res);
    });

    app.post(COMPOSE_PREFIX + 'applications', async (req, res) => {
        await postApplication(req, res);
    });

    app.get(COMPOSE_PREFIX + 'applications', async (req, res) => {
        await listApplications(req, res);
    });

    app.get(COMPOSE_PREFIX + 'applications/:apid', async (req, res) => {
        await getApplication(req.params.apid, req, res);
    });

    app.put(COMPOSE_PREFIX + 'applications/:apid/build', async (req, res) => {
        await buildApplication(req.params.apid, req, res);
    });

    app.get(COMPOSE_PREFIX + 'applications/:apid/log', async (req, res) => {
        await getApplicationBuildLog(req.params.apid, req, res);
    });

    app.delete(COMPOSE_PREFIX + 'applications/:apid', async (req, res) => {
        await deleteApplication(req.params.apid, req, res);
    });

    app.get(COMPOSE_PREFIX + 'applications/:apid/blocks', async (req, res) => {
        await listApplicationBlocks(req.params.apid, req, res);
    });

    app.get(COMPOSE_PREFIX + 'applications/:apid/blocks/:blockid', async (req, res) => {
        await getApplicationBlock(req.params.blockid, req, res);
    });

    app.post(COMPOSE_PREFIX + 'deployments', async (req, res) => {
        await postDeployment(req, res);
    });

    app.put(COMPOSE_PREFIX + 'deployments/:depid/deploy', async (req, res) => {
        await deployDeployment(req.params.depid, req, res)
    });

    app.get(COMPOSE_PREFIX + 'deployments/:depid/log', async (req, res) => {
        await getDeploymentLog(req.params.depid, req, res);
    });

    app.get(COMPOSE_PREFIX + 'deployments', async (req, res) => {
        await listDeployments(req, res);
    });

    app.get(COMPOSE_PREFIX + 'deployments/:depid', async (req, res) => {
        await getDeployment(req.params.depid, req, res);
    });

    app.delete(COMPOSE_PREFIX + 'deployments/:depid', async (req, res) => {
        await deleteDeployment(req.params.depid, req, res);
    });

    app.get(COMPOSE_PREFIX + 'deployments/:depid/site/:siteid/sitedata', async (req, res) => {
        await getSiteData(req.params.depid, req.params.siteid, req, res);
    });

    //
    // Provide a path option that includes a filename.  This can be used in a download link to influence
    // the name of the file that is saved (rather than always downloading to 'sitedata').
    // We ignore the filename.  We are simply allowing it to be included on the API path.
    //
    app.get(COMPOSE_PREFIX + 'deployments/:depid/site/:siteid/sitedata/:filename', async (req, res) => {
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

