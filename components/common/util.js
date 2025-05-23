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

const mapEqual_sync = function(left, right) {
    if (typeof(left) != 'object' || typeof(right) != 'object') {
        return left === right;
    }

    let leftKeys  = Object.keys(left);
    let rightKeys = Object.keys(right);
    if (leftKeys.length != rightKeys.length) {
        return false;
    }

    var i;
    for (i = 0; i < leftKeys.length; i++) {
        let key = leftKeys[i];
        if (!rightKeys.includes(key)) {
            return false;
        }
        if (!mapEqual_sync(left[key], right[key])) {
            return false;
        }
    }

    return true;
}

exports.mapEqual_sync = mapEqual_sync;

exports.allSettled = function(plist) {
    return new Promise((resolve, reject) => {
        let results = [];
        if (plist.length == 0) {
            resolve(results);
        } else {
            plist.forEach(prom => prom
                .then(result => {
                    results.push({
                        status : 'fulfilled',
                        value  : result
                    });
                })
                .catch(reason => {
                    results.push({
                        status : 'rejected',
                        reason : reason
                    });
                })
                .finally(() => {
                    if (plist.length == results.length) {
                        resolve(results);
                    }
                }));
        }
    });
}

const uuidRegex = RegExp("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
const dnsRegex  = RegExp("^[A-Za-z][A-Za-z0-9-\.]{0,63}$");
const dtzRegex  = RegExp("^[1-2][0-9]{3}-[0-1][0-9]-[0-5][0-9]T[0-2][0-9]:[0-5][0-9]$");

exports.IsValidUuid = function(text) {
    return uuidRegex.test(text);
}

exports.ValidateAndNormalizeFields = function(fields, table) {
    var optional = {};
    for (const [key, value] of Object.entries(table)) {
        optional[key] = value.optional;
    }

    var normalized = {};

    for (const [key, value] of Object.entries(fields)) {
        if (Object.keys(table).indexOf(key) < 0) {
            throw(Error(`Unknown field key ${key}`));
        }
        delete optional[key];
        switch (table[key].type) {
        case 'string' :
            if (typeof value != 'string') {
                throw(Error(`Expected string value for ${key}`));
            }
            if (value.indexOf("'") != -1) {
                throw(Error(`Single quotes not permitted for ${key}`));
            }
            normalized[key] = value;
            break;

        case 'dnsname' :
            if (dnsRegex.test(value)) {
                normalized[key] = value;
            } else {
                throw(Error(`Expected valid DNS-name syntax for ${key} (got '${value}')`));
            }
            break;

        case 'accesskind' :
            if (value == 'claim' || value == 'peer' || value == 'member' || value == 'manage') {
                normalized[key] = value;
            } else {
                throw(Error(`Expected [claim, peer, member, manage] for ${key}`));
            }
            break;

        case 'kubeselector' :
            throw(Error(`kubeselector field type not implemented, got ${value}`));

        case 'bool' :
            if (typeof value != 'string' || (value != 'true' && value != 'false')) {
                throw(Error(`Expected [true, false] for ${key}`));
            }
            normalized[key] = value == 'true';
            break;

        case 'number' :
            if (typeof value == 'string') {
                if (isNaN(value)) {
                    throw(Error(`String value is not numeric for ${key}`));
                }
                normalized[key] = parseInt(value);
            } else if (typeof value == 'number') {
                normalized[key] = value;
            } else {
                throw(Error(`Expected a number or numeric string for ${key}`));
            }
            break;

        case 'timestampz' :
            if (dtzRegex.test(value)) {
                normalized[key] = value;
            } else {
                throw(Error(`timestampz field malformed: ${value}`));
            }
            break;

        case 'uuid' :
            if (!exports.IsValidUuid(value)) {
                throw(Error(`Expected valid uuid for ${key}`));
            }
            normalized[key] = value;
        }
    }

    for (const [key, value] of Object.entries(optional)) {
        if (!value) {
            throw(Error(`Mandatory key ${key} not found`));
        } else {
            normalized[key] = table[key].default;
        }
    }

    return normalized;
}

exports.UniquifyName = function(name, existingNames) {
    if (existingNames.indexOf(name) < 0) {
        return name;
    }

    var ordinal = 2;
    while (existingNames.indexOf(`${name}.${ordinal}`) >= 0) {
        ordinal++;
    }
    return `${name}.${ordinal}`;
}
