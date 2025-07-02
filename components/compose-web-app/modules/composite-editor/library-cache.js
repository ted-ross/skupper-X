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

const API_PREFIX = '/compose/v1alpha1/library/';

export class LibraryCache {
    constructor() {
        this.blockTypes   = undefined;
        this.blocksByType = undefined;
    }

    async _fetchBlockTypes() {
        if (!this.blockTypes) {
            const result    = await fetch(API_PREFIX + 'blocktypes');
            this.blockTypes = await result.json();
            for (const typeName of Object.keys(this.blockTypes)) {
                this.blocksByType[typeName] = undefined;
            }
        }
    }

    async _fetchBlocks(byType) {
        this._fetchBlockTypes();
        if (!this.blocksByType[byType]) {
            const result = await fetch(API_PREFIX + `blocks?type=${byType}`);
            const blocks = await result.json();
            this.blocksByType[byType] = {};
            for (const block of blocks) {
                this.blocksByType[block.name] = block;
            }
        }
    }
}