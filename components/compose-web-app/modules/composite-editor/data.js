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

import { LibraryCache } from "./library-cache.js";

function toMap(fromList) {
    result = {};
    for (const item of fromList) {
        result[item.name] = item;
    }
    return result;
}

export class CompositeBlock {
    constructor(name, blockName) {
        this.name      = name;
        this.blockName = blockName;
        this.libCache  = new LibraryCache();
    }

    async load() {
        this.block    = new Block(await this.libCache.getBlock(this.blockName));
        this.children = {};
        for (const subBlock of this.block.getBody()) {
            const sub = await this.libCache.getBlock(subBlock.block);
            this.children[subBlock.name] = new Block(subBlock.name, sub);
        }
    }
}

class Block {
    constructor(name, libBlock) {
        this.name       = name;
        this.libBlock   = libBlock;
        this.config     = {};
        this.interfaces = toMap(interfaces);
    }

    getBody() {
        return this.libBlock.body;
    }
}