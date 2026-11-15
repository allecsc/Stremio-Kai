var EventEmitter = require('eventemitter3');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var selectVideoImplementation = require('./selectVideoImplementation');
var platform = require('../platform');
var ERROR = require('../error');

function StremioVideo() {
    var video = null;
    var events = new EventEmitter();
    var destroyed = false;

    this.on = function(eventName, listener) {
        if (destroyed) {
            throw new Error('Video is destroyed');
        }

        events.on(eventName, listener);
    };
    this.dispatch = function(action, options) {
        if (destroyed) {
            throw new Error('Video is destroyed');
        }

        if (action) {
            action = deepFreeze(cloneDeep(action));
            options = options || {};
            if (action.type === 'command' && action.commandName === 'load' && action.commandArgs) {
                if (action.commandArgs.platform) {
                    platform.set(action.commandArgs.platform);
                }
                var Video = selectVideoImplementation(action.commandArgs, options);
                if (video !== null && video.constructor !== Video) {
                    video.dispatch({ type: 'command', commandName: 'destroy' });
                    video = null;
                }
                if (video === null) {
                    if (Video === null) {
                        events.emit('error', Object.assign({}, ERROR.UNSUPPORTED_STREAM, {
                            error: new Error('No video implementation was selected'),
                            critical: true,
                            stream: action.commandArgs.stream
                        }));
                        return;
                    }

                    video = new Video(options);
                    video.on('ended', function() {
                        events.emit('ended');
                    });
                    video.on('error', function(args) {
                        events.emit('error', args);
                    });
                    video.on('propValue', function(propName, propValue) {
                        events.emit('propValue', propName, propValue);
                    });
                    video.on('propChanged', function(propName, propValue) {
                        events.emit('propChanged', propName, propValue);
                    });
                    video.on('subtitlesTrackLoaded', function(track) {
                        events.emit('subtitlesTrackLoaded', track);
                    });
                    video.on('audioTrackLoaded', function(track) {
                        events.emit('audioTrackLoaded', track);
                    });
                    video.on('extraSubtitlesTrackLoaded', function(track) {
                        events.emit('extraSubtitlesTrackLoaded', track);
                    });
                    video.on('extraSubtitlesTrackAdded', function(track) {
                        events.emit('extraSubtitlesTrackAdded', track);
                    });
                    if (Video.manifest.external) {
                        video.on('implementationChanged', function(manifest) {
                            events.emit('implementationChanged', manifest);
                        });
                    } else {
                        events.emit('implementationChanged', Video.manifest);
                    }
                }
            }

            if (video !== null) {
                try {
                    video.dispatch(action);
                } catch (error) {
                    // eslint-disable-next-line no-console
                    console.error(video.constructor.manifest.name, error);
                }
            }

            if (action.type === 'command' && action.commandName === 'destroy') {
                video = null;
            }

            return;
        }

        throw new Error('Invalid action dispatched: ' + JSON.stringify(action));
    };
    this.destroy = function() {
        destroyed = true;
        if (video !== null) {
            video.dispatch({ type: 'command', commandName: 'destroy' });
            video = null;
        }

        events.removeAllListeners();
    };
}

StremioVideo.ERROR = ERROR;

module.exports = StremioVideo;
