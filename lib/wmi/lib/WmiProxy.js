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
       //console.log('DEBUG: WmiProxy.js: ' + Array.prototype.join.call(arguments, ''));
    }

    var Path = require('path');
    var ChildProcess = require('child_process');
    var Events = require('events');
    var Utils = require('util');
    var OutputParser = require('./WmiProxyOutputParser.js');
   
    if (Utils.isError === undefined) Utils.isError = function(obj) { return (obj !== undefined && obj !== null && obj.constructor === Error); }

    var globalOptions = {
        cscriptEngine:      Path.join(process.env.SystemRoot, 'system32', 'cscript.exe'),
        nextTickHandler:    global.setImmediate || process.nextTick
    };

    var definition = {};
    definition.cscriptEngine = function(val) { 
        if (val !== undefined && 
            val !== null &&
            val.constructor === globalOptions.cscriptEngine.constructor &&
            Path.existsSync(val)) globalOptions.cscriptEngine = val;
        return globalOptions.cscriptEngine;
    };
    definition.nextTickHandler = function(val) {
        if (val !== undefined &&
            val !== null &&
            val.constructor === globalOptions.nextTickHandler.constructor) globalOptions.nextTickHandler = val;
        return globalOptions.nextTickHandler;
    }

    function WmiProxy() {
        __dbg('creating WmiProxy...');
        Events.EventEmitter.call(this);
        
        var cscriptEngine = definition.cscriptEngine();     // take copies of global options, in case they change later
        var nextTick = definition.nextTickHandler();
        var parser = new OutputParser.Parser(globalOptions);
        var proxyProcess = false;
        var sendQueue = [];
        
        // bubble up any errors from the parser
        parser.on('unhandledError', function(err) { this.emit('parserError', err); });
        
        this.cscriptEngine = function() { return cscriptEngine; };
        
        var ensureProcess = function ensureProcess(callback) {
            __dbg('in ensureProcess...');

            if (!proxyProcess) {
                // build arguments for cscript.exe
                var args = [ '//nologo', '//E:jscript', Path.join(__dirname, 'MsWindowsWmiProxy.js') ];
                __dbg('cscriptEngine: ' + cscriptEngine);
                __dbg('args: ' + args);
                
                // create the proxyProcess to run the proxy script
                try { 
                    proxyProcess = ChildProcess.spawn(cscriptEngine, args);               
                    proxyProcess.on('exit', function() { proxyProcess = false; __dbg('...Process exited'); });
                    proxyProcess.stdout.on('data', function(d) { 
                        __dbg('STDOUT#', proxyProcess.pid, ': ' + d); 
                        parser.addReceivedData('' + d);
                    });
                }
                catch (err) { return callback(err, null); }
            }
            if (!!proxyProcess) callback(null, proxyProcess);
            __dbg('out ensureProcess...');
        };
        
        var nextID = (function() { 
            var id = 0;
            return function nextID() {
                if (id > (Number.MAX_VALUE - 1)) id = 0;
                return ++id;
            };
        })();

        var send = function send(action, data, callback) {
            __dbg('in send...');
            if (action === undefined || action === null || action.constructor !== String || action.length === 0) throw new Error('Missing or invalid argument: action; expected String');
            action = ('' + action).toUpperCase();
            
            if (callback === undefined && data !== undefined && data !== null && data.constructor === Function) {
                callback = data;
                data = '';
            }
            
            var id = false;
            var command = ''
            if (action !== 'QUIT') {
                data = '' + data;
                id = nextID();
                command = '' + [action, '#', id, ':', encodeURIComponent(data)].join('');
            }
            else command = 'QUIT';
            
            var item = { 
                dispatched: false,
                command: command,    
            };
            if (id !== false) item.id = id;
            if (callback !== undefined && callback !== null && callback.constructor === Function) item.callback = callback;
            
            if (sendQueue.length === 0) nextTick(nextTickCallback);
            sendQueue.push(item);
        };
        
        var nextTickCallback = function nextTickCallback() {
            /* <summary>
             * This runs on every tick, checking the next item in the send queue.  If it has not been dispatched to the proxy,
             * it will send the command to the proxy's stdin.  If no callback function was specified in the call to send(), the 
             * queued command is discarded, otherwise it is inserted back into the front of the queue for results checking. 
             * If it has already been dispatched, it will check to see if there are any results to yield; if so, it will run 
             * the callback function with those results.  
             * </summary
             */
            if (sendQueue.length > 0) {
                var item = sendQueue[0];
                
                if (item !== undefined && item !== null && item.hasOwnProperty('command') && item.hasOwnProperty('dispatched')) {
                    if (!item.dispatched) {
                        ensureProcess(function(err, proc) {
                            if (err === null && proc !== null) {
                                __dbg('STDIN#', proc.pid, ': ', item.command);
                                proc.stdin.write(item.command + '\n');
                            }
                            else __dbg('error ensuring proxyProcess');
                        });
                        item.dispatched = true;
                        if (!item.hasOwnProperty('callback')) sendQueue.shift(); // remove it from the queue as it cannot callback
                    }
                    else if (item.hasOwnProperty('id') && item.id !== undefined && item.id !== null) {
                        var result = parser.getResult(item.id);
                        if (result !== false) {
                            sendQueue.shift();              // no further action required
                            if (item.hasOwnProperty('callback') && item.callback !== undefined && item.callback !== null && item.callback.constructor === Function) {
                                if (Utils.isError(result)) item.callback(result, null);
                                else item.callback(null, result);
                            }
                        }
                    }
                    else if (item.command === 'QUIT') {     // special-case command receives no results, so check if proxy is ended
                        if (!proxyProcess) {
                            sendQueue.shift();              // no further action required
                            if (item.hasOwnProperty('callback') && item.callback !== undefined && item.callback !== null && item.callback.constructor === Function) {
                                item.callback();
                            }
                        }
                    }
                }
                if (sendQueue.length > 0) nextTick(nextTickCallback);   // loop if there are still items to process
            }
        };
        
        this.query = function query(wql, callback) {
            __dbg('in query(', wql, ')...');
            send('QUERY', wql, callback);
        };
        
        this.connect = function connect(server, namespace, username, password, callback) {
            __dbg('in connect(', [server, namespace, username, password, callback], ')...');
            if (server !== undefined && server.constructor === Function)        { callback = server;    server = undefined; }
            if (namespace !== undefined && namespace.constructor === Function)  { callback = namespace; namespace = undefined; }
            if (username !== undefined && username.constructor === Function)    { callback = username;  username = undefined; }
            if (password !== undefined && password.constructor === Function)    { callback = password;  password = undefined; }
                
            try { 
                var data = [];
                
                if (server !== undefined && server !== null && server.constructor === String && server.length !== 0) {
                    data.push(server);
                    if (namespace !== undefined && namespace !== null && namespace.constructor === String && namespace.length !== 0) {
                        data.push(namespace);
                        if (username !== undefined && server !== null && server.constructor === String && server.length !== 0) {
                            data.push(username);
                            if (password !== undefined && server !== null && server.constructor === String && server.length !== 0) {
                                data.push(password);
                            }
                        }
                    }
                }
                if (callback !== undefined && callback !== null && callback.constructor === Function) {
                    var returnedWmiProxy = this;
                    send('CONNECT', data.join('\0'), function(err, results) { 
                        callback(err, returnedWmiProxy); 
                    })
                }
                else { send('CONNECT', data.join('\0')); }
            }
            catch (e) { 
                if (callback !== undefined || callback !== null || callback.constructor !== Function) callback(e, null);
            }
        }
        
        this.dispose = function dispose(callback) {
            __dbg('in dispose...');
            if (!!proxyProcess) { 
                send('QUIT', callback);
            }
        };
    }
    Utils.inherits(WmiProxy, Events.EventEmitter);

    definition.connect = function connect(server, namespace, username, password, callback) {
        var wmiProxy = new WmiProxy();
        wmiProxy.connect(server, namespace, username, password, callback);
    };

    module.exports = definition;
}