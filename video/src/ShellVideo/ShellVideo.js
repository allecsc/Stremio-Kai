var EventEmitter = require('eventemitter3');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var ERROR = require('../error');

var SUBS_SCALE_FACTOR = 0.0066;

var stremioToMPVProps = {
    'loaded': 'loaded',
    'stream': null,
    'paused': 'pause',
    'time': 'time-pos',
    'duration': 'duration',
    'buffering': 'buffering',
    'volume': 'volume',
    'muted': 'mute',
    'playbackSpeed': 'speed',
    'audioTracks': 'audioTracks',
    'selectedAudioTrackId': 'aid',
    'subtitlesTracks': 'subtitlesTracks',
    'selectedSubtitlesTrackId': 'sid',
    'subtitlesSize': 'sub-scale',
    'subtitlesOffset': 'sub-pos',
    'subtitlesDelay': 'sub-delay',
    'subtitlesTextColor': 'sub-color',
    'subtitlesBackgroundColor': 'sub-back-color',
    'subtitlesOutlineColor': 'sub-border-color',
};

function parseVersion(version) {
    return version.split('.').slice(0, 2).map(function (v) { return parseInt(v); });
}

function versionGTE(a, b) {
    var versionA = parseVersion(a);
    var versionB = parseVersion(b);
    if (versionA[0] > versionB[0]) return true;
    if (versionA[0] < versionB[0]) return false;
    return versionA[1] >= versionB[1];
}

function ShellVideo(options) {
    options = options || {};

    var ipc = options.shellTransport;
    var observedProps = {};
    var props = {};
    var stremioProps = {};
    Object.keys(stremioToMPVProps).forEach(function(key) {
        if(stremioToMPVProps[key]) {
            stremioProps[stremioToMPVProps[key]] = key;
        }
    });
    var resolveMPVVersion;
    var waitForMPVVersion = new Promise(function (resolve) {
        resolveMPVVersion = resolve;
    });
    command('unload');

    ipc.send('mpv-command', ['stop']);
    ipc.send('mpv-observe-prop', 'path');

    ipc.send('mpv-observe-prop', 'time-pos');
    ipc.send('mpv-observe-prop', 'volume');
    ipc.send('mpv-observe-prop', 'pause');
    ipc.send('mpv-observe-prop', 'seeking');
    ipc.send('mpv-observe-prop', 'eof-reached');

    ipc.send('mpv-observe-prop', 'duration');
    ipc.send('mpv-observe-prop', 'metadata');
    ipc.send('mpv-observe-prop', 'video-params'); // video width/height
    ipc.send('mpv-observe-prop', 'track-list');

    ipc.send('mpv-observe-prop', 'paused-for-cache');
    ipc.send('mpv-observe-prop', 'cache-buffering-state');

    ipc.send('mpv-observe-prop', 'aid');
    ipc.send('mpv-observe-prop', 'vid');
    ipc.send('mpv-observe-prop', 'sid');
    ipc.send('mpv-observe-prop', 'sub-scale');
    ipc.send('mpv-observe-prop', 'sub-pos');
    ipc.send('mpv-observe-prop', 'sub-delay');
    ipc.send('mpv-observe-prop', 'speed');

    ipc.send('mpv-observe-prop', 'mpv-version');
    ipc.send('mpv-observe-prop', 'ffmpeg-version');

    var events = new EventEmitter();
    var destroyed = false;
    var stream = null;

    var avgDuration = 0;
    var minClipDuration = 30;

    function setBackground(visible) {
        // This is a bit of a hack but there is no better way so far
        var bg = visible ? '' : 'transparent';
        for(var container = options.containerElement; container; container = container.parentElement) {
            container.style.background = bg;
        }
        if (((window || {}).document || {}).getElementsByTagName) {
            var body = window.document.getElementsByTagName('body');
            if ((body || [])[0]) {
                body[0].style.background = bg;
            }
        }
    }
    function logProp(args) {
        // eslint-disable-next-line no-console
        console.log(args.name+': '+args.data);
    }
    function embeddedProp(args) {
        return args.data ? 'EMBEDDED_' + args.data.toString() : null;
    }

    var last_time = 0;
    ipc.on('mpv-prop-change', function(args) {
        switch (args.name) {
            case 'mpv-version':
                resolveMPVVersion(args.data);
                props[args.name] = logProp(args);
                break;
            case 'ffmpeg-version': {
                props[args.name] = logProp(args);
                break;
            }
            case 'duration': {
                var intDuration = args.data | 0;
                // Accumulate average duration over time. if it is greater than minClipDuration
                // and equal to the currently reported duration, it is returned as video length.
                // If the reported duration changes over time the average duration is always
                // smaller than the currently reported one so we set the video length to 0 as
                // this is a live stream.
                props[args.name] = args.data >= minClipDuration && (!avgDuration || intDuration === avgDuration) ? Math.round(args.data * 1000) : null;
                // The average duration is calculated using right bit shifting by one of the sum of
                // the previous average and the currently reported value. This method is not very precise
                // as we get integer value but we avoid floating point errors. JS uses 32 bit values
                // for bitwise maths so the maximum supported video duration is 1073741823 (2 ^ 30 - 1)
                // which is around 34 years of playback time.
                avgDuration = avgDuration ? (avgDuration + intDuration) >> 1 : intDuration;
                props.loaded = intDuration > 0;
                if(props.loaded) {
                    setBackground(false);
                    onPropChanged('loaded');
                }
                break;
            }
            case 'time-pos': {
                props[args.name] = Math.round(args.data*1000);
                break;
            }
            case 'sub-scale': {
                props[args.name] = Math.round(args.data / SUBS_SCALE_FACTOR);
                break;
            }
            case 'sub-pos': {
                props[args.name] = 100 - args.data;
                break;
            }
            case 'sub-delay': {
                props[args.name] = Math.round(args.data*1000);
                break;
            }
            case 'paused-for-cache':
            case 'seeking':
            {
                if(props.buffering !== args.data) {
                    props.buffering = args.data;
                    onPropChanged('buffering');
                }
                break;
            }
            case 'aid':
            case 'sid':
            case 'vid': {
                props[args.name] = embeddedProp(args);
                break;
            }
            // In that case onPropChanged() is manually invoked as track-list contains all
            // the tracks but we have different event for each track type
            case 'track-list': {
                props.audioTracks = args.data.filter(function(x) { return x.type === 'audio'; })
                    .map(function(x, index) {
                        return {
                            id: 'EMBEDDED_' + x.id,
                            lang: x.lang === undefined ? 'Track' + (index + 1) : x.lang,
                            label: x.title === undefined || x.lang === undefined ? '' : x.title || x.lang,
                            origin: 'EMBEDDED',
                            embedded: true,
                            mode: x.id === props.aid ? 'showing' : 'disabled',
                        };
                    });
                onPropChanged('audioTracks');

                props.subtitlesTracks = args.data
                    .filter(function(x) { return x.type === 'sub'; })
                    .map(function(x, index) {
                        return {
                            id: 'EMBEDDED_' + x.id,
                            lang: x.lang === undefined ? 'Other Tracks' : x.lang,
                            label: x.title?.includes("External") ? x.lang : (x.title || x.lang || ''),
                            origin: x.title?.includes("External") ? x.title.replace('External', '') : 'EMBEDDED',
                            embedded: true,
                            forced: x.forced || false,
                            mode: x.id === props.sid ? 'showing' : 'disabled',
                        };
                    });
                onPropChanged('subtitlesTracks');
                break;
            }
            default: {
                props[args.name] = args.data;
                break;
            }
        }

        // Cap time update to update only when a second passes
        var current_time = args.name === 'time-pos' ? Math.floor(props['time-pos'] / 1000) : null;
        if((!current_time || last_time !== current_time)&& stremioProps[args.name]) {
            if(current_time) {
                last_time = current_time;
            }
            onPropChanged(stremioProps[args.name]);
        }
    });
    ipc.on('mpv-event-ended', function(args) {
        if (args.error) onError(args.error);
        else onEnded();
    });

    function getProp(propName) {
        if(stremioToMPVProps[propName]) return props[stremioToMPVProps[propName]];
        // eslint-disable-next-line no-console
        console.log('Unsupported prop requested', propName);
        return null;
    }
    function onError(error) {
        events.emit('error', error);
        if (error.critical) {
            command('unload');
        }
    }
    function onEnded() {
        events.emit('ended');
    }
    function onPropChanged(propName) {
        if (observedProps[propName]) {
            events.emit('propChanged', propName, getProp(propName));
        }
    }
    function observeProp(propName) {
        events.emit('propValue', propName, getProp(propName));
        observedProps[propName] = true;
    }
    function setProp(propName, propValue) {
        switch (propName) {
            case 'paused': {
                if (stream !== null) {
                    ipc.send('mpv-set-prop', ['pause', propValue]);
                }

                break;
            }
            case 'time': {
                if (stream !== null && propValue !== null && isFinite(propValue)) {
                    ipc.send('mpv-set-prop', ['time-pos', propValue/1000]);
                }

                break;
            }
            case 'playbackSpeed': {
                if (stream !== null && propValue !== null && isFinite(propValue)) {
                    ipc.send('mpv-set-prop', ['speed', propValue]);
                }
                break;
            }
            case 'volume': {
                if (stream !== null && propValue !== null && isFinite(propValue)) {
                    props.mute = false;
                    ipc.send('mpv-set-prop', ['mute', 'no']);
                    ipc.send('mpv-set-prop', ['volume', propValue]);
                    onPropChanged('muted');
                    onPropChanged('volume');
                }
                break;
            }
            case 'muted': {
                if (stream !== null) {
                    ipc.send('mpv-set-prop', ['mute', propValue ? 'yes' : 'no']);
                    props.mute = propValue;
                    onPropChanged('muted');
                }
                break;
            }
            case 'selectedAudioTrackId': {
                if (stream !== null) {
                    var actualId = propValue.slice('EMBEDDED_'.length);
                    ipc.send('mpv-set-prop', ['aid', actualId]);
                }
                break;
            }
            case 'selectedSubtitlesTrackId': {
                if (stream !== null) {
                    if(propValue) {
                        var actualId = propValue.slice('EMBEDDED_'.length);
                        ipc.send('mpv-set-prop', ['sid', actualId]);
                        events.emit('subtitlesTrackLoaded', propValue);
                    } else {
                        // turn off subs
                        ipc.send('mpv-set-prop', ['sid', 'no']);
                        props.sid = null;
                    }
                }
                onPropChanged('selectedSubtitlesTrackId');
                break;
            }
            case 'subtitlesSize': {
                ipc.send('mpv-set-prop', [stremioToMPVProps[propName], propValue * SUBS_SCALE_FACTOR]);
                break;
            }
            case 'subtitlesDelay': {
                ipc.send('mpv-set-prop', [stremioToMPVProps[propName], propValue]);
                break;
            }
            case 'subtitlesOffset': {
                ipc.send('mpv-set-prop', [stremioToMPVProps[propName], 100 - propValue]);
                break;
            }
            case 'subtitlesTextColor':
            case 'subtitlesBackgroundColor':
            case 'subtitlesOutlineColor':
            {
                // MPV accepts color in #AARRGGBB
                var argb = propValue.replace(/^#(\w{6})(\w{2})$/, '#$2$1');
                ipc.send('mpv-set-prop', [stremioToMPVProps[propName], argb]);
                break;
            }
            default: {
                // eslint-disable-next-line no-console
                console.log('Unhandled setProp for', propName);
            }
        }
    }
    function command(commandName, commandArgs) {
        switch (commandName) {
            case 'load': {
                command('unload');
                if (commandArgs && commandArgs.stream && typeof commandArgs.stream.url === 'string') {
                    waitForMPVVersion.then(function (mpvVersion) {
                        stream = commandArgs.stream;
                        onPropChanged('stream');

                        ipc.send('mpv-set-prop', ['no-sub-ass']);

                        // Hardware decoding
                        //var hwdecValue = commandArgs.hardwareDecoding ? 'auto-copy' : 'no';
                        //ipc.send('mpv-set-prop', ['hwdec', hwdecValue]);

                        // opengl-cb is an alias for the new name "libmpv", as shown in mpv's video/out/vo.c aliases
                        // opengl is an alias for the new name "gpu"
                        // When on Windows we use d3d for the rendering in separate window
                        var windowRenderer = navigator.platform === 'Win32' ? 'direct3d' : 'opengl';
                        var videoOutput = options.mpvSeparateWindow ? windowRenderer : 'opengl-cb';
                        var separateWindow = options.mpvSeparateWindow ? 'yes' : 'no';
                        ipc.send('mpv-set-prop', ['vo', window.chrome && window.chrome.webview ? 'gpu-next' : videoOutput]);
                        ipc.send('mpv-set-prop', ['osc', separateWindow]);
                        ipc.send('mpv-set-prop', ['input-default-bindings', window.chrome && window.chrome.webview ? 'yes' : separateWindow]);
                        ipc.send('mpv-set-prop', ['input-vo-keyboard', window.chrome && window.chrome.webview ? 'yes' : separateWindow]);

                        var startAt = Math.floor(parseInt(commandArgs.time, 10) / 1000) || 0;
                        var sendLoad = function(args) {
                            if (window.kaiNativeSimkl) {
                                ipc.send('simkl-load', [JSON.stringify({ args: args, media: commandArgs.simklMedia || {} })]);
                            } else {
                                ipc.send('mpv-command', args);
                            }
                        };
                        if (startAt !== 0) {
                            if (versionGTE(mpvVersion, '0.39')) {
                                sendLoad(['loadfile', stream.url, 'replace', '-1', 'start=+' + startAt]);
                            } else {
                                sendLoad(['loadfile', stream.url, 'replace', 'start=+' + startAt]);
                            }
                        } else {
                            sendLoad(['loadfile', stream.url]);
                        }
                        ipc.send('mpv-set-prop', ['pause', false]);
                        ipc.send('mpv-set-prop', ['speed', props.speed]);
                        if (props.aid) {
                            if (typeof props.aid === 'string' && props.aid.startsWith('EMBEDDED_')) {
                                ipc.send('mpv-set-prop', ['aid', props.aid.slice('EMBEDDED_'.length)]);
                            } else {
                                ipc.send('mpv-set-prop', ['aid', props.aid]);
                            }
                        }
                        ipc.send('mpv-set-prop', ['mute', 'no']);

                        onPropChanged('paused');
                        onPropChanged('time');
                        onPropChanged('duration');
                        onPropChanged('buffering');
                        onPropChanged('volume');
                        onPropChanged('muted');
                        onPropChanged('subtitlesTracks');
                        onPropChanged('selectedSubtitlesTrackId');
                    });
                } else {
                    onError(Object.assign({}, ERROR.UNSUPPORTED_STREAM, {
                        critical: true,
                        stream: commandArgs ? commandArgs.stream : null
                    }));
                }
                break;
            }
            case 'unload': {
                props = {
                    loaded: false,
                    pause: false,
                    mute: false,
                    speed: 1,
                    subtitlesTracks: [],
                    audioTracks: [],
                    buffering: false,
                    aid: null,
                    sid: null,
                };
                avgDuration = 0;
                ipc.send('mpv-command', ['stop']);
                onPropChanged('loaded');
                onPropChanged('stream');
                onPropChanged('paused');
                onPropChanged('time');
                onPropChanged('duration');
                onPropChanged('buffering');
                onPropChanged('volume');
                onPropChanged('muted');
                onPropChanged('subtitlesTracks');
                onPropChanged('selectedSubtitlesTrackId');
                setBackground(true);
                break;
            }
            case 'destroy': {
                command('unload');
                destroyed = true;
                events.removeAllListeners();
                break;
            }
        }
    }

    this.on = function (eventName, listener) {
        if (destroyed) {
            throw new Error('Video is destroyed');
        }

        events.on(eventName, listener);
    };
    this.dispatch = function (action) {
        if (destroyed) {
            throw new Error('Video is destroyed');
        }

        if (action) {
            action = deepFreeze(cloneDeep(action));
            switch (action.type) {
                case 'observeProp': {
                    observeProp(action.propName);
                    break;
                }
                case 'setProp': {
                    setProp(action.propName, action.propValue);
                    return;
                }
                case 'command': {
                    command(
                        action.commandName,
                        action.commandArgs
                    );
                    return;
                }
            }
        }
    };
}
ShellVideo.canPlayStream = function() {
    return Promise.resolve(true);
};

ShellVideo.manifest = {
    name: 'ShellVideo',
    external: false,
    props: Object.keys(stremioToMPVProps),
    commands: ['load', 'unload', 'destroy'],
    events: [
        'propValue',
        'propChanged',
        'ended',
        'error',
        'subtitlesTrackLoaded',
    ],
};

module.exports = ShellVideo;
