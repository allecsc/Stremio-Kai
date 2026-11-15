const { test } = require('node:test');
const assert = require('node:assert/strict');
const media = require('../src/common/Simkl/media');
const player = (type, id, videoId) => ({ selected: { metaRequest: { path: { type, id } }, streamRequest: { path: { id: videoId } } } });
test('IMDb movie identity and episode coordinates, including specials', () => {
    assert.deepEqual(media(player('movie', 'tt1254207', 'tt1254207')), { movie: { ids: { imdb: 'tt1254207' } } });
    assert.deepEqual(media(player('series', 'tt0944947', 'tt0944947:2:4')), { show: { ids: { imdb: 'tt0944947' } }, episode: { season: 2, number: 4 } });
    assert.equal(media(player('series', 'tt0944947', 'tt0944947:0:1')).episode.season, 0);
});
test('anime-native identities preserve cour and absolute episode', () => {
    for (const id of ['kitsu:12', 'mal:16498', 'anidb:8692', 'anilist:16498']) {
        assert.equal(media(player('series', id, id + ':4')).episode.number, 4);
        assert.equal(media(player('anime', id, id + ':4')).episode.number, 4);
    }
});
test('ambiguous or mismatched identities are rejected without filename detection', () => {
    for (const value of [undefined, {}, player('movie', 'tt1254207', 'tt0944947'), player('series', 'tt0944947', 'tt1234567:1:1'),
        player('series', 'kitsu:12', 'kitsu:13:2'), player('series', 'mal:12', 'mal:12:2:1'),
        player('series', 'tt0944947', 'tt0944947:1:0'), player('movie', 'Big.Buck.Bunny.2008.mp4', 'Big.Buck.Bunny.2008.mp4')]) {
        assert.equal(media(value), null);
    }
});
