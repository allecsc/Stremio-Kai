var ChromecastSenderVideo = require('../ChromecastSenderVideo');
var ShellVideo = require('../ShellVideo');
var HTMLVideo = require('../HTMLVideo');
var TizenVideo = require('../TizenVideo');
var TitanVideo = require('../TitanVideo');
var VidaaVideo = require('../VidaaVideo');
var WebOsVideo = require('../WebOsVideo');
var IFrameVideo = require('../IFrameVideo');
var YouTubeVideo = require('../YouTubeVideo');
var withStreamingServer = require('../withStreamingServer');
var withHTMLSubtitles = require('../withHTMLSubtitles');
var withVideoParams = require('../withVideoParams');

function selectVideoImplementation(commandArgs, options) {
    if (!commandArgs.stream || typeof commandArgs.stream.externalUrl === 'string') {
        return null;
    }

    if (options.chromecastTransport && options.chromecastTransport.getCastState() === cast.framework.CastState.CONNECTED) {
        return ChromecastSenderVideo;
    }

    if (typeof commandArgs.stream.ytId === 'string') {
        return withVideoParams(withHTMLSubtitles(YouTubeVideo));
    }

    if (typeof commandArgs.stream.playerFrameUrl === 'string') {
        return withVideoParams(IFrameVideo);
    }

    if (options.shellTransport) {
        return withStreamingServer(withHTMLSubtitles(ShellVideo));
    }

    if (typeof commandArgs.streamingServerURL === 'string') {
        if (commandArgs.platform === 'Tizen') {
            return withStreamingServer(withHTMLSubtitles(TizenVideo));
        }
        if (commandArgs.platform === 'webOS') {
            return withStreamingServer(withHTMLSubtitles(WebOsVideo));
        }
        if (commandArgs.platform === 'Titan' || commandArgs.platform === 'NetTV') {
            return withStreamingServer(withHTMLSubtitles(TitanVideo));
        }
        if (commandArgs.platform === 'Vidaa') {
            return withStreamingServer(withHTMLSubtitles(VidaaVideo));
        }
        return withStreamingServer(withHTMLSubtitles(HTMLVideo));
    }

    if (typeof commandArgs.stream.url === 'string') {
        if (commandArgs.platform === 'Tizen') {
            return withVideoParams(withHTMLSubtitles(TizenVideo));
        }
        if (commandArgs.platform === 'webOS') {
            return withVideoParams(withHTMLSubtitles(WebOsVideo));
        }
        if (commandArgs.platform === 'Titan' || commandArgs.platform === 'NetTV') {
            return withVideoParams(withHTMLSubtitles(TitanVideo));
        }
        if (commandArgs.platform === 'Vidaa') {
            return withVideoParams(withHTMLSubtitles(VidaaVideo));
        }
        return withVideoParams(withHTMLSubtitles(HTMLVideo));
    }

    return null;
}

module.exports = selectVideoImplementation;
