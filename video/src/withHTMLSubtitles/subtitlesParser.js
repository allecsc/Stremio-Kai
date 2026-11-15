var VTTJS = require('vtt.js');
var binarySearchUpperBound = require('./binarySearchUpperBound');

var CRITICAL_ERROR_CODE = 0;

function parse(text) {
    return new Promise(function(resolve, reject) {
        var parser = new VTTJS.WebVTT.Parser(window, VTTJS.WebVTT.StringDecoder());
        var errors = [];
        var cues = [];
        var cuesByTime = {};

        parser.oncue = function(c) {
            var cue = {
                startTime: (c.startTime * 1000) | 0,
                endTime: (c.endTime * 1000) | 0,
                text: c.text
            };
            cues.push(cue);
            cuesByTime[cue.startTime] = cuesByTime[cue.startTime] || [];
            cuesByTime[cue.endTime] = cuesByTime[cue.endTime] || [];
        };

        parser.onparsingerror = function(error) {
            if (error.code === CRITICAL_ERROR_CODE) {
                parser.oncue = null;
                parser.onparsingerror = null;
                parser.onflush = null;
                reject(error);
            } else {
                console.warn('Subtitles parsing error', error);
                errors.push(error);
            }
        };

        parser.onflush = function() {
            cuesByTime.times = Object.keys(cuesByTime)
                .map(function(time) {
                    return parseInt(time, 10);
                })
                .sort(function(t1, t2) {
                    return t1 - t2;
                });
            for (var i = 0; i < cues.length; i++) {
                cuesByTime[cues[i].startTime].push(cues[i]);
                var startTimeIndex = binarySearchUpperBound(cuesByTime.times, cues[i].startTime);
                for (var j = startTimeIndex + 1; j < cuesByTime.times.length; j++) {
                    if (cues[i].endTime <= cuesByTime.times[j]) {
                        break;
                    }

                    cuesByTime[cuesByTime.times[j]].push(cues[i]);
                }
            }

            for (var k = 0; k < cuesByTime.times.length; k++) {
                cuesByTime[cuesByTime.times[k]].sort(function(c1, c2) {
                    return c1.startTime - c2.startTime ||
                        c1.endTime - c2.endTime;
                });
            }

            parser.oncue = null;
            parser.onparsingerror = null;
            parser.onflush = null;
            // we may have multiple parsing errors here, but will only respond with the first
            // if subtitle cues are available, we will not reject the promise
            if (cues.length === 0 && errors.length) {
                reject(errors[0]);
            } else if (cuesByTime.times.length === 0) {
                reject(new Error('Missing subtitle track cues'));
            } else {
                resolve(cuesByTime);
            }
        };

        parser.parse(text);
    });
}

module.exports = {
    parse: parse
};
