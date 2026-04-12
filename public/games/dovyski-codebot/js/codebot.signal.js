/*
	The MIT License (MIT)

	Copyright (c) 2015 Fernando Bevilacqua

	Permission is hereby granted, free of charge, to any person obtaining a copy of
	this software and associated documentation files (the "Software"), to deal in
	the Software without restriction, including without limitation the rights to
	use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
	the Software, and to permit persons to whom the Software is furnished to do so,
	subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
	FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
	COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
	IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
	CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/**
 * A signal used by the signals system.
 */

var CodebotSignal = function() {
    var mCallbacks = [];

    this.add = function(theCallback, theThis) {
        var aRet = false;

        if(mCallbacks.indexOf(theCallback) == -1) {
            mCallbacks.push({callback: theCallback, context: theThis});
            aRet = true;
        }

        return aRet;
    };

    this.remove = function(theCallback) {
        var aFound = false,
            i;

        for(i = 0; i < mCallbacks.length; i++) {
            if(mCallbacks[i].callback == theCallback) {
                mCallbacks.slice(i, 1);
                i--;
                aFound = true;
            }
        }

        return aFound;
    };

    this.removeAll = function() {
        mCallbacks.slice(0);
    };

    this.dispatch = function(theArgs) {
        for(var c in mCallbacks) {
            mCallbacks[c].callback.apply(mCallbacks[c].context || this, theArgs);
        }
    };
};
