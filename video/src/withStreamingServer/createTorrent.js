var url = require('url');

function buildTorrent(streamingServerURL, infoHash, fileIdx, sources) {
    var query = Array.isArray(sources) && sources.length > 0 ?
        '?' + new URLSearchParams(sources.map(function(source) {
            return ['tr', source];
        }))
        :
        '';
    return {
        url: url.resolve(streamingServerURL, '/' + encodeURIComponent(infoHash) + '/' + encodeURIComponent(fileIdx)) + query,
        infoHash: infoHash,
        fileIdx: fileIdx,
        sources: sources
    };
}

function createTorrent(streamingServerURL, infoHash, fileIdx, sources, seriesInfo) {
    if ((!Array.isArray(sources) || sources.length === 0) && (fileIdx !== null && isFinite(fileIdx))) {
        return Promise.resolve(buildTorrent(streamingServerURL, infoHash, fileIdx, sources));
    }

    var body = {
        torrent: {
            infoHash: infoHash,
        }
    };

    if (Array.isArray(sources) && sources.length > 0) {
        body.peerSearch = {
            sources: ['dht:' + infoHash].concat(sources).filter(function(source, index, sources) {
                return sources.indexOf(source) === index;
            }),
            min: 40,
            max: 200
        };
    }

    if (fileIdx === null || !isFinite(fileIdx)) {
        body.guessFileIdx = {};
        if (seriesInfo) {
            if (seriesInfo.season !== null && isFinite(seriesInfo.season)) {
                body.guessFileIdx.season = seriesInfo.season;
            }
            if (seriesInfo.episode !== null && isFinite(seriesInfo.episode)) {
                body.guessFileIdx.episode = seriesInfo.episode;
            }
        }
    } else {
        body.guessFileIdx = false;
    }

    return fetch(url.resolve(streamingServerURL, '/' + encodeURIComponent(infoHash) + '/create'), {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify(body)
    }).then(function(resp) {
        if (resp.ok) {
            return resp.json();
        }

        throw new Error(resp.status + ' (' + resp.statusText + ')');
    }).then(function(resp) {
        return buildTorrent(streamingServerURL, infoHash, body.guessFileIdx ? resp.guessedFileIdx : fileIdx, body.peerSearch ? body.peerSearch.sources : []);
    });
}

module.exports = createTorrent;
