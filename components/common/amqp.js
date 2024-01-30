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

const Log = require('./log.js').Log;

var container;
var nextCid = 1;
var nextMessageId = 1;
var inFlight = {};        // { cid : handler }

const DEFAULT_TIMEOUT_SECONDS = 5;

const rhea_handlers = function() {
    container.options.enable_sasl_external = true;

    container.on('connection_open', function(context) {
        const conn = context.connection.skxConn;
        Log(`AMQP Connection '${conn.logName}' is open`);
    });

    container.on('receiver_open', function(context) {
        let conn = context.connection.skxConn;
        if (context.receiver == conn.replyReceiver) {
            const firstTime = conn.replyTo == undefined;
            conn.replyTo = context.receiver.source.address;
            Log(`AMQP dynamic reply address for connection '${conn.logName}': ${conn.replyTo}`);

            if (firstTime) {
                conn.senders.forEach(sender => {
                    if (sender.sendable && !sender.notified) {
                        sender.notified = true;
                        sender.onSendable(sender.context);
                    }
                });
            }
        }
    });

    container.on('sendable', function(context) {
        let conn = context.connection.skxConn;
        conn.senders.forEach(sender => {
            if (sender.amqpSender == context.sender) {
                if (!sender.notified) {
                    sender.sendable = true;
                    if (conn.replyTo != undefined) {
                        sender.notified = true;
                        Log(`AMQP Sender '${sender.logName}' is now reachable`);
                        sender.onSendable(sender.context);
                    }
                }
            }
        });
    });

    container.on('message', function (context) {
        let conn    = context.connection.skxConn;
        let message = context.message;
        let cid     = message.correlation_id;
        var handler;
        if (context.receiver == conn.replyReceiver) {
            if (cid) {
                handler = inFlight[cid];
                if (handler) {
                    delete inFlight[cid];
                    handler(message);
                }
            } else {
                Log('Received message on reply receiver with no correlation ID');
            }
        } else {
            const receiver = context.receiver.skxReceiver;
            if (receiver) {
                receiver.onMessage(receiver.context, message.application_properties, message.body, (replyAp, replyBody) => {
                    conn.anonSender.send({
                        to                     : message.reply_to,
                        correlation_id         : message.correlation_id,
                        application_properties : replyAp,
                        body                   : replyBody,
                    });
                });
            }
        }
    });
}

exports.OpenConnection = function(logName, host='localhost', port='5672', transport=undefined, ca=undefined, cert=undefined, key=undefined) {
    let conn = {
        amqpConnection : container.connect({
            host      : host,
            hostname  : host,
            transport : transport,
            port      : port,
            ca        : ca,
            key       : key,
            cert      : cert,
        }),
        senders   : [],
        receivers : [],
        logName   : logName,
    };

    conn.replyTo = undefined;
    conn.replyReceiver = conn.amqpConnection.open_receiver({source:{dynamic:true}});
    conn.anonSender    = conn.amqpConnection.open_sender();
    conn.amqpConnection.skxConn = conn;

    return conn;
}

exports.CloseConnection = function(conn) {
    conn.amqpConnection.close();
}

exports.OpenSender = function(logName, conn, address, onSendable, context=undefined) {
    let sender = {
        conn       : conn,
        amqpSender : conn.amqpConnection.open_sender(address),
        onSendable : onSendable,
        context    : context,
        logName    : logName,
        sendable   : false,
        notified   : false,
    };

    sender.amqpSender.skxSender = sender;
    conn.senders.push(sender);

    return sender;
}

exports.OpenReceiver = function(conn, address, onMessage, context=undefined) {
    let receiver = {
        amqpReceiver : conn.amqpConnection.open_receiver(address),
        onMessage    : onMessage,
        context      : context,
    };

    receiver.amqpReceiver.skxReceiver = receiver;
    conn.receivers.push(receiver);

    return receiver;
}

exports.SendMessage = function(sender, messageBody, ap={}, destination=null) {
    const messageId = nextMessageId;
    nextMessageId++;
    let message = {message_id: messageId, body: messageBody, application_properties: ap};
    if (destination) {
        message.to = destination;        
    }
    sender.amqpSender.send(message);
}

exports.Request = function(sender, messageBody, ap={}, timeoutSeconds=DEFAULT_TIMEOUT_SECONDS, destination=null) {
    return new Promise((resolve, reject) => {
        let timer   = setTimeout(() => reject(Error('AMQP request/response timeout')), timeoutSeconds * 1000);
        const cid   = nextCid;
        const msgId = nextMessageId;
        nextMessageId++;
        nextCid++;
        inFlight[cid] = (response) => {
            clearTimeout(timer);
            resolve([response.application_properties, response.body]);
        };
        let message = {
            message_id             : msgId,
            reply_to               : sender.conn.replyTo,
            correlation_id         : cid,
            application_properties : ap,
            body                   : messageBody,
        };
        if (destination) {
            message.to = destination;
        }
        sender.amqpSender.send(message);
    });
}

exports.Start = async function(rhea) {
    Log('[AMQP module started]')
    container = rhea;
    rhea_handlers();
}
