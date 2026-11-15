var EventEmitter = require('eventemitter3');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');

function withVideoParams(Video) {
    function VideoWithVideoParams(options) {
        options = options || {};

        var video = new Video(options);
        video.on('propValue', onVideoPropEvent.bind(null, 'propValue'));
        video.on('propChanged', onVideoPropEvent.bind(null, 'propChanged'));
        Video.manifest.events
            .filter(function(eventName) {
                return !['propValue', 'propChanged'].includes(eventName);
            })
            .forEach(function(eventName) {
                video.on(eventName, onOtherVideoEvent(eventName));
            });

        var stream = null;
        var events = new EventEmitter();
        var destroyed = false;
        var observedProps = {
            videoParams: false
        };

        function onVideoPropEvent(eventName, propName, propValue) {
            if (propName !== 'videoParams') {
                events.emit(eventName, propName, getProp(propName, propValue));
            }
            if (propName === 'stream') {
                stream = propValue;
                onPropChanged('videoParams');
            }
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
        function getProp(propName, videoPropValue) {
            switch (propName) {
                case 'videoParams': {
                    if (stream === null) {
                        return null;
                    }

                    var hash = stream.behaviorHints && typeof stream.behaviorHints.videoHash === 'string' ? stream.behaviorHints.videoHash : null;
                    var size = stream.behaviorHints && stream.behaviorHints.videoSize !== null && isFinite(stream.behaviorHints.videoSize) ? stream.behaviorHints.videoSize : null;
                    var filename = stream.behaviorHints && typeof stream.behaviorHints.filename === 'string' ? stream.behaviorHints.filename : null;
                    return { hash: hash, size: size, filename: filename };
                }
                default: {
                    return videoPropValue;
                }
            }
        }
        function observeProp(propName) {
            switch (propName) {
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
        function command(commandName) {
            switch (commandName) {
                case 'destroy': {
                    destroyed = true;
                    video.dispatch({ type: 'command', commandName: 'destroy' });
                    events.removeAllListeners();
                    return true;
                }
                default: {
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

    VideoWithVideoParams.canPlayStream = function(stream, options) {
        return Video.canPlayStream(stream, options);
    };

    VideoWithVideoParams.manifest = {
        name: Video.manifest.name + 'WithVideoParams',
        external: Video.manifest.external,
        props: Video.manifest.props.concat(['videoParams'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; }),
        commands: Video.manifest.commands.concat(['destroy'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; }),
        events: Video.manifest.events.concat(['propValue', 'propChanged'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; })
    };

    return VideoWithVideoParams;
}

module.exports = withVideoParams;
