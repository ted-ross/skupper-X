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

import { BuildApplicationTable } from "./modules/app_old.js";
import { BuildBackboneTable } from "./modules/backbone.js";
import { BuildDeploymentTable } from "./modules/deploy.js";
import { BuildLibraryTable } from "./modules/library.js";
import { BuildVanTable } from "./modules/van.js";

export function Start() {
    SetHeight();
}

export function SetHeight() {
    const newHeight = `${window.innerHeight - 134}px`;
    document.getElementById("wrapperdiv").style.height = newHeight;
    document.getElementById("navdiv").style.height = newHeight;
    document.getElementById("sectiondiv").style.height = newHeight;
}

function unboldTabs() {
    document.getElementById("tab-home").style.fontWeight = 'normal';
    document.getElementById("tab-bone").style.fontWeight = 'normal';
    document.getElementById("tab-van").style.fontWeight  = 'normal';
    document.getElementById("tab-lib").style.fontWeight  = 'normal';
    document.getElementById("tab-app").style.fontWeight  = 'normal';
    document.getElementById("tab-dep").style.fontWeight  = 'normal';
}

export async function toBackboneTab() {
    unboldTabs();
    document.getElementById("tab-bone").style.fontWeight = 'bold';
    document.getElementById("sectiondiv").innerHTML = `<h2>Backbones</h2>`;
    await BuildBackboneTable();
}

export async function toVanTab() {
    unboldTabs();
    document.getElementById("tab-van").style.fontWeight  = 'bold';
    document.getElementById("sectiondiv").innerHTML = `<h2>Virtual Application Networks</h2>`;
    await BuildVanTable();
}

export async function toLibraryTab() {
    unboldTabs();
    document.getElementById("tab-lib").style.fontWeight  = 'bold';
    document.getElementById("sectiondiv").innerHTML = `<h2>Block Library</h2>`;
    await BuildLibraryTable();
}

export async function toApplicationTab(action_result) {
    unboldTabs();
    document.getElementById("tab-app").style.fontWeight  = 'bold';
    document.getElementById("sectiondiv").innerHTML = `<h2>Applications</h2>`;
    await BuildApplicationTable();
}

export async function toDeploymentTab(action_result) {
    unboldTabs();
    document.getElementById("tab-dep").style.fontWeight  = 'bold';
    document.getElementById("sectiondiv").innerHTML = `<h2>Deployments</h2>`;
    await BuildDeploymentTable();
}

