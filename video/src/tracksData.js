module.exports = function(url, cb) {
    fetch('http://127.0.0.1:11470/tracks/'+encodeURIComponent(url)).then(function(resp) {
        return resp.json();
    }).then(function(tracks) {
        var audioTracks = tracks.filter(function(el) { return (el || {}).type === 'audio'; });
        var subsTracks = tracks.filter(function(el) { return (el || {}).type === 'text'; });
        cb({ audio: audioTracks, subs: subsTracks });
    }).catch(function(err) {
        // eslint-disable-next-line no-console
        console.error(err);
        cb(false);
    });
};
