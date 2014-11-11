/* Copyright (c) 2012 Jamie Barnes
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

if (this.WScript !== undefined && WScript.Echo !== undefined) {
    WScript.Echo('-FAILED: Must be run from within the NodeJS engine, node.exe');
}
else {
    function __dbg() {
        //console.log('DEBUG: WmiProxyOutputParser.js: ' + Array.prototype.join.call(arguments, ''));
    }
    
    var Events = require('events');
    var Utils = require('util');
    
    var noopParser = { parseObject: function parseObject() { } };

    var SubParsers = {
        resultSet:      require('./ResultSetParser.js'),
        connectResult:  noopParser
    };

    function Parser(globalOptions) {
        Events.EventEmitter.call(this);
            
        var unhandledErrors = [];
        var receivedLines = [];
        var results = {};
        
        var nextTick = (globalOptions !== undefined && 
                        globalOptions !== null && 
                        globalOptions.hasOwnProperty('nextTickHandler') &&
                        globalOptions.nextTickHandler !== undefined &&
                        globalOptions.nextTickHandler !== null &&
                        globalOptions.nextTickHandler.constructor === Function) 
                            ? globalOptions.nextTickHandler 
                            : (global.setImmediate || process.nextTick);

        var emitUnhandledError = function emitUnhandledError(err) {
            __dbg('in emitUnhandledError(', err, ')');
            if (unhandledErrors !== null) unhandledErrors.push(err);
            else this.emit('unhandledError', err);
            __dbg('out emitUnhandledError(', err, ')');
        };
        
        this.on('newListener', function onNewListener(event, listener) {
            if (event === 'unhandledError') nextTick(function() {
                if (unhandledErrors.length !== 0) {
                    for (var i = 0, ilen = unhandledErrors.length; i < ilen; i++) {
                        this.emit('unhandledError', unhandledErrors[i]);
                    }
                    unhandledErrors = null;
                }
            });
        });
        
        var fail = function fail(errorLine) {
            __dbg('in fail(', errorLine, ')');
            var regex = /^[\-](FAILED|(\d+))[\:]\s*(.*)$/i;
            var parsed = regex.exec(errorLine) || [];
            if (parsed.length === 4) {
                var sendID = parseInt('' + parsed[2]);              // parsed[2] contains the sendID, to tie requests to results
                var message = decodeURIComponent('' + parsed[3]);   // parsed[4] contains the encoded error message
                var error = new Error(message);
                
                if (!isNaN(sendID)) {
                    __dbg('Parser.fail attached error \'', message, '\' to results for #', sendID);
                    results[sendID] = error;        // store the error against the sendID, for retrieval by WmiProxy class
                }
                else {
                    __dbg('Parser.fail emits \'', message, '\' to generic handler');
                    emitUnhandledError(error);
                }
            }
            else {
                __dbg('Parser.fail received unparseable error line: \'', errorLine, '\'');
                emitUnhandledError(new Error(['An error was received but was unparseable: \'', errorLine, '\''].join('')));
            }
        };
        
        var parse = function parse(json) {
            __dbg('in parse(', json, ')');
            if (('' + json).length !== 0) {
                try {
                    var obj = JSON.parse(json) || false;
                    var error = new Error(['invalid JSON object returned: ', json].join(''));
                    
                    if (!!obj && obj.hasOwnProperty('id') && obj.id !== undefined && obj.id !== null && obj.id.constructor === String && obj.id.length !== 0) {
                        var id = '' + obj.id;
                        
                        if (obj.hasOwnProperty('type') && obj.type !== null && obj.type.constructor === String && obj.type.length !== 0) {
                            if (SubParsers.hasOwnProperty(obj.type) && SubParsers[obj.type] !== null && SubParsers[obj.type].hasOwnProperty('parseObject')) {
                                results[id] = SubParsers[obj.type].parseObject(obj);
                            }
                            else results[id] = error;
                        }
                        else results[id] = error;
                        __dbg('parse(...) => results[', id, '] = ', Utils.inspect(results[id]));
                    }
                    else throw error;
                }
                catch (e) { emitUnhandledError(e); }
            }
            __dbg('out parse(', json, ')');
        };
        
        this.addReceivedData = function addReceivedData(data) {
            __dbg('in addReceivedData(', data, ')');
            if (data !== undefined && data.constructor === String) {
                var lines = data.split('\r\n') || [];
                var linesLength = lines.length;
                if (linesLength > 0) {
                    for (var i = 0; i < linesLength; i++) {
                        if (lines[i].length > 0) {
                            if (lines[i].charAt(0) === '#') { 
                                // noop for comment line beginning with #
                            }
                            else if (lines[i].charAt(0) === '-') {
                                // lines starting with '-' are failures/errors, 
                                // which invalidate the received lines
                                nextTick((function(erl) { return function() {
                                    fail(erl);
                                }})(lines[i]));
                                receivedLines.length = 0;
                            }
                            else if (lines[i] === '+READY') {
                                // +READY is a sentinel which allows processing of all prior lines
                                nextTick((function(json) { return function() {
                                    parse(json);
                                }})(receivedLines.join('\n')));
                                receivedLines.length = 0;
                            }
                            else { receivedLines.push(lines[i]); }
                        }
                    }
                }
            }
            __dbg('out addReceivedData(', data, ')');
        }
        
        this.getResult = function getResult(id) {
            //__dbg('in getResult(', id, ')');
            id = ('' + id);
            var result = false;
            
            if (results.hasOwnProperty(id)) {
                result = results[id];
                __dbg('getResult(', id, ') yielding result: ', Utils.inspect(result));
                delete results[id];
            }
            //__dbg('out getResult(', id, ') => ', result);
            return result;
        };
    }
    Utils.inherits(Parser, Events.EventEmitter);

    module.exports.Parser = Parser;
}