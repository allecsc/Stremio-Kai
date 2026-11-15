var EventEmitter = require('eventemitter3');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var Color = require('color');
var ERROR = require('../error');

var SSA_DESCRIPTORS_REGEX = /^\{(\\an[1-8])+\}/i;

function TitanVideo(options) {
    options = options || {};

    var size = 100;
    var offset = 0;
    var textColor = 'rgb(255, 255, 255)';
    var backgroundColor = 'rgba(0, 0, 0, 0)';
    var outlineColor = 'rgb(34, 34, 34)';
    var subtitlesOpacity = 1;

    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
        throw new Error('Container element required to be instance of HTMLElement');
    }

    var videoElement = document.createElement('video');
    videoElement.style.width = '100%';
    videoElement.style.height = '100%';
    videoElement.style.backgroundColor = 'black';
    videoElement.controls = false;
    videoElement.playsInline = true;
    videoElement.onerror = function() {
        onVideoError();
    };
    videoElement.onended = function() {
        onEnded();
    };
    videoElement.onpause = function() {
        onPropChanged('paused');
    };
    videoElement.onplay = function() {
        onPropChanged('paused');
    };
    videoElement.ontimeupdate = function() {
        onPropChanged('time');
    };
    videoElement.ondurationchange = function() {
        onPropChanged('duration');
    };
    videoElement.onwaiting = function() {
        onPropChanged('buffering');
    };
    videoElement.onseeking = function() {
        onPropChanged('time');
        onPropChanged('buffering');
    };
    videoElement.onseeked = function() {
        onPropChanged('time');
        onPropChanged('buffering');
    };
    videoElement.onstalled = function() {
        onPropChanged('buffering');
    };
    videoElement.onplaying = function() {
        onPropChanged('time');
        onPropChanged('buffering');
    };
    videoElement.oncanplay = function() {
        onPropChanged('buffering');
    };
    videoElement.canplaythrough = function() {
        onPropChanged('buffering');
    };
    videoElement.onloadedmetadata = function() {
        onPropChanged('loaded');
    };
    videoElement.onloadeddata = function() {
        onPropChanged('buffering');
    };
    videoElement.onvolumechange = function() {
        onPropChanged('volume');
        onPropChanged('muted');
    };
    videoElement.onratechange = function() {
        onPropChanged('playbackSpeed');
    };
    videoElement.textTracks.onchange = function() {
        onPropChanged('subtitlesTracks');
        onPropChanged('selectedSubtitlesTrackId');
    };
    containerElement.appendChild(videoElement);

    var subtitlesElement = document.createElement('div');
    subtitlesElement.style.position = 'absolute';
    subtitlesElement.style.right = '0';
    subtitlesElement.style.bottom = '0';
    subtitlesElement.style.left = '0';
    subtitlesElement.style.zIndex = '1';
    subtitlesElement.style.textAlign = 'center';
    containerElement.style.position = 'relative';
    containerElement.style.zIndex = '0';
    containerElement.appendChild(subtitlesElement);

    var events = new EventEmitter();
    var destroyed = false;
    var stream = null;
    var observedProps = {
        stream: false,
        loaded: false,
        paused: false,
        time: false,
        duration: false,
        buffering: false,
        subtitlesTracks: false,
        selectedSubtitlesTrackId: false,
        subtitlesOffset: false,
        subtitlesSize: false,
        subtitlesTextColor: false,
        subtitlesBackgroundColor: false,
        subtitlesOutlineColor: false,
        audioTracks: false,
        selectedAudioTrackId: false,
        volume: false,
        muted: false,
        playbackSpeed: false
    };

    var lastSub;
    var disabledSubs = false;

    async function refreshSubtitle() {
        if (lastSub) {
            renderSubtitle(lastSub.text, 'show');
        }
    }

    async function renderSubtitle(text, visibility) {
        if (disabledSubs) return;
        if (visibility === 'hide') {
            while (subtitlesElement.hasChildNodes()) {
                subtitlesElement.removeChild(subtitlesElement.lastChild);
            }
            lastSub = null;
            return;
        }

        lastSub = {
            text: text,
        };

        while (subtitlesElement.hasChildNodes()) {
            subtitlesElement.removeChild(subtitlesElement.lastChild);
        }

        subtitlesElement.style.bottom = offset + '%';
        subtitlesElement.style.opacity = subtitlesOpacity;

        var cueNode = document.createElement('span');
        cueNode.innerHTML = text;
        cueNode.style.display = 'inline-block';
        cueNode.style.padding = '0.2em';
        cueNode.style.fontSize = Math.floor(size / 25) + 'vmin';
        cueNode.style.color = textColor;
        cueNode.style.backgroundColor = backgroundColor;
        cueNode.style.textShadow = '1px 1px 0.1em ' + outlineColor;
        cueNode.style.whiteSpace = 'pre-wrap';

        subtitlesElement.appendChild(cueNode);
        subtitlesElement.appendChild(document.createElement('br'));

    }

    function renderCue(ev) {
        var cues = (ev.target || {}).activeCues;
        if (!cues.length) {
            renderSubtitle('', 'hide');
        } else {
            if (cues.length > 3) {
                // most probably SSA/ASS subs glitch
                ev.target.removeEventListener('cuechange', renderCue);
                renderSubtitle('', 'hide');
                return;
            }
            var text = '';
            for (var i in cues) {
                var cue = cues[i];
                if (cue.text) {
                    var cleanedText = cue.text.replace(SSA_DESCRIPTORS_REGEX, '');
                    text += (text ? '\n' : '') + cleanedText;
                }
            }
            renderSubtitle(text, 'show');
        }
    }

    function getProp(propName) {
        switch (propName) {
            case 'stream': {
                return stream;
            }
            case 'loaded': {
                if (stream === null) {
                    return null;
                }

                return videoElement.readyState >= videoElement.HAVE_METADATA;
            }
            case 'paused': {
                if (stream === null) {
                    return null;
                }

                return !!videoElement.paused;
            }
            case 'time': {
                if (stream === null || videoElement.currentTime === null || !isFinite(videoElement.currentTime)) {
                    return null;
                }

                return Math.floor(videoElement.currentTime * 1000);
            }
            case 'duration': {
                if (stream === null || videoElement.duration === null || !isFinite(videoElement.duration)) {
                    return null;
                }

                return Math.floor(videoElement.duration * 1000);
            }
            case 'buffering': {
                if (stream === null) {
                    return null;
                }

                return videoElement.readyState < videoElement.HAVE_FUTURE_DATA;
            }
            case 'subtitlesTracks': {
                if (stream === null) {
                    return [];
                }

                if (!videoElement.textTracks || !Array.from(videoElement.textTracks).length) {
                    return [];
                }

                return Array.from(videoElement.textTracks)
                    .filter(function(track) {
                        return track.kind === 'subtitles';
                    })
                    .map(function(track, index) {
                        return Object.freeze({
                            id: 'EMBEDDED_' + String(index),
                            lang: track.language,
                            label: track.label || null,
                            origin: 'EMBEDDED',
                            embedded: true
                        });
                    });
            }
            case 'selectedSubtitlesTrackId': {
                if (stream === null) {
                    return null;
                }

                if (!videoElement.textTracks || !Array.from(videoElement.textTracks).length) {
                    return null;
                }

                return Array.from(videoElement.textTracks)
                    .reduce(function(result, track, index) {
                        if (result === null && track.mode === 'hidden') {
                            return 'EMBEDDED_' + String(index);
                        }

                        return result;
                    }, null);
            }
            case 'subtitlesOffset': {
                if (destroyed) {
                    return null;
                }

                return offset;
            }
            case 'subtitlesSize': {
                if (destroyed) {
                    return null;
                }

                return size;
            }
            case 'subtitlesTextColor': {
                if (destroyed) {
                    return null;
                }

                return textColor;
            }
            case 'subtitlesBackgroundColor': {
                if (destroyed) {
                    return null;
                }

                return backgroundColor;
            }
            case 'subtitlesOutlineColor': {
                if (destroyed) {
                    return null;
                }

                return outlineColor;
            }
            case 'subtitlesOpacity': {
                if (destroyed) {
                    return null;
                }

                return subtitlesOpacity;
            }
            case 'audioTracks': {
                if (stream === null) {
                    return [];
                }

                if (!videoElement.audioTracks || !Array.from(videoElement.audioTracks).length) {
                    return [];
                }

                return Array.from(videoElement.audioTracks)
                    .map(function(track, index) {
                        return Object.freeze({
                            id: 'EMBEDDED_' + String(index),
                            lang: track.language,
                            label: track.label || null,
                            origin: 'EMBEDDED',
                            embedded: true
                        });
                    });
            }
            case 'selectedAudioTrackId': {

                if (stream === null) {
                    return null;
                }

                if (!videoElement.audioTracks || !Array.from(videoElement.audioTracks).length) {
                    return null;
                }

                return Array.from(videoElement.audioTracks)
                    .reduce(function(result, track, index) {
                        if (result === null && track.enabled) {
                            return 'EMBEDDED_' + String(index);
                        }

                        return result;
                    }, null);
            }
            case 'volume': {
                if (destroyed || videoElement.volume === null || !isFinite(videoElement.volume)) {
                    return null;
                }

                return Math.floor(videoElement.volume * 100);
            }
            case 'muted': {
                if (destroyed) {
                    return null;
                }

                return !!videoElement.muted;
            }
            case 'playbackSpeed': {
                if (destroyed || videoElement.playbackRate === null || !isFinite(videoElement.playbackRate)) {
                    return null;
                }

                return videoElement.playbackRate;
            }
            default: {
                return null;
            }
        }
    }
    function onVideoError() {
        if (destroyed) {
            return;
        }

        var error;
        switch (videoElement.error.code) {
            case 1: {
                error = ERROR.HTML_VIDEO.MEDIA_ERR_ABORTED;
                break;
            }
            case 2: {
                error = ERROR.HTML_VIDEO.MEDIA_ERR_NETWORK;
                break;
            }
            case 3: {
                error = ERROR.HTML_VIDEO.MEDIA_ERR_DECODE;
                break;
            }
            case 4: {
                error = ERROR.HTML_VIDEO.MEDIA_ERR_SRC_NOT_SUPPORTED;
                break;
            }
            default: {
                error = ERROR.UNKNOWN_ERROR;
            }
        }
        onError(Object.assign({}, error, {
            critical: true,
            error: videoElement.error
        }));
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
        if (observedProps.hasOwnProperty(propName)) {
            events.emit('propValue', propName, getProp(propName));
            observedProps[propName] = true;
        }
    }
    function setProp(propName, propValue) {
        switch (propName) {
            case 'paused': {
                if (stream !== null) {
                    propValue ? videoElement.pause() : videoElement.play();
                    onPropChanged('paused');
                }

                break;
            }
            case 'time': {
                if (stream !== null && propValue !== null && isFinite(propValue)) {
                    renderSubtitle('', 'hide');
                    videoElement.currentTime = parseInt(propValue, 10) / 1000;
                    onPropChanged('time');
                }

                break;
            }
            case 'selectedSubtitlesTrackId': {
                if (stream !== null) {
                    Array.from(videoElement.textTracks)
                        .forEach(function(track, index) {
                            if (track.mode === 'hidden') {
                                track.removeEventListener('cuechange', renderCue);
                            }
                            track.mode = 'EMBEDDED_' + String(index) === propValue ? 'hidden' : 'disabled';
                            if (track.mode === 'hidden') {
                                track.addEventListener('cuechange', renderCue);
                            }
                        });
                    var selectedSubtitlesTrack = getProp('subtitlesTracks')
                        .find(function(track) {
                            return track.id === propValue;
                        });

                    renderSubtitle('', 'hide');

                    if (selectedSubtitlesTrack) {
                        onPropChanged('selectedSubtitlesTrackId');
                        events.emit('subtitlesTrackLoaded', selectedSubtitlesTrack);
                    }
                }

                break;
            }
            case 'subtitlesOffset': {
                if (propValue !== null && isFinite(propValue)) {
                    offset = Math.max(0, Math.min(100, parseInt(propValue, 10)));
                    refreshSubtitle();
                    onPropChanged('subtitlesOffset');
                }

                break;
            }
            case 'subtitlesSize': {
                if (propValue !== null && isFinite(propValue)) {
                    size = Math.max(0, parseInt(propValue, 10));
                    refreshSubtitle();
                    onPropChanged('subtitlesSize');
                }

                break;
            }
            case 'subtitlesTextColor': {
                if (typeof propValue === 'string') {
                    try {
                        textColor = Color(propValue).rgb().string();
                    } catch (error) {
                        // eslint-disable-next-line no-console
                        console.error('Tizen player with HTML Subtitles', error);
                    }

                    refreshSubtitle();
                    onPropChanged('subtitlesTextColor');
                }

                break;
            }
            case 'subtitlesBackgroundColor': {
                if (typeof propValue === 'string') {
                    try {
                        backgroundColor = Color(propValue).rgb().string();
                    } catch (error) {
                        // eslint-disable-next-line no-console
                        console.error('Tizen player with HTML Subtitles', error);
                    }

                    refreshSubtitle();

                    onPropChanged('subtitlesBackgroundColor');
                }

                break;
            }
            case 'subtitlesOutlineColor': {
                if (typeof propValue === 'string') {
                    try {
                        outlineColor = Color(propValue).rgb().string();
                    } catch (error) {
                        // eslint-disable-next-line no-console
                        console.error('Tizen player with HTML Subtitles', error);
                    }

                    refreshSubtitle();

                    onPropChanged('subtitlesOutlineColor');
                }

                break;
            }
            case 'subtitlesOpacity': {
                if (typeof propValue === 'number') {
                    try {
                        subtitlesOpacity = Math.min(Math.max(propValue / 100, 0), 1);
                    } catch (error) {
                        // eslint-disable-next-line no-console
                        console.error('Tizen player with HTML Subtitles', error);
                    }

                    refreshSubtitle();

                    onPropChanged('subtitlesOpacity');
                }

                break;
            }
            case 'selectedAudioTrackId': {
                if (stream !== null) {
                    for (var index = 0; index < videoElement.audioTracks.length; index++) {
                        videoElement.audioTracks[index].enabled = !!('EMBEDDED_' + String(index) === propValue);
                    }
                }

                var selectedAudioTrack = getProp('audioTracks')
                    .find(function(track) {
                        return track.id === propValue;
                    });

                if (selectedAudioTrack) {
                    onPropChanged('selectedAudioTrackId');
                    events.emit('audioTrackLoaded', selectedAudioTrack);
                }

                break;
            }
            case 'volume': {
                if (propValue !== null && isFinite(propValue)) {
                    videoElement.muted = false;
                    videoElement.volume = Math.max(0, Math.min(100, parseInt(propValue, 10))) / 100;
                    onPropChanged('muted');
                    onPropChanged('volume');
                }

                break;
            }
            case 'muted': {
                videoElement.muted = !!propValue;
                onPropChanged('muted');
                break;
            }
            case 'playbackSpeed': {
                if (propValue !== null && isFinite(propValue)) {
                    videoElement.playbackRate = parseFloat(propValue);
                    onPropChanged('playbackSpeed');
                }

                break;
            }
        }
    }
    function command(commandName, commandArgs) {
        switch (commandName) {
            case 'load': {
                command('unload');
                if (commandArgs && commandArgs.stream && typeof commandArgs.stream.url === 'string') {
                    stream = commandArgs.stream;
                    onPropChanged('stream');
                    onPropChanged('loaded');
                    videoElement.autoplay = typeof commandArgs.autoplay === 'boolean' ? commandArgs.autoplay : true;
                    videoElement.currentTime = commandArgs.time !== null && isFinite(commandArgs.time) ? parseInt(commandArgs.time, 10) / 1000 : 0;
                    onPropChanged('paused');
                    onPropChanged('time');
                    onPropChanged('duration');
                    onPropChanged('buffering');
                    if (videoElement.textTracks) {
                        videoElement.textTracks.onaddtrack = function() {
                            videoElement.textTracks.onaddtrack = null;
                            setTimeout(function() {
                                onPropChanged('subtitlesTracks');
                                onPropChanged('selectedSubtitlesTrackId');
                            });
                        };
                    }
                    if (videoElement.audioTracks) {
                        videoElement.audioTracks.onaddtrack = function() {
                            videoElement.audioTracks.onaddtrack = null;
                            setTimeout(function() {
                                onPropChanged('audioTracks');
                                onPropChanged('selectedAudioTrackId');
                            });
                        };
                    }
                    videoElement.src = stream.url;
                } else {
                    onError(Object.assign({}, ERROR.UNSUPPORTED_STREAM, {
                        critical: true,
                        stream: commandArgs ? commandArgs.stream : null
                    }));
                }
                break;
            }
            case 'unload': {
                stream = null;
                Array.from(videoElement.textTracks).forEach(function(track) {
                    track.oncuechange = null;
                });
                videoElement.removeAttribute('src');
                videoElement.load();
                videoElement.currentTime = 0;
                onPropChanged('stream');
                onPropChanged('loaded');
                onPropChanged('paused');
                onPropChanged('time');
                onPropChanged('duration');
                onPropChanged('buffering');
                onPropChanged('subtitlesTracks');
                onPropChanged('selectedSubtitlesTrackId');
                onPropChanged('audioTracks');
                onPropChanged('selectedAudioTrackId');
                break;
            }
            case 'destroy': {
                command('unload');
                destroyed = true;
                onPropChanged('subtitlesOffset');
                onPropChanged('subtitlesSize');
                onPropChanged('subtitlesTextColor');
                onPropChanged('subtitlesBackgroundColor');
                onPropChanged('subtitlesOutlineColor');
                onPropChanged('volume');
                onPropChanged('muted');
                onPropChanged('playbackSpeed');
                events.removeAllListeners();
                videoElement.onerror = null;
                videoElement.onended = null;
                videoElement.onpause = null;
                videoElement.onplay = null;
                videoElement.ontimeupdate = null;
                videoElement.ondurationchange = null;
                videoElement.onwaiting = null;
                videoElement.onseeking = null;
                videoElement.onseeked = null;
                videoElement.onstalled = null;
                videoElement.onplaying = null;
                videoElement.oncanplay = null;
                videoElement.canplaythrough = null;
                videoElement.onloadeddata = null;
                videoElement.onvolumechange = null;
                videoElement.onratechange = null;
                videoElement.textTracks.onchange = null;
                containerElement.removeChild(videoElement);
                break;
            }
        }
    }

    this.on = function(eventName, listener) {
        if (destroyed) {
            throw new Error('Video is destroyed');
        }

        events.on(eventName, listener);
    };
    this.dispatch = function(action) {
        if (destroyed) {
            throw new Error('Video is destroyed');
        }

        if (action) {
            action = deepFreeze(cloneDeep(action));
            switch (action.type) {
                case 'observeProp': {
                    observeProp(action.propName);
                    return;
                }
                case 'setProp': {
                    setProp(action.propName, action.propValue);
                    return;
                }
                case 'command': {
                    command(action.commandName, action.commandArgs);
                    return;
                }
            }
        }

        throw new Error('Invalid action dispatched: ' + JSON.stringify(action));
    };
}

TitanVideo.canPlayStream = function(stream) {
    if (!stream) {
        return Promise.resolve(false);
    }

    return Promise.resolve(true);
};

TitanVideo.manifest = {
    name: 'TitanVideo',
    external: false,
    props: ['stream', 'loaded', 'paused', 'time', 'duration', 'buffering', 'audioTracks', 'selectedAudioTrackId', 'subtitlesTracks', 'selectedSubtitlesTrackId', 'subtitlesOffset', 'subtitlesSize', 'subtitlesTextColor', 'subtitlesBackgroundColor', 'subtitlesOutlineColor', 'subtitlesOpacity', 'volume', 'muted', 'playbackSpeed'],
    commands: ['load', 'unload', 'destroy'],
    events: ['propValue', 'propChanged', 'ended', 'error', 'subtitlesTrackLoaded', 'audioTrackLoaded']
};

module.exports = TitanVideo;
