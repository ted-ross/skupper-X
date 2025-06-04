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

const TOKEN_LITERAL  = 0;
const TOKEN_VARIABLE = 1;
const TOKEN_IF       = 2;
const TOKEN_ELSE     = 3;
const TOKEN_END      = 4;

const END_WITH_ELSE = 1;
const END_WITH_END  = 2;
const END_WITH_EOS  = 3;

const OPEN    = '{{';
const CLOSE   = '}}';
const D_IF    = 'if ';
const D_ELSE  = 'else';
const D_END   = 'end';

const typeName = function(type) {
    switch (type) {
        case TOKEN_LITERAL:  return 'LITERAL';
        case TOKEN_VARIABLE: return 'VARIABLE';
        case TOKEN_IF:       return 'IF';
        case TOKEN_ELSE:     return 'ELSE';
        case TOKEN_END:      return 'END';
    }
}

const print_stream = function(str) {
    for (const token of str) {
        console.log(`${typeName(token.type)}: ${token.content ? token.content.trim() : ''}`);
    }
}

const print_tree = function(node, _margin) {
    let   margin = _margin || '';
    const indent = '  ';

    console.log(`${margin}${typeName(node.type)}: ${node.content ? node.content.trim() : ''}`);
    if (node.type == TOKEN_IF) {
        if (node.thenClause) {
            print_tree(node.thenClause, margin + indent);
        }
        if (node.elseClause) {
            console.log(`${margin}ELSE`);
            print_tree(node.elseClause, margin + indent);
        }
        console.log(`${margin}END`);
    }
    if (node.next) {
        print_tree(node.next, margin);
    }
}

exports.Expand = function(template, localData, remoteData) {
    //
    // Parse the text into a token stream
    //
    let tokenStream = [];
    let text = template;
    while (text.length > 0) {
        let token = new Token();
        text = token.Parse(text);
        tokenStream.push(token);
    }

    //
    // Arrange the tokens into a template tree
    //
    const rootToken = tokenStream.shift();
    const result    = rootToken.Arrange(tokenStream);
    if (result != END_WITH_EOS) {
        throw new Error(`GoTemplate: Template ended with spurious End or Else`);
    }

    //
    // Expand the template tree using the provided data
    //
    return rootToken.Expand(localData, remoteData);
}

class Token {
    constructor() {
        this.type       = undefined;
        this.content    = undefined;
        this.trimLeft   = false;
        this.nextToken  = undefined;
        this.thenClause = undefined;
        this.elseClause = undefined;
    }

    //
    // Parse the text and populate this Token with the first token found.
    // Return the remaining text (after this token).
    //
    Parse(text) {
        if (text == '') {
            throw new Error('GoTemplate: Parsing unexpected empty string');
        }

        const openPos = text.indexOf(OPEN);
        if (openPos == -1) {
            this.type = TOKEN_LITERAL;
            this.content = text;
            return '';
        }
        
        if (openPos > 0) {
            this.type = TOKEN_LITERAL;
            this.content = text.slice(0, openPos);
            return text.slice(openPos);
        }

        const closePos = text.indexOf(CLOSE);
        if (closePos == -1) {
            throw new Error('GoTemplate: Unterminated Directive');
        }

        let innerText = text.slice(OPEN.length, closePos).trim();
        let afterText = text.slice(closePos + CLOSE.length);

        if (innerText[0] == '-') {
            this.trimLeft = true;
            innerText = innerText.slice(1).trim();
        }

        if (innerText.charAt(innerText.length - 1) == '-') {
            innerText = innerText.slice(0, innerText.length - 1).trim();
            afterText = afterText.trimLeft();
        }

        if (innerText.indexOf(D_IF) == 0) {
            this.type = TOKEN_IF;
            this.content = innerText.slice(D_IF.length);
        } else if (innerText.indexOf(D_ELSE) == 0) {
            this.type = TOKEN_ELSE;
        } else if (innerText.indexOf(D_END) == 0) {
            this.type = TOKEN_END;
        } else {
            this.type = TOKEN_VARIABLE;
            this.content = innerText;
        }

        return afterText;
    }

    Arrange(tokenList) {
        if (tokenList.length == 0) {
            return END_WITH_EOS;
        }
        if (this.type == TOKEN_ELSE) {
            return END_WITH_ELSE;
        }
        if (this.type == TOKEN_END) {
            return END_WITH_END;
        }

        const head = tokenList.shift();
        switch (this.type) {
            case TOKEN_LITERAL:
                if (head.trimLeft) {
                    this.content = this.content.trimRight();
                }
                // Fall through...
            case TOKEN_VARIABLE:
                this.next = head;
                return head.Arrange(tokenList);

            case TOKEN_IF:
                this.thenClause = head;
                const thenResult = head.Arrange(tokenList);
                switch (thenResult) {
                    case END_WITH_EOS:
                        throw new Error('GoTemplate: Then clause not closed with End or Else');
                    case END_WITH_ELSE:
                        this.elseClause = tokenList.shift();
                        const elseResult = this.elseClause.Arrange(tokenList);
                        if (elseResult != END_WITH_END) {
                            throw new Error('GoTemplate: Else clause did not close with End');
                        }
                        break;
                    case END_WITH_END:
                        break;
                }
                break;
        }

        if (tokenList.length > 0) {
            this.next = tokenList.shift();
            return this.next.Arrange(tokenList);
        } else {
            return END_WITH_EOS;
        }
    }

    Expand(localData, remoteData) {
        var expanded = '';
        switch (this.type) {
            case TOKEN_LITERAL:
                expanded = this.content;
                break;

            case TOKEN_VARIABLE:
                const val = this._value(localData, remoteData);
                expanded = val.toString();
                break;

            case TOKEN_IF:
                const condition = this._value(localData, remoteData);
                if (condition) {
                    expanded = this.thenClause.Expand(localData, remoteData);
                } else if (this.elseClause) {
                    expanded = this.elseClause.Expand(localData, remoteData);
                }
                break;
        }

        if (this.next) {
            expanded += this.next.Expand(localData, remoteData);
        }
        return expanded;
    }

    _value(localData, remoteData) {
        const prefix = this.content[0];
        const path   = this.content.slice(1).split('.');
        let result = 'UNDEFINED';
        if (prefix == '.') {
            result = localData[this.content.slice(1)];
        } else if (this.content[0] == '$') {
            let traverse = remoteData;
            for (const element of path) {
                traverse = traverse[element];
            }
            result = traverse;
        }

        return result;
    }
}
