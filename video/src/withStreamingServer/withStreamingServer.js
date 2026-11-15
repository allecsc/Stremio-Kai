var EventEmitter = require('eventemitter3');
var url = require('url');
var hat = require('hat');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var mediaCapabilities = require('../mediaCapabilities');
var convertStream = require('./convertStream');
var fetchVideoParams = require('./fetchVideoParams');
var isPlayerLoaded = require('./isPlayerLoaded');
var supportsTranscoding = require('../supportsTranscoding');
var ERROR = require('../error');

function withStreamingServer(Video) {
    function VideoWithStreamingServer(options) {
        options = options || {};

        var video = new Video(options);
        video.on('error', onVideoError);
        video.on('propValue', onVideoPropEvent.bind(null, 'propValue'));
        video.on('propChanged', onVideoPropEvent.bind(null, 'propChanged'));
        Video.manifest.events
            .filter(function(eventName) {
                return !['error', 'propValue', 'propChanged'].includes(eventName);
            })
            .forEach(function(eventName) {
                video.on(eventName, onOtherVideoEvent(eventName));
            });

        var self = this;
        var loadArgs = null;
        var loaded = false;
        var actionsQueue = [];
        var videoParams = null;
        var events = new EventEmitter();
        var destroyed = false;
        var observedProps = {
            stream: false,
            videoParams: false
        };

        function flushActionsQueue() {
            while (actionsQueue.length > 0) {
                var action = actionsQueue.shift();
                self.dispatch.call(self, action);
            }
        }
        function onVideoError(error) {
            events.emit('error', error);
            if (error.critical) {
                command('unload');
            }
        }
        function onVideoPropEvent(eventName, propName, propValue) {
            events.emit(eventName, propName, getProp(propName, propValue));
        }
        function onOtherVideoEvent(eventName) {
            return function() {
                events.emit.apply(events, [eventName].concat(Array.from(arguments)));
            };
        }
        function onPropChanged(propName) {
            if (observedProps[propName]) {
                events.emit('propChanged', propName, getProp(propName, null));
            }
        }
        function onError(error) {
            events.emit('error', error);
            if (error.critical) {
                command('unload');
                video.dispatch({ type: 'command', commandName: 'unload' });
            }
        }
        function getProp(propName, videoPropValue) {
            switch (propName) {
                case 'stream': {
                    return loadArgs !== null ? loadArgs.stream : null;
                }
                case 'videoParams': {
                    return videoParams;
                }
                default: {
                    return videoPropValue;
                }
            }
        }
        function observeProp(propName) {
            switch (propName) {
                case 'stream':
                case 'videoParams': {
                    events.emit('propValue', propName, getProp(propName, null));
                    observedProps[propName] = true;
                    return true;
                }
                default: {
                    return false;
                }
            }
        }
        function command(commandName, commandArgs) {
            switch (commandName) {
                case 'load': {
                    if (commandArgs && commandArgs.stream && typeof commandArgs.streamingServerURL === 'string') {
                        command('unload');
                        video.dispatch({ type: 'command', commandName: 'unload' });
                        loadArgs = commandArgs;
                        onPropChanged('stream');
                        convertStream(commandArgs.streamingServerURL, commandArgs.stream, commandArgs.seriesInfo, commandArgs.streamingServerSettings)
                            .then(function(result) {
                                var mediaURL = result.url;
                                var infoHash = result.infoHash;
                                var fileIdx = result.fileIdx;
                                var formats = Array.isArray(commandArgs.formats) ?
                                    commandArgs.formats
                                    :
                                    mediaCapabilities.formats;
                                var videoCodecs = Array.isArray(commandArgs.videoCodecs) ?
                                    commandArgs.videoCodecs
                                    :
                                    mediaCapabilities.videoCodecs;
                                var audioCodecs = Array.isArray(commandArgs.audioCodecs) ?
                                    commandArgs.audioCodecs
                                    :
                                    mediaCapabilities.audioCodecs;
                                var maxAudioChannels = commandArgs.maxAudioChannels !== null && isFinite(commandArgs.maxAudioChannels) ?
                                    commandArgs.maxAudioChannels
                                    :
                                    mediaCapabilities.maxAudioChannels;
                                var canPlayStreamOptions = Object.assign({}, commandArgs, {
                                    formats: formats,
                                    videoCodecs: videoCodecs,
                                    audioCodecs: audioCodecs,
                                    maxAudioChannels: maxAudioChannels
                                });
                                return (commandArgs.forceTranscoding ? Promise.resolve(false) : VideoWithStreamingServer.canPlayStream({ url: mediaURL }, canPlayStreamOptions))
                                    .catch(function(error) {
                                        console.warn('Media probe error', error);
                                        return false;
                                    })
                                    .then(function(canPlay) {
                                        if (canPlay) {
                                            return {
                                                mediaURL: mediaURL,
                                                infoHash: infoHash,
                                                fileIdx: fileIdx,
                                                stream: {
                                                    url: mediaURL
                                                }
                                            };
                                        }

                                        var id = hat();
                                        var queryParams = new URLSearchParams([['mediaURL', mediaURL]]);
                                        if (commandArgs.forceTranscoding) {
                                            queryParams.set('forceTranscoding', '1');
                                        }

                                        videoCodecs.forEach(function(videoCodec) {
                                            queryParams.append('videoCodecs', videoCodec);
                                        });

                                        audioCodecs.forEach(function(audioCodec) {
                                            queryParams.append('audioCodecs', audioCodec);
                                        });

                                        queryParams.set('maxAudioChannels', maxAudioChannels);

                                        return {
                                            mediaURL: mediaURL,
                                            infoHash: infoHash,
                                            fileIdx: fileIdx,
                                            stream: {
                                                url: url.resolve(commandArgs.streamingServerURL, '/hlsv2/' + id + '/master.m3u8?' + queryParams.toString()),
                                                subtitles: Array.isArray(commandArgs.stream.subtitles) ?
                                                    commandArgs.stream.subtitles.map(function(track) {
                                                        return Object.assign({}, track, {
                                                            url: typeof track.url === 'string' ?
                                                                url.resolve(commandArgs.streamingServerURL, '/subtitles.vtt?' + new URLSearchParams([['from', track.url]]).toString())
                                                                :
                                                                track.url
                                                        });
                                                    })
                                                    :
                                                    [],
                                                behaviorHints: {
                                                    headers: {
                                                        'content-type': 'application/vnd.apple.mpegurl'
                                                    }
                                                }
                                            }
                                        };
                                    });
                            })
                            .then(function(result) {
                                if (commandArgs !== loadArgs) {
                                    return;
                                }

                                video.dispatch({
                                    type: 'command',
                                    commandName: 'load',
                                    commandArgs: Object.assign({}, commandArgs, {
                                        stream: result.stream
                                    })
                                });
                                loaded = true;
                                flushActionsQueue();

                                isPlayerLoaded(video, Video.manifest.props)
                                    .then(function() {
                                        return fetchVideoParams(commandArgs.streamingServerURL, result.mediaURL, result.infoHash, result.fileIdx, commandArgs.stream.behaviorHints);
                                    })
                                    .then(function(result) {
                                        if (commandArgs !== loadArgs) {
                                            return;
                                        }

                                        videoParams = result;
                                        onPropChanged('videoParams');
                                    })
                                    .catch(function(error) {
                                        if (commandArgs !== loadArgs) {
                                            return;
                                        }

                                        // eslint-disable-next-line no-console
                                        console.error(error);
                                        videoParams = { hash: null, size: null, filename: null };
                                        onPropChanged('videoParams');
                                    });
                            })
                            .catch(function(error) {
                                if (commandArgs !== loadArgs) {
                                    return;
                                }

                                onError(Object.assign({}, ERROR.WITH_STREAMING_SERVER.CONVERT_FAILED, {
                                    error: error,
                                    critical: true,
                                    stream: commandArgs.stream,
                                    streamingServerURL: commandArgs.streamingServerURL
                                }));
                            });
                    } else {
                        onError(Object.assign({}, ERROR.UNSUPPORTED_STREAM, {
                            critical: true,
                            stream: commandArgs ? commandArgs.stream : null,
                            streamingServerURL: commandArgs && typeof commandArgs.streamingServerURL === 'string' ? commandArgs.streamingServerURL : null
                        }));
                    }

                    return true;
                }
                case 'addExtraSubtitlesTracks': {
                    if (loadArgs && commandArgs && Array.isArray(commandArgs.tracks)) {
                        if (loaded) {
                            video.dispatch({
                                type: 'command',
                                commandName: 'addExtraSubtitlesTracks',
                                commandArgs: Object.assign({}, commandArgs, {
                                    tracks: commandArgs.tracks.map(function(track) {
                                        return Object.assign({}, track, {
                                            // fallback is used in case server conversion fails (if server is offline)
                                            fallbackUrl: track.url,
                                            url: typeof track.url === 'string' ?
                                                url.resolve(loadArgs.streamingServerURL, '/subtitles.vtt?' + new URLSearchParams([['from', track.url]]).toString())
                                                :
                                                track.url
                                        });
                                    })
                                })
                            });
                        } else {
                            actionsQueue.push({
                                type: 'command',
                                commandName: 'addExtraSubtitlesTracks',
                                commandArgs: commandArgs
                            });
                        }
                    }

                    return true;
                }
                case 'unload': {
                    loadArgs = null;
                    loaded = false;
                    actionsQueue = [];
                    videoParams = null;
                    onPropChanged('stream');
                    onPropChanged('videoParams');
                    return false;
                }
                case 'destroy': {
                    command('unload');
                    destroyed = true;
                    video.dispatch({ type: 'command', commandName: 'destroy' });
                    events.removeAllListeners();
                    return true;
                }
                default: {
                    if (!loaded) {
                        actionsQueue.push({
                            type: 'command',
                            commandName: commandName,
                            commandArgs: commandArgs
                        });

                        return true;
                    }

                    return false;
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
                        if (observeProp(action.propName)) {
                            return;
                        }

                        break;
                    }
                    case 'command': {
                        if (command(action.commandName, action.commandArgs)) {
                            return;
                        }

                        break;
                    }
                }
            }

            video.dispatch(action);
        };
    }

    VideoWithStreamingServer.canPlayStream = function(stream, options) {
        return supportsTranscoding()
            .then(function(supported) {
                if (!supported) {
                    // we cannot probe the video in this case
                    return Video.canPlayStream(stream);
                }
                // probing normally gives more accurate results
                var queryParams = new URLSearchParams([['mediaURL', stream.url]]);
                return fetch(url.resolve(options.streamingServerURL, '/hlsv2/probe?' + queryParams.toString()))
                    .then(function(resp) {
                        return resp.json();
                    })
                    .then(function(probe) {
                        var isFormatSupported = options.formats.some(function(format) {
                            return probe.format.name.indexOf(format) !== -1;
                        });
                        var areStreamsSupported = probe.streams.every(function(stream) {
                            if (stream.track === 'audio') {
                                return stream.channels <= options.maxAudioChannels &&
                                    options.audioCodecs.indexOf(stream.codec) !== -1;
                            } else if (stream.track === 'video') {
                                return options.videoCodecs.indexOf(stream.codec) !== -1;
                            }

                            return true;
                        });
                        return isFormatSupported && areStreamsSupported;
                    })
                    .catch(function() {
                        // this uses content-type header in HTMLVideo which
                        // is unreliable, check can also fail due to CORS
                        return Video.canPlayStream(stream);
                    });
            });
    };

    VideoWithStreamingServer.manifest = {
        name: Video.manifest.name + 'WithStreamingServer',
        external: Video.manifest.external,
        props: Video.manifest.props.concat(['stream', 'videoParams'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; }),
        commands: Video.manifest.commands.concat(['load', 'unload', 'destroy', 'addExtraSubtitlesTracks'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; }),
        events: Video.manifest.events.concat(['propValue', 'propChanged', 'error'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; })
    };

    return VideoWithStreamingServer;
}

module.exports = withStreamingServer;
