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
    var Utils = require('util');
     
    function __dbg() {
        //console.log('DEBUG: WmiDate.js: ' + Array.prototype.join.call(arguments, ''));
    }
     
    function WmiDateParts(source) {
        var props = ['year', 'month', 'day', 'hours', 'minutes', 'seconds', 'microseconds', 'timeZoneOffset'];
        for (var i = 0, ilen = props.length; i < ilen; i++) {
            this[props[i]] = (source !== undefined && source !== null && source.hasOwnProperty(props[i])) ? source[props[i]] : NaN;
        }
        return this;
    }
    WmiDateParts.prototype.constructor = WmiDateParts;

    var minDP = new WmiDateParts(), maxDP = new WmiDateParts();
    with (minDP) {
        year = 0;
        month = 1;
        day = 1;
        hours = 0;
        minutes = 0;
        seconds = 0;
        microseconds = 0;
        timeZoneOffset = -999;
    }
    with (maxDP) {
        year = 9999;
        month = 12;
        day = 31;
        hours = 23;
        minutes = 59;
        seconds = 59;
        microseconds = 999999;
        timeZoneOffset = 999;
    };

    var verifyCommon = function verifyCommon(i, p) { 
        i = parseInt(i, 10);
        var rv = (i >= minDP[p] && i <= maxDP[p]) ? i : NaN; 
        //__dbg('verifyCommon(', Array.prototype.join.call(arguments), ') => ', rv);
        return rv;
    };
    var verifyMonthDay = function verifyMonthDay(y, m, d) { 
        var dt = new Date(y, m - 1, d);
        //__dbg('!isNaN(dt.getTime()) => ', !isNaN(dt.getTime()));
        var rv = (isNaN(y) || isNaN(m)) ? d :   
                 (!isNaN(dt.getTime()) && dt.getMonth() === (m - 1)) ? d : 
                 NaN;
        //__dbg('verifyMonthDay(', Array.prototype.join.call(arguments), ') => ', rv);
        return rv;
    };

    function WmiDate() {
        var dateParts = new WmiDateParts();
        
        // add property accessors
        for (var p in dateParts) if (dateParts.hasOwnProperty(p)) {
            this[p] = (function(pp) { return function propertyAccessor(value) {
                if (value === undefined) {
                    return dateParts[pp];
                }
                else if (value.constructor !== Number) {
                    throw new Error('Invalid parameter type for ' + pp + '(value) - expected Number');
                }
                else if (value < minDP[pp] || value > maxDP[pp]) { // NaN should not error
                    throw new Error('Parameter out of range for ' + pp + '(value) - expected ' + minDP[pp] + ' >= value >= ' + maxDP[pp] + '; got ', value);
                }
                else dateParts[pp] = value;
            } })(p);
        }
        
        /* parse arguments, as one of the following:
         * ()                                                     - create a WmiDate based on the current date/time
         * (jsDate:Date)                                          - create a WmiDate based on the supplied JavaScript date
         * (ms1970:Number)                                        - create a WmiDate based on the number of milliseconds since 01-Jan-1970
         * (dateString:String)                                    - create a WmiDate by parsing the date using in-built JavaScript date-string parsing
         * (year:Number, month:Number, day:Number, [hours:Number, mins:Number, secs:Number, [microsecs:Number, [offset:Number]]])
         *                                                        - create a WmiDate with the supplied date part values
         */
        var a = Array.prototype.concat.apply([], arguments);
        __dbg('args = ', Utils.inspect(a));
        if (a.length !== 3 && a.length !== 6 && a.length !== 7 && a.length !== 8) { // use default javascript Date parameter semantics if unspecified params
            var baseDate = (a.length !== 1)              ? new Date() :
                           (a[0].constructor === Number) ? new Date(a[0]) :
                           (a[0].constructor === String) ? new Date(Date.parse(a[0])) :
                           (a[0].constructor === Date)   ? a[0] :
                           new Date();
            __dbg('baseDate: ', baseDate);
                           
            with (this) {
                year          (                                 verifyCommon(baseDate.getFullYear(),             'year')           );
                month         (                                 verifyCommon(baseDate.getMonth() + 1,            'month')          );
                day           ( verifyMonthDay(year(), month(), verifyCommon(baseDate.getDate(),                 'day'))           );
                hours         (                                 verifyCommon(baseDate.getHours(),                'hours')          );
                minutes       (                                 verifyCommon(baseDate.getMinutes(),              'minutes')        );
                seconds       (                                 verifyCommon(baseDate.getSeconds(),              'seconds')        );
                microseconds  (                                 verifyCommon(baseDate.getMilliseconds() * 1000,  'microseconds')   );
                timeZoneOffset(                                 verifyCommon(baseDate.getTimezoneOffset(),       'timeZoneOffset') );
            }
        }
        else with (this) {
            year          (                                 verifyCommon((a.length > 0) ? a[0] : NaN, 'year')           );
            month         (                                 verifyCommon((a.length > 1) ? a[1] : NaN, 'month')          );
            day           ( verifyMonthDay(year(), month(), verifyCommon((a.length > 2) ? a[2] : NaN, 'day'))           );
            hours         (                                 verifyCommon((a.length > 3) ? a[3] : NaN, 'hours')          );
            minutes       (                                 verifyCommon((a.length > 4) ? a[4] : NaN, 'minutes')        );
            seconds       (                                 verifyCommon((a.length > 5) ? a[5] : NaN, 'seconds')        );
            microseconds  (                                 verifyCommon((a.length > 6) ? a[6] : NaN, 'microseconds')   );
            timeZoneOffset(                                 verifyCommon((a.length > 7) ? a[7] : NaN, 'timeZoneOffset') );
        }
        
        __dbg(Utils.inspect(dateParts));
            
        // methods
        //this.constructorParameters = function constructorParameters() { return a; };
        this.toString = function toString() { return Utils.format('%j', dateParts); };
        
        this.toWMIString = function toWMIString() {
            var stringParts = new WmiDateParts(dateParts);  // make a copy of the current values
            var offsetSymbol = (stringParts.timeZoneOffset < 0) ? '-' : '+';
            stringParts.timeZoneOffset = Math.abs(stringParts.timeZoneOffset);  // fixup offset to make later actions uniform

            // fixup string lengths and set to * if invalid
            for (var p in stringParts) if (stringParts.hasOwnProperty(p)) {
                var len = 0 + ('' + maxDP[p]).length;
                //__dbg('maxDP[', p, '] => ', maxDP[p], ', len = ', len, '; stringParts[', p, '] => ', stringParts[p], ', len = ', ('' + stringParts[p]).length);
                if (isNaN(stringParts[p]) || stringParts[p] < minDP[p] || stringParts[p] > maxDP[p] || ('' + stringParts[p]).length > len) {
                    stringParts[p] = [];
                    while (stringParts[p].length < len) stringParts[p].push('*');
                    stringParts[p] = stringParts[p].join('');
                }
                else stringParts[p] = '' + stringParts[p];
                
                while (stringParts[p].length < len) {
                    //__dbg('', p, ': prepending \'0\' to ', stringParts[p]); 
                    stringParts[p] = '0' + stringParts[p]
                };
            };
            
            // concatenate and return
            with (stringParts) {
                var str = [year, month, day, hours, minutes, seconds, '.', microseconds, offsetSymbol, timeZoneOffset].join('');
                __dbg('toWMIString() => this: ', this, '; returns ', str);
                return str;
            }
        };
        
        this.toJavaScriptDate = function toJavaScriptDate() {
            var parts = new WmiDateParts(dateParts);
            with (parts) {
                year           =                             verifyCommon(year,           'year')           ;
                month          =                             verifyCommon(month,          'month')          ;
                day            = verifyMonthDay(year, month, verifyCommon(day,            'day'))           ;
                hours          =                             verifyCommon(hours,          'hours')          ;
                minutes        =                             verifyCommon(minutes,        'minutes')        ;
                seconds        =                             verifyCommon(seconds,        'seconds')        ;
                microseconds   =                             verifyCommon(microseconds,   'microseconds')   ;
                timeZoneOffset =                             verifyCommon(timeZoneOffset, 'timeZoneOffset') ;
                            
                var milli = '' + (!isNaN(microseconds) ? Math.floor((microseconds / 1000000) * 1000) : '000');
                while (milli.length < 3) milli = '0' + milli;
                            
                var offsetSign = (timeZoneOffset > 0)   ? '-' : // invert offset sign for ISO sign
                                 (timeZoneOffset < 0)   ? '+' :
                                 'Z';
                var offsetHours = Math.floor(Math.abs(timeZoneOffset) / 60);
                var offsetMins = ((Math.abs(timeZoneOffset) / 60) - offsetHours) * 60;
                offsetHours = (offsetSign === 'Z') ? '' : ('' + (offsetHours < 10 ? '0' : '') + offsetHours);
                offsetMins =  (offsetSign === 'Z') ? '' : ('' + (offsetMins < 10 ? '0' : '') + offsetMins);
                
                for (var p in parts) if (parts.hasOwnProperty(p)) {
                    parts[p] = '' + ((isNaN(parts[p])) ? minDP[p] : parts[p]);
                    var len = ('' + maxDP[p]).length;
                    while (parts[p].length < len) parts[p] = '0' + parts[p];
                };
                
                var iso = [year, '-', month, '-', day, 'T', 
                           hours, ':', minutes, ':', seconds, '.', milli, 
                           offsetSign, offsetHours, offsetMins].join('');
            }
            
            var date = new Date(Date.parse(iso));
            __dbg('toJavaScriptDate() => this: ', this, '; iso: ', iso, '; returns ', date);
            return date;
        };
        
        return this;
    }
    WmiDate.prototype.constructor = WmiDate;

    WmiDate.fromWMIString = function fromWMIString(str) {
        str = '' + str;
        var regex = /^(\d\d\d\d|\*\*\*\*)(\d\d|\*\*)(\d\d|\*\*)(\d\d|\*\*)(\d\d|\*\*)(\d\d|\*\*)\.((\d\d\d)(\d\d\d)?|\*\*\*(\*\*\*)?)([+\-](\d\d\d|\*\*\*))$/i;
        var match = regex.exec(str) || [];
        __dbg('str : ', str.constructor, ' = ', str, '; match : Array[', match.length, '] = [', match, ']');
        
        var canParse = (match.length === 13);
        var year  = canParse ?                     verifyCommon(match[1],  'year') : NaN;
        var month = canParse ?                     verifyCommon(match[2],  'month') : NaN;
            
        var date = new WmiDate(
            year,
            month,
            canParse ? verifyMonthDay(year, month, verifyCommon(match[3],  'day'))                : NaN,
            canParse ?                             verifyCommon(match[4],  'hours')               : NaN,
            canParse ?                             verifyCommon(match[5],  'minutes')             : NaN,
            canParse ?                             verifyCommon(match[6],  'seconds')             : NaN,
            canParse ?                             verifyCommon(match[7],  'microseconds')        : NaN,
            canParse ?                             verifyCommon(match[11], 'timeZoneOffset') * -1 : NaN
        );    
        
        __dbg('return date => ', date);
        return date;
    };

    module.exports = WmiDate;
}