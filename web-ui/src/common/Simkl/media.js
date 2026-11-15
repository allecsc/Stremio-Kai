// Playback identity comes from Stremio's selected metadata/video, never the filename.
function mediaForPlayer(player) {
    const selected = player?.selected;
    const type = selected?.metaRequest?.path?.type;
    const metaId = selected?.metaRequest?.path?.id;
    const videoId = selected?.streamRequest?.path?.id;
    if (typeof metaId !== 'string' || typeof videoId !== 'string') return null;
    if (type === 'movie' && /^tt\d{5,12}$/.test(metaId) && videoId === metaId) {
        return { movie: { ids: { imdb: metaId } } };
    }
    if (type !== 'series' && type !== 'anime') return null;
    const episode = /^(tt\d{5,12}):(\d+):(\d+)$/.exec(videoId);
    if (episode && episode[1] === metaId) {
        const season = Number(episode[2]), number = Number(episode[3]);
        return season <= 10000 && number > 0 && number <= 100000 ?
            { show: { ids: { imdb: metaId } }, episode: { season, number } } : null;
    }
    // Anime-native addons use an absolute episode inside a specific anime entry.
    // A MAL/Kitsu entry denotes one cour; IMDb season numbering is never guessed.
    const anime = /^(kitsu|mal|anilist|anidb):([1-9]\d{0,11})$/.exec(metaId);
    if (anime && videoId.startsWith(metaId + ':')) {
        const suffix = videoId.slice(metaId.length + 1);
        if (!/^[1-9]\d{0,5}$/.test(suffix) || Number(suffix) > 100000) return null;
        return { anime: { ids: { [anime[1]]: anime[2] } }, episode: { number: Number(suffix) } };
    }
    return null; // An unresolved/ambiguous title must not scrobble the wrong item.
}

module.exports = mediaForPlayer;
