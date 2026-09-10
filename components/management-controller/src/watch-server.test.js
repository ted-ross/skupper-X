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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    WatchNotify,
    _registerWatchForTest,
    _setWatchDispatchForTest,
    _parseWatchQueryForTest,
} from "./watch-server.js";

describe("WatchNotify", () => {
    beforeEach(() => {
        _setWatchDispatchForTest(vi.fn());
    });

    afterEach(() => {
        _setWatchDispatchForTest(undefined);
    });

    it("does nothing when no watches are registered for the table", async () => {
        const dispatch = vi.fn();
        _setWatchDispatchForTest(dispatch);

        await expect(WatchNotify("InteriorSites", "site-1")).resolves.toBeUndefined();

        expect(dispatch).not.toHaveBeenCalled();
    });

    it("dispatches updates to id-specific and table-wide watches", async () => {
        const dispatch = vi.fn();
        _setWatchDispatchForTest(dispatch);

        const idWatch = { id: "watch-by-id" };
        const allWatch = { id: "watch-all" };
        _registerWatchForTest("InteriorSites", "site-1", idWatch);
        _registerWatchForTest("InteriorSites", null, allWatch);

        await WatchNotify("InteriorSites", "site-1");

        expect(dispatch).toHaveBeenCalledTimes(2);
        expect(dispatch).toHaveBeenCalledWith(idWatch, false);
        expect(dispatch).toHaveBeenCalledWith(allWatch, false);
    });
});

describe("_parseWatchQueryForTest", () => {
    it("returns an empty object when the URL has no query string", () => {
        expect(_parseWatchQueryForTest("/api/v1alpha1/certs")).toEqual({});
    });

    it("parses query parameters from the URL", () => {
        expect(_parseWatchQueryForTest("/api/v1alpha1/certs?signedby=ca-1&watch=1")).toEqual({
            signedby: "ca-1",
            watch: "1",
        });
    });
});
