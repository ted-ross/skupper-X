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

const expandInheritance = function(apid, list, item) {
    try {
        let   expanded = item;
        const spec     = item.spec;
        if (spec.base) {
            const parent = list[spec.base];
            if (!parent) {
                throw new Error(`Base reference not found: ${spec.base}`);
            }

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
        return expanded;
    } catch (error) {
        Log(`Exception during expandInheritance for ${item.metadata.name}: ${error.message}`);
        return item;
    }
}

const processItems = async function(apid, items) {
    Log(`Process items for ap-id ${apid} - Item count: ${items.length}`);

    let components = {};
    let connectors = {};
    let mixed      = {};
    let ingresses  = {};
    let egresses   = {};

    //
    // Sort the items into maps (keyed by name) of their respective types.
    //
    for (const item of items) {
        const name = item.metadata.name;
        if (item.apiVersion == API_VERSION) {
            if (item.kind == 'Block') {
                if (item.type == TYPE_COMPONENT) {
                    components[name] = item;
                } else if (item.type == TYPE_CONNECTOR) {
                    connectors[name] = item;
                } else if (item.type == TYPE_MIXED) {
                    mixed[name] = item;
                } else {
                    Log(`Unrecongnized block type: ${item.type}`);
                }
            } else if (item.kind == 'Ingress') {
                ingresses[name] = item;
            } else if (item.kind == 'Egress') {
                egresses[name] = item;
            } else {
                Log(`Unrecognized record kind: ${item.kind}`);
            }
        } else {
            Log('Unrecongnized API version');
        }
    }

    //
    // If any of the objects use inheritance, expand/flatten them so they are each fully specified.
    //
    for (var list of [components, connectors, mixed, ingresses, egresses]) {
        for (const [name, item] of Object.entries(list)) {
            list[name] = expandInheritance(apid, list, item);
        }
    }

    //
    // 
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
            res.status(500).send(error.message);
        }
    } else {
        res.status(400).send('Not YAML');
    }
}