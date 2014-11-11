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
        //console.log('DEBUG: ResultSetParser.js: ' + Array.prototype.join.call(arguments, '')); 
    }

    var WmiDate = require('./WmiDate.js');
     
    var TypeParsers = (function() {
        var decode = decodeURIComponent;
        
        var stringValueParser = function stringValueParser(str) {
            return (str !== undefined && str !== null && str.constructor === String) 
                ? decode(str) 
                : null;
        };
        var numberValueParser = function(func) { return function numberValueParser(str) {
            if (str !== undefined && str !== null && str.constructor === String && str.length !== 0) {
                var val = func(decode(str));
                if (!isNaN(val)) return val;
            }
            return null;
        }};
        var dateTimeValueParser = function dateTimeValueParser(str) {
            if (str !== undefined && str !== null && str.constructor === String && str.length !== 0) {
                return WmiDate.fromWMIString(decode(str));
            }
            return null;
        };
        var booleanValueParser = function booleanValueParser(str) {
            return (str !== undefined && str !== null && str.constructor === String)
                ? (decode(str) === 'true')
                : null;
        };
        var nullValueParser = function nullValueParser() { return null; };
        var arrayParser = function(baseParser) { return function arrayParser(array) {
            if (array !== undefined && array !== null && array.constructor === Array) {
                var result = [];
                for (var i = 0, ilen = array.length; i < ilen; i++) {
                    result.push(baseParser(array[i]));
                }
                return result;
            }
            return null;
        }};
            
        var parserMapping = {
            "INT16":        numberValueParser(parseInt),
            "INT32":        numberValueParser(parseInt),
            "FLOAT32":      numberValueParser(parseFloat),
            "FLOAT64":      numberValueParser(parseFloat),
            "STRING":       stringValueParser,
            "BOOL":         booleanValueParser,
            "CIM":          nullValueParser,
            "INT8":         numberValueParser(parseInt),
            "UINT8":        numberValueParser(parseInt),
            "UINT16":       numberValueParser(parseInt),
            "UINT32":       numberValueParser(parseInt),
            "INT64":        numberValueParser(parseInt),
            "UINT64":       numberValueParser(parseInt),
            "DATETIME":     dateTimeValueParser,
            "CIM*":         nullValueParser,
            "CHAR16":       stringValueParser,
            "UNKNOWN":      nullValueParser
        };
        
        return {
            getTypeParser: function getTypeParser(typeName) {
                if (typeName !== undefined && typeName !== null || typeName.constructor === String || typeName.length !== 0) {
                    var regex = /^([A-Z0-9\*]+)((\[\])?)$/i;
                    var typeMatch = regex.exec(typeName) || [];
                    if (typeMatch.length === 4) {
                        var baseType = typeMatch[1];
                        var isArray = (typeMatch[3] === '[]');
                        if (parserMapping.hasOwnProperty(baseType)) {
                            var baseParser = parserMapping[baseType];
                            return isArray ? arrayParser(baseParser) : baseParser;
                        }
                    }
                    else __dbg(typeMatch.length);
                }
                else __dbg('if(', typeName, ') returns false => ', typeName !== undefined, typeName !== null, typeName.constructor === String, typeName.length !== 0);
                return false;
            }
        };
    })();

    var parseResultElement = function parseResultElement(elem) {
        __dbg('in parseElement(...', /*Utils.inspect(elem),*/ ')');
        var parsed = {};
        __dbg('created initial object');
        if (elem !== undefined && elem !== null && elem.hasOwnProperty('properties')) {
            for (var p in elem.properties) { 
                var property = elem.properties[p];
                var typeParser = TypeParsers.getTypeParser(property.type);
                if (!!typeParser) {
                    parsed[p] = typeParser(property.value);
                }
            }
            
            // && elem.properties[p].hasOwnProperty('type') && elem[p].hasOwnProperty('value')) {
                    // __dbg('p = ', p);
                    // var property = elem.properties[p];
                    // 
                // }
            // }
        }
        return parsed;
    }

    var parseObject = function parseObject(obj) {
        if (obj !== undefined && obj !== null && obj.results !== undefined && obj.results.constructor === Array) {  
            var resultSet = [];
            __dbg('obj.results.length = ', obj.results.length);
            for (var i = 0, ilen = obj.results.length; i < ilen; i++) {
                __dbg('i = ', i, '; ilen = ', ilen);
                var parsed = parseResultElement(obj.results[i]);
                __dbg('finished parsing');
                resultSet.push(parsed);
            }
            return resultSet;
        }
        return [];
    };

    module.exports.parseObject = parseObject;
}