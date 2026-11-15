var EventEmitter = require('eventemitter3');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var ERROR = require('../error');

function YouTubeVideo(options) {
    options = options || {};

    var timeChangedTimeout = options.timeChangedTimeout !== null && isFinite(options.timeChangedTimeout) ? parseInt(options.timeChangedTimeout, 10) : 100;

    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
        throw new Error('Container element required to be instance of HTMLElement');
    }

    var apiScriptElement = document.createElement('script');
    apiScriptElement.type = 'text/javascript';
    apiScriptElement.src = 'https://www.youtube.com/iframe_api';
    apiScriptElement.onload = onAPILoaded;
    apiScriptElement.onerror = onAPIError;
    containerElement.appendChild(apiScriptElement);
    var videoContainerElement = document.createElement('div');
    videoContainerElement.style.width = '100%';
    videoContainerElement.style.height = '100%';
    videoContainerElement.style.backgroundColor = 'black';
    containerElement.appendChild(videoContainerElement);
    var timeChangedIntervalId = window.setInterval(function() {
        onPropChanged('time');
        onPropChanged('volume');
        onPropChanged('muted');
        onPropChanged('playbackSpeed');
    }, timeChangedTimeout);

    var video = null;
    var ready = false;
    var pendingLoadArgs = null;
    var events = new EventEmitter();
    var destroyed = false;
    var stream = null;
    var selectedSubtitlesTrackId = null;
    var observedProps = {
        stream: false,
        loaded: false,
        paused: false,
        time: false,
        duration: false,
        buffering: false,
        volume: false,
        muted: false,
        playbackSpeed: false,
        subtitlesTracks: false,
        selectedSubtitlesTrackId: false
    };

    function onAPIError() {
        if (destroyed) {
            return;
        }

        onError(Object.assign({}, ERROR.YOUTUBE_VIDEO.API_LOAD_FAILED, {
            critical: true
        }));
    }
    function onAPILoaded() {
        if (destroyed) {
            return;
        }

        if (!YT || typeof YT.ready !== 'function') {
            onAPIError();
            return;
        }

        YT.ready(function() {
            if (destroyed) {
                return;
            }

            if (!YT || !YT.PlayerState || typeof YT.Player !== 'function') {
                onAPIError();
                return;
            }

            video = new YT.Player(videoContainerElement, {
                width: '100%',
                height: '100%',
                playerVars: {
                    autoplay: 1,
                    cc_load_policy: 3,
                    controls: 0,
                    disablekb: 1,
                    enablejsapi: 1,
                    fs: 0,
                    iv_load_policy: 3,
                    loop: 0,
                    modestbranding: 1,
                    playsinline: 1,
                    rel: 0
                },
                events: {
                    onError: onVideoError,
                    onReady: onVideoReady,
                    onApiChange: onVideoAPIChange,
                    onStateChange: onVideoStateChange
                }
            });
        });
    }
    function onVideoError(videoError) {
        if (destroyed) {
            return;
        }

        var error;
        switch (videoError.data) {
            case 2: {
                error = ERROR.YOUTUBE_VIDEO.INVALID_PARAMETER;
                break;
            }
            case 5: {
                error = ERROR.YOUTUBE_VIDEO.HTML5_VIDEO;
                break;
            }
            case 100: {
                error = ERROR.YOUTUBE_VIDEO.VIDEO_NOT_FOUND;
                break;
            }
            case 101:
            case 150: {
                error = ERROR.YOUTUBE_VIDEO.VIDEO_NOT_EMBEDDABLE;
                break;
            }
            default: {
                error = ERROR.UNKNOWN_ERROR;
            }
        }
        onError(Object.assign({}, error, {
            critical: true,
            error: videoError
        }));
    }
    function onVideoReady() {
        if (destroyed) {
            return;
        }

        ready = true;
        if (pendingLoadArgs !== null) {
            command('load', pendingLoadArgs);
            pendingLoadArgs = null;
        }
    }
    function onVideoAPIChange() {
        if (destroyed) {
            return;
        }

        if (typeof video.loadModule === 'function') {
            video.loadModule('captions');
        }
        if (typeof video.setOption === 'function') {
            video.setOption('captions', 'track', {});
        }
        onPropChanged('paused');
        onPropChanged('time');
        onPropChanged('duration');
        onPropChanged('buffering');
        onPropChanged('volume');
        onPropChanged('muted');
        onPropChanged('playbackSpeed');
        onPropChanged('subtitlesTracks');
        onPropChanged('selectedSubtitlesTrackId');
    }
    function onVideoStateChange(state) {
        onPropChanged('buffering');
        switch (state.data) {
            case YT.PlayerState.ENDED: {
                onEnded();
                break;
            }
            case YT.PlayerState.CUED:
            case YT.PlayerState.UNSTARTED:
            case YT.PlayerState.PAUSED:
            case YT.PlayerState.PLAYING: {
                onPropChanged('paused');
                onPropChanged('time');
                onPropChanged('duration');
                break;
            }
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

                return true;
            }
            case 'paused': {
                if (stream === null || typeof video.getPlayerState !== 'function') {
                    return null;
                }

                return video.getPlayerState() !== YT.PlayerState.PLAYING;
            }
            case 'time': {
                if (stream === null || typeof video.getCurrentTime !== 'function' || video.getCurrentTime() === null || !isFinite(video.getCurrentTime())) {
                    return null;
                }

                return Math.floor(video.getCurrentTime() * 1000);
            }
            case 'duration': {
                if (stream === null || typeof video.getDuration !== 'function' || video.getDuration() === null || !isFinite(video.getDuration())) {
                    return null;
                }

                return Math.floor(video.getDuration() * 1000);
            }
            case 'buffering': {
                if (stream === null || typeof video.getPlayerState !== 'function') {
                    return null;
                }

                return video.getPlayerState() === YT.PlayerState.BUFFERING;
            }
            case 'volume': {
                if (stream === null || typeof video.getVolume !== 'function' || video.getVolume() === null || !isFinite(video.getVolume())) {
                    return null;
                }

                return video.getVolume();
            }
            case 'muted': {
                if (stream === null || typeof video.isMuted !== 'function') {
                    return null;
                }

                return video.isMuted();
            }
            case 'playbackSpeed': {
                if (stream === null || typeof video.getPlaybackRate !== 'function' || video.getPlaybackRate() === null || !isFinite(video.getPlaybackRate())) {
                    return null;
                }

                return video.getPlaybackRate();
            }
            case 'subtitlesTracks': {
                if (stream === null || typeof video.getOption !== 'function') {
                    return [];
                }

                return (video.getOption('captions', 'tracklist') || [])
                    .filter(function(track) {
                        return track && typeof track.languageCode === 'string';
                    })
                    .map(function(track, index) {
                        return Object.freeze({
                            id: 'EMBEDDED_' + String(index),
                            lang: track.languageCode,
                            label: typeof track.displayName === 'string' ? track.displayName : track.languageCode,
                            origin: 'EMBEDDED',
                            embedded: true
                        });
                    });
            }
            case 'selectedSubtitlesTrackId': {
                if (stream === null) {
                    return null;
                }

                return selectedSubtitlesTrackId;
            }
            default: {
                return null;
            }
        }
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
                    propValue ?
                        typeof video.pauseVideo === 'function' && video.pauseVideo()
                        :
                        typeof video.playVideo === 'function' && video.playVideo();
                }

                break;
            }
            case 'time': {
                if (stream !== null && typeof video.seekTo === 'function' && propValue !== null && isFinite(propValue)) {
                    video.seekTo(parseInt(propValue, 10) / 1000);
                }

                break;
            }
            case 'volume': {
                if (stream !== null && propValue !== null && isFinite(propValue)) {
                    if (typeof video.unMute === 'function') {
                        video.unMute();
                    }
                    if (typeof video.setVolume === 'function') {
                        video.setVolume(Math.max(0, Math.min(100, parseInt(propValue, 10))));
                    }
                    onPropChanged('muted');
                    onPropChanged('volume');
                }

                break;
            }
            case 'muted': {
                if (stream !== null) {
                    propValue ?
                        typeof video.mute === 'function' && video.mute()
                        :
                        typeof video.unMute === 'function' && video.unMute();
                    onPropChanged('muted');
                }

                break;
            }
            case 'playbackSpeed': {
                if (stream !== null && typeof video.setPlaybackRate === 'function' && isFinite(propValue)) {
                    video.setPlaybackRate(propValue);
                    onPropChanged('playbackSpeed');
                }

                break;
            }
            case 'selectedSubtitlesTrackId': {
                if (stream !== null) {
                    selectedSubtitlesTrackId = null;
                    var selecterdTrack = getProp('subtitlesTracks')
                        .find(function(track) {
                            return track.id === propValue;
                        });
                    if (typeof video.setOption === 'function') {
                        if (selecterdTrack) {
                            selectedSubtitlesTrackId = selecterdTrack.id;
                            video.setOption('captions', 'track', {
                                languageCode: selecterdTrack.lang
                            });
                            events.emit('subtitlesTrackLoaded', selecterdTrack);
                        } else {
                            video.setOption('captions', 'track', {});
                        }
                    }
                    onPropChanged('selectedSubtitlesTrackId');
                }

                break;
            }
        }
    }
    function command(commandName, commandArgs) {
        switch (commandName) {
            case 'load': {
                command('unload');
                if (commandArgs && commandArgs.stream && typeof commandArgs.stream.ytId === 'string') {
                    if (ready) {
                        stream = commandArgs.stream;
                        onPropChanged('stream');
                        onPropChanged('loaded');
                        var autoplay = typeof commandArgs.autoplay === 'boolean' ? commandArgs.autoplay : true;
                        var time = commandArgs.time !== null && isFinite(commandArgs.time) ? parseInt(commandArgs.time, 10) / 1000 : 0;
                        if (autoplay && typeof video.loadVideoById === 'function') {
                            video.loadVideoById({
                                videoId: commandArgs.stream.ytId,
                                startSeconds: time
                            });
                        } else if (typeof video.cueVideoById === 'function') {
                            video.cueVideoById({
                                videoId: commandArgs.stream.ytId,
                                startSeconds: time
                            });
                        }
                        onPropChanged('paused');
                        onPropChanged('time');
                        onPropChanged('duration');
                        onPropChanged('buffering');
                        onPropChanged('volume');
                        onPropChanged('muted');
                        onPropChanged('playbackSpeed');
                        onPropChanged('subtitlesTracks');
                        onPropChanged('selectedSubtitlesTrackId');
                    } else {
                        pendingLoadArgs = commandArgs;
                    }
                } else {
                    onError(Object.assign({}, ERROR.UNSUPPORTED_STREAM, {
                        critical: true,
                        stream: commandArgs ? commandArgs.stream : null
                    }));
                }

                break;
            }
            case 'unload': {
                pendingLoadArgs = null;
                stream = null;
                onPropChanged('stream');
                onPropChanged('loaded');
                selectedSubtitlesTrackId = null;
                if (ready && typeof video.stopVideo === 'function') {
                    video.stopVideo();
                }
                onPropChanged('paused');
                onPropChanged('time');
                onPropChanged('duration');
                onPropChanged('buffering');
                onPropChanged('volume');
                onPropChanged('muted');
                onPropChanged('playbackSpeed');
                onPropChanged('subtitlesTracks');
                onPropChanged('selectedSubtitlesTrackId');
                break;
            }
            case 'destroy': {
                command('unload');
                destroyed = true;
                events.removeAllListeners();
                clearInterval(timeChangedIntervalId);
                if (ready && typeof video.destroy === 'function') {
                    video.destroy();
                }
                containerElement.removeChild(apiScriptElement);
                containerElement.removeChild(videoContainerElement);
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

YouTubeVideo.canPlayStream = function(stream) {
    return Promise.resolve(stream && typeof stream.ytId === 'string');
};

YouTubeVideo.manifest = {
    name: 'YouTubeVideo',
    external: false,
    props: ['stream', 'loaded', 'paused', 'time', 'duration', 'buffering', 'volume', 'muted', 'playbackSpeed', 'subtitlesTracks', 'selectedSubtitlesTrackId'],
    commands: ['load', 'unload', 'destroy'],
    events: ['propValue', 'propChanged', 'ended', 'error', 'subtitlesTrackLoaded']
};

module.exports = YouTubeVideo;
