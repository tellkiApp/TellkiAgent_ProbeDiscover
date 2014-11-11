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

if (this.WScript !== undefined) {
    if (!/cscript.exe$/i.test(WScript.FullName)) {
        WScript.Echo('-FAILED: Must be run from within the Windows Scripting engine, cscript.exe');
    }
    else {
        function str() {
            return Array.prototype.join.call(arguments, ''); 
        } 

        // PARSE ARGUMENTS /////////////////////////////////////////////////////////////////////////////////
        var args = (function(wsa) {
            if (wsa !== undefined && wsa !== null && wsa.length > 0) {
                var parsedArgs = {
                    server:	'.',
                    namespace: 'root\\cimv2',
                    username: '',
                    password: ''
                };
                for (var a = 0, alen = wsa.length; a<  alen; a++) {
                    if (wsa(a) === '--server' && a < alen - 1) 		parsedArgs.server = wsa(++a);
                    if (wsa(a) === '--namespace' && a < alen - 1) 	parsedArgs.namespace = wsa(++a);
                    if (wsa(a) === '--user' && a < alen - 1) 		parsedArgs.user = wsa(++a);
                    if (wsa(a) === '--password'&&  a < alen - 1) 	parsedArgs.password = wsa(++a);
                }
                return parsedArgs;
            }
            else return null;
        })(WScript.Arguments);

        var indentChars = ' ';

        var startupError = null,
            locator = false,
            wmi = false,
            stdin = false,
            stdout = false;

        try {
            stdin = WScript.StdIn || false;
            stdout = WScript.StdOut || false;
            locator = new ActiveXObject('WbemScripting.SWbemLocator') || false;
        } 
        catch (e) { startupError = e; }

        if (!!locator && !!stdin && !!stdout && startupError === null) {
            var writeErr = function writeErr(err, id) {
                if (err !== undefined) {
                    var message = (err.constructor === Error || (err.hasOwnProperty('message') && err.hasOwnProperty('number')))
                        ? str(err.message, ' (', err.number, ')')
                        : str('', err);
                        
                    stdout.WriteLine(str(
                        '-', 
                        (id === undefined ? 'FAILED' : id), 
                        ': ', 
                        encodeURIComponent(message)
                    ));
                }
            };
            var connectServer = function connectServer(options) {
                var p = function(pp, df) {
                    return (options.hasOwnProperty(pp) && 
                        options[pp] !== undefined &&
                        options[pp] !== null &&
                        options[pp].constructor === String &&
                        options[pp].length !== 0) ? options[pp] : df;
                };
                
                if (!!wmi) wmi = false;
                wmi = locator.ConnectServer(
                    p('server', '.'), 
                    p('namespace', 'root\\cimv2'), 
                    p('username', ''), 
                    p('password', '')
                ) || false;
                
                if (!!wmi) stdout.WriteLine(str('# Connected to server ', p('server', '.')));  
                return !!wmi;
            };

            if (args !== null) connectServer(args);
            
            // BEGIN LISTENING LOOP ///////////////////////////////////////////////////////////////////////
            var receivedData = '';
            do {
                stdout.WriteLine('+READY');
                receivedData = stdin.ReadLine();
                if (receivedData !== 'QUIT') {
                    try {
                        var command = (function parseCommand(d) {
                            // format for commands: ACTION#id:data...
                            var regex = /^(\w+)[#](\d+)[\:]\s*(.*)$/i
                            var parsed = regex.exec(d) || [];
                            return (parsed.length === 4) ? {
                                action: ('' + parsed[1]).toUpperCase(),
                                id:     parseInt('' + parsed[2]),
                                data:   decodeURIComponent('' + parsed[3])
                            } : false;
                        })(receivedData);
                        
                        if (!!command) {
                            switch (command.action) {
                                case 'CONNECT': {
                                    try {
                                        var data = command.data.split('\0') || [];
                                        
                                        var options = {};
                                        if (data.length > 0) options.server = data[0];
                                        if (data.length > 1) options.namespace = data[1];
                                        if (data.length > 2) options.username = data[2];
                                        if (data.length > 3) options.password = data[3];
                                        
                                        if (!connectServer(options)) writeErr('unknown connection failure', command.id);
                                        stdout.WriteLine(str('{ "id": "', command.id, '", "type": "connectResult", "result": true }'));
                                    }
                                    catch (e) { writeErr(e, command.id); }
                                    break;
                                }
                                case 'QUERY': {
                                    if (!!wmi) {
                                        try {
                                            var results = new Enumerator(wmi.ExecQuery(command.data));
                                            outputResultSet(results, command.id, 0);			
                                            delete results;
                                        }
                                        catch (e) { writeErr(e, command.id); }
                                    }
                                    else { writeErr('Not connected', command.id); }
                                    break;
                                }
                                default: {
                                    writeErr(str('Unknown action \'', command.action, '\''), command.id);
                                    break;
                                }
                            }
                        }
                        else writeErr(str('Received invalid command string \'', receivedData, '\''));
                    }
                    catch (e) { writeErr(e); }
                }
            }
            while (receivedData !== 'QUIT');
        }
        else {
            WScript.Echo('-FAILED: could not attach to stdin and/or stdout');
        }
        delete wmi;
        delete locator;

        WScript.Quit(startupError !== null ? startupError.number : 0); 

        ////////////////////////////////////////////////////////////////////////////////////////////////////

        function getIndentString(indent) {
            var a = [];
            if (indent !== undefined&&  indent.constructor === Number) {
                for (var i = 0; i<  indent; i++) a.push(indentChars);
            }
            return a.join('');
        }

        function getCimType(property) {
            var defaultFormatter = function defaultFormatter(value) {
                return (value !== null&&  value !== undefined)
                    ? str('"', encodeURIComponent(str(value)), '"')
                    : 'null';
            };
            var nullFormatter = function nullFormatter(value) {
                return 'null';
            };
            var arrayFormatter = function(formatter) { return function arrayFormatter(value) {
                if (value === null || value === undefined) return 'null';
                
                value = value.toArray() || [];
                var builder = ['['];
                for (var a = 0, alen = value.length; a < alen; a++) {
                    if (a > 0) builder.push(',');
                    builder.push(formatter(value));
                }
                builder.push(']');
                return builder.join('');
            }};

            var baseType = (function(typeNumber) {
                switch (typeNumber) {
                    case 0x2:	return { name: 'INT16', 	formatter: defaultFormatter };
                    case 0x3:	return { name: 'INT32', 	formatter: defaultFormatter };
                    case 0x4:	return { name: 'FLOAT32', 	formatter: defaultFormatter };
                    case 0x5:	return { name: 'FLOAT64', 	formatter: defaultFormatter };
                    case 0x8:	return { name: 'STRING', 	formatter: defaultFormatter };
                    case 0xB:	return { name: 'BOOL', 		formatter: defaultFormatter };
                    case 0xD:	return { name: 'CIM', 		formatter: nullFormatter };
                    case 0x10:	return { name: 'INT8', 		formatter: defaultFormatter };
                    case 0x11:	return { name: 'UINT8', 	formatter: defaultFormatter };
                    case 0x12:	return { name: 'UINT16', 	formatter: defaultFormatter };
                    case 0x13:	return { name: 'UINT32', 	formatter: defaultFormatter };
                    case 0x14:	return { name: 'INT64', 	formatter: defaultFormatter };
                    case 0x15:	return { name: 'UINT64', 	formatter: defaultFormatter };
                    case 0x65:	return { name: 'DATETIME', 	formatter: defaultFormatter };
                    case 0x66:	return { name: 'CIM*', 		formatter: nullFormatter };
                    case 0x67:	return { name: 'CHAR16', 	formatter: defaultFormatter };
                    default:	return { name: 'UNKNOWN',	formatter: nullFormatter };
                }
            })(property.CIMType);
            
            var isArray = property.IsArray;
            
            return {
                name: str('', baseType.name, (isArray ? '[]' : '')),
                formatter: isArray ? arrayFormatter(baseType.formatter) : baseType.formatter
            };
        }

        function outputResultSet(results, queryId, indent) {
            if (results !== undefined) {
                var indentString = getIndentString(indent);
                
                stdout.WriteLine(str(indentString, '{ "id": "', queryId, '", "type": "resultSet", "results": ['));
                while (!results.atEnd()) {
                    var result = results.item();
                    
                    stdout.WriteLine(str(indentString, indentChars, '{'));
                    outputObject(result, indent + 2);
                    stdout.Write(str(indentString, indentChars, '}'));
                    
                    results.moveNext();
                    stdout.WriteLine(!results.atEnd() ? ',' : '');
                }
                stdout.WriteLine(str(indentString, '] }'));
            }
        }

        function outputObject(wmiObject, indent) {
            var indentString = getIndentString(indent);
            
            if (wmiObject === undefined) {
            }
            else if (wmiObject === null) {
            }
            else {
                stdout.WriteLine(str(indentString, '"class": "', encodeURIComponent(wmiObject.Path_.Class), '",'));
                stdout.WriteLine(str(indentString, '"properties": {'));
                outputProperties(wmiObject, indent + 1);
                stdout.WriteLine(str(indentString, '}'));
            }
        }

        function outputProperties(wmiObject, indent) {
            var indentString = getIndentString(indent);
            
            if (wmiObject === undefined) {
            }
            else if (wmiObject === null) {
            }
            else if (!!wmiObject['Properties_']) {
                var properties = new Enumerator(wmiObject.Properties_);
                while (!properties.atEnd()) {
                    var prop = properties.item();
                    var propName = prop.Name;
                    var cimType = getCimType(prop);
                    properties.moveNext();
                    var separator = properties.atEnd() ? '' : ',';
                    
                    stdout.WriteLine(str(
                        indentString,
                        '"', encodeURIComponent(prop.Name),
                        '": { "type": "', cimType.name, '",',
                        ' "value": ', cimType.formatter(wmiObject[propName]),
                        ' }',
                        separator
                    ));
                    
                    delete separator;
                    delete propName;
                    delete format;
                    delete prop;
                }
                delete properties;
            }
        }
    }
}
else if (process !== undefined && global !== undefined && console !== undefined) {
    console.log('-FAILED: Must be run from within the Windows Scripting engine, cscript.exe');
} 