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

import { WebSocketServer } from "ws";
import rhea from "rhea";
import { Log } from "@vms/modules/log";

let router;
let wss;
let container;
let openWatches = [];
const watchIndex = {}; // { table: {<all,id*>: [watches]}}

class Mutex {
    constructor() {
        this._lock = Promise.resolve();
    }

    async acquire() {
        let release;
        const nextLock = new Promise((resolve) => {
            release = resolve;
        });
        const currentLock = this._lock;
        this._lock = nextLock;
        await currentLock;
        return release;
    }
}

class RouterResponse {
    constructor(watch, isInitial, release) {
        this.isInitial = isInitial;
        this.watch = watch;
        this.release = release;
        this._watch = null; // Set by the route handlers
        this.statusCode = null;
        this.message = {
            application_properties: {},
            body: { method: isInitial ? "GET" : "UPDATE" },
        };
    }

    send(data) {
        this.message.body.content = data;
        this.watch.send(this.message);
        if (this.isInitial && this._watch) {
            for (const watchMap of this._watch) {
                if (!watchIndex[watchMap.table]) {
                    watchIndex[watchMap.table] = { all: [] };
                }
                if (!watchMap.id) {
                    watchIndex[watchMap.table].all.push(this.watch);
                } else {
                    if (!watchIndex[watchMap.table][watchMap.id]) {
                        watchIndex[watchMap.table][watchMap.id] = [];
                    }
                    watchIndex[watchMap.table][watchMap.id].push(this.watch);
                }
            }
        }
        this.release();
    }

    json(data) {
        this.send(data);
    }

    redirect(_data) {
        if (this.isInitial) {
            this.message.body.statusCode = 401;
            this.message.body.content = "Would Redirect";
            this.watch.send(this.message);
        }
        this.release();
    }

    setHeader(name, value) {
        this.message.application_properties[name] = value;
    }

    auth_callback(data) {
        console.log("auth_callback", data);
    }

    status(code) {
        this.message.body.statusCode = code;
        this.statusCode = code;
        return this;
    }

    end() {}
}

function pruneIndex() {
    for (const [table, tableMap] of Object.entries(watchIndex)) {
        for (const [key, watchList] of Object.entries(tableMap)) {
            const newList = [];
            for (const watch of watchList) {
                if (openWatches.includes(watch)) {
                    newList.push(watch);
                }
            }
            watchIndex[table][key] = newList;
        }
    }
}

//
// The Mutex is needed to ensure that each GET operation is started and completed entirely
// before the next one starts.  This is required because they share the "req" object from the
// upgraded HTTP connection, which contains the session state needed by the router to authenticate
// each operation.
//
const mutex = new Mutex();

let watchDispatch = sendUpdate;

function parseWatchQuery(url) {
    const qIndex = url.indexOf("?");
    if (qIndex < 0) {
        return {};
    }
    return Object.fromEntries(new URLSearchParams(url.slice(qIndex + 1)));
}

async function sendUpdate(watch, isInitial) {
    const release = await mutex.acquire();
    const url = watch.source.address;

    try {
        const res = new RouterResponse(watch, isInitial, release);
        const req = watch.connection.options.httpreq;

        req.url = url;
        req.method = "GET";
        // router.handle() does not run Express query middleware.
        req.query = parseWatchQuery(url);
        req._skip_log = !isInitial;

        router.handle(req, res, (err) => {
            if (err) {
                console.error("Router error:", err);
            } else {
                release();
            }
        });
    } catch {
        release();
    }
}

export async function StartWatchServer(server, sessionParser, _app, _router) {
    Log("[Watch Server Starting]");
    router = _router;
    container = rhea.create_container({ container_id: "WATCH_SERVER" });

    wss = new WebSocketServer({ noServer: true });

    //
    // Explicitly run the session middleware to ensure the session is present in the websocket connection.
    //
    server.on("upgrade", (req, socket, head) => {
        if (req.url === "/api/v1alpha1/watch") {
            sessionParser(req, {}, () => {
                wss.handleUpgrade(req, socket, head, (ws) => {
                    wss.emit("connection", ws, req);
                });
            });
        }
    });

    wss.on("connection", function (ws, req) {
        container.websocket_accept(ws, { httpreq: req });
    });

    container.on("sender_open", async function (context) {
        openWatches.push(context.sender);
    });

    container.on("sendable", async function (context) {
        if (!context.sender._initial_sent) {
            context.sender._initial_sent = true;
            sendUpdate(context.sender, true);
        }
    });

    container.on("sender_close", function (context) {
        const newList = openWatches.filter((watch) => watch !== context.sender);
        openWatches = newList;
        pruneIndex();
    });

    container.on("connection_close", function (context) {
        //
        // Remove all watches that involve this connection.
        //
        const newList = openWatches.filter((watch) => watch.connection !== context.connection);
        openWatches = newList;
        pruneIndex();
    });

    container.on("disconnected", function (context) {
        //
        // Remove all watches that involve this connection.
        //
        const newList = openWatches.filter((watch) => watch.connection !== context.connection);
        openWatches = newList;
        pruneIndex();
    });

    container.on("error", function (context) {
        console.log("RHEA Error", context);
    });
}

export async function WatchNotify(tableName, id, _holdoff) {
    const tableIndex = watchIndex[tableName];
    let watches = [];
    if (tableIndex) {
        if (id) {
            watches = tableIndex[id] || [];
        }

        for (const watch of watches) {
            watchDispatch(watch, false);
        }

        for (const watch of tableIndex.all) {
            watchDispatch(watch, false);
        }
    }
}

/** @internal Exported for unit tests */
export function _parseWatchQueryForTest(url) {
    return parseWatchQuery(url);
}

/** @internal Exported for unit tests */
export function _registerWatchForTest(tableName, id, watch) {
    if (!watchIndex[tableName]) {
        watchIndex[tableName] = { all: [] };
    }
    if (id) {
        if (!watchIndex[tableName][id]) {
            watchIndex[tableName][id] = [];
        }
        watchIndex[tableName][id].push(watch);
    } else {
        watchIndex[tableName].all.push(watch);
    }
}

/** @internal Exported for unit tests */
export function _setWatchDispatchForTest(fn) {
    watchDispatch = fn ?? sendUpdate;
}
