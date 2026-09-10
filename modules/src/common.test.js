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

import { describe, it, expect } from "vitest";
import {
    API_CONTROLLER_ADDRESS,
    CLAIM_ASSERT_ADDRESS,
    META_ANNOTATION_VMS_CONTROLLED,
    META_ANNOTATION_STATE_ID,
    META_ANNOTATION_TLS_ORDINAL,
    META_ANNOTATION_TLS_LAST_VALID,
    STATE_TYPE_LINK,
    MEMBER_CONFIG_MAP_NAME,
} from "./common.js";

describe("common constants", () => {
    it("exports AMQP addresses", () => {
        expect(API_CONTROLLER_ADDRESS).toBe("vms/sync/mgmtcontroller");
        expect(CLAIM_ASSERT_ADDRESS).toBe("vms/claim");
    });

    it("exports kubernetes annotation keys", () => {
        expect(META_ANNOTATION_VMS_CONTROLLED).toBe("skupper.io/vms-controlled");
        expect(META_ANNOTATION_STATE_ID).toBe("vms/state-id");
        expect(META_ANNOTATION_TLS_ORDINAL).toBe("vms/tls-ordinal");
        expect(META_ANNOTATION_TLS_LAST_VALID).toBe("vms/tls-last-valid");
    });

    it("exports state and object names", () => {
        expect(STATE_TYPE_LINK).toBe("link");
        expect(MEMBER_CONFIG_MAP_NAME).toBe("vms-member");
    });
});
