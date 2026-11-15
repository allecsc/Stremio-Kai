var VIDEO_CODEC_CONFIGS = [
    {
        codec: 'h264',
        force: window.chrome || window.cast,
        mime: 'video/mp4; codecs="avc1.42E01E"',
    },
    {
        codec: 'h265',
        // Disabled because chrome only has partial support for h265/hvec,
        // force: window.chrome || window.cast,
        mime: 'video/mp4; codecs="hev1.1.6.L150.B0"',
        aliases: ['hevc']
    },
    {
        codec: 'vp8',
        mime: 'video/mp4; codecs="vp8"'
    },
    {
        codec: 'vp9',
        mime: 'video/mp4; codecs="vp9"'
    }
];

var AUDIO_CODEC_CONFIGS = [
    {
        codec: 'aac',
        mime: 'audio/mp4; codecs="mp4a.40.2"'
    },
    {
        codec: 'mp3',
        mime: 'audio/mp4; codecs="mp3"'
    },
    {
        codec: 'ac3',
        mime: 'audio/mp4; codecs="ac-3"'
    },
    {
        codec: 'eac3',
        mime: 'audio/mp4; codecs="ec-3"'
    },
    {
        codec: 'vorbis',
        mime: 'audio/mp4; codecs="vorbis"'
    },
    {
        codec: 'opus',
        mime: 'audio/mp4; codecs="opus"'
    }
];

function canPlay(config, options) {
    return config.force || typeof options.mediaElement.canPlayType === 'function' && options.mediaElement.canPlayType(config.mime)
        ? [config.codec].concat(config.aliases || [])
        : [];
}

function getMaxAudioChannels() {
    if (/firefox/i.test(window.navigator.userAgent)) {
        return 6;
    }

    if (!window.AudioContext || window.chrome || window.cast) {
        return 2;
    }

    var maxChannelCount = new AudioContext().destination.maxChannelCount;
    return maxChannelCount > 0 ? maxChannelCount : 2;
}

function getMediaCapabilities() {
    var mediaElement = document.createElement('video');
    var formats = ['mp4'];
    if (window.chrome || window.cast) {
        formats.push('matroska,webm');
    }
    var videoCodecs = VIDEO_CODEC_CONFIGS
        .map(function(config) {
            return canPlay(config, { mediaElement: mediaElement });
        })
        .reduce(function(result, value) {
            return result.concat(value);
        }, []);
    var audioCodecs = AUDIO_CODEC_CONFIGS
        .map(function(config) {
            return canPlay(config, { mediaElement: mediaElement });
        })
        .reduce(function(result, value) {
            return result.concat(value);
        }, []);
    var maxAudioChannels = getMaxAudioChannels();
    return {
        formats: formats,
        videoCodecs: videoCodecs,
        audioCodecs: audioCodecs,
        maxAudioChannels: maxAudioChannels
    };
}

module.exports = getMediaCapabilities();
