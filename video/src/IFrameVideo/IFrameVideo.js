var EventEmitter = require('eventemitter3');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var ERROR = require('../error');

function IFrameVideo(options) {
    options = options || {};

    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
        throw new Error('Container element required to be instance of HTMLElement');
    }

    var iframeElement = document.createElement('iframe');
    iframeElement.style.width = '100%';
    iframeElement.style.height = '100%';
    iframeElement.style.border = 0;
    iframeElement.style.backgroundColor = 'black';
    iframeElement.allowFullscreen = false;
    iframeElement.allow = 'autoplay';
    containerElement.appendChild(iframeElement);

    var events = new EventEmitter();
    var destroyed = false;
    var observedProps = {
        stream: false,
        loaded: false,
        paused: false,
        time: false,
        duration: false,
        buffering: false,
        buffered: false,
        volume: false,
        muted: false,
        playbackSpeed: false
    };

    function onMessage(event) {
        if (event.source !== iframeElement.contentWindow) {
            return;
        }

        var data = event.data || event.message;
        if (!data || typeof data.event !== 'string') {
            return;
        }

        var eventName = data.event;
        var args = Array.isArray(data.args) ? data.args : [];
        events.emit.apply(events, [eventName].concat(args));
    }
    function sendMessage(action) {
        iframeElement.contentWindow.postMessage(action, '*');
    }
    function onError(error) {
        events.emit('error', error);
        if (error.critical) {
            command('unload');
        }
    }
    function onPropChanged(propName, propValue) {
        if (observedProps[propName]) {
            events.emit('propChanged', propName, propValue);
        }
    }
    function observeProp(propName) {
        if (observedProps.hasOwnProperty(propName)) {
            observedProps[propName] = true;
        }
    }
    function command(commandName, commandArgs) {
        switch (commandName) {
            case 'load': {
                command('unload');
                if (commandArgs && commandArgs.stream && typeof commandArgs.stream.playerFrameUrl === 'string') {
                    window.addEventListener('message', onMessage, false);
                    iframeElement.onload = function() {
                        sendMessage({
                            type: 'command',
                            commandName: commandName,
                            commandArgs: commandArgs
                        });
                    };
                    iframeElement.src = commandArgs.stream.playerFrameUrl;
                } else {
                    onError(Object.assign({}, ERROR.UNSUPPORTED_STREAM, {
                        critical: true,
                        stream: commandArgs ? commandArgs.stream : null
                    }));
                }

                return true;
            }
            case 'unload': {
                window.removeEventListener('message', onMessage);
                iframeElement.onload = null;
                iframeElement.removeAttribute('src');
                onPropChanged('stream', null);
                onPropChanged('loaded', null);
                onPropChanged('paused', null);
                onPropChanged('time', null);
                onPropChanged('duration', null);
                onPropChanged('buffering', null);
                onPropChanged('buffered', null);
                onPropChanged('volume', null);
                onPropChanged('muted', null);
                onPropChanged('playbackSpeed', null);
                return true;
            }
            case 'destroy': {
                command('unload');
                destroyed = true;
                events.removeAllListeners();
                containerElement.removeChild(iframeElement);
                return true;
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
                    sendMessage(action);
                    return;
                }
                case 'setProp': {
                    sendMessage(action);
                    return;
                }
                case 'command': {
                    if (!command(action.commandName, action.commandArgs)) {
                        sendMessage(action);
                    }

                    return;
                }
            }
        }

        throw new Error('Invalid action dispatched: ' + JSON.stringify(action));
    };
}

IFrameVideo.canPlayStream = function(stream) {
    return Promise.resolve(stream && typeof stream.playerFrameUrl === 'string');
};

IFrameVideo.manifest = {
    name: 'IFrameVideo',
    external: true,
    props: ['stream', 'loaded', 'paused', 'time', 'duration', 'buffering', 'buffered', 'audioTracks', 'selectedAudioTrackId', 'subtitlesTracks', 'selectedSubtitlesTrackId', 'subtitlesOffset', 'subtitlesSize', 'subtitlesTextColor', 'subtitlesBackgroundColor', 'subtitlesOutlineColor', 'volume', 'muted', 'playbackSpeed', 'extraSubtitlesTracks', 'selectedExtraSubtitlesTrackId', 'extraSubtitlesDelay', 'extraSubtitlesSize', 'extraSubtitlesOffset', 'extraSubtitlesTextColor', 'extraSubtitlesBackgroundColor', 'extraSubtitlesOutlineColor'],
    commands: ['load', 'unload', 'destroy', 'addExtraSubtitlesTracks'],
    events: ['propValue', 'propChanged', 'ended', 'error', 'subtitlesTrackLoaded', 'audioTrackLoaded', 'extraSubtitlesTrackLoaded', 'implementationChanged']
};

module.exports = IFrameVideo;
