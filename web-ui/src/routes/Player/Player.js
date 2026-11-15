// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const simklMediaForPlayer = require('../../common/Simkl/media');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const debounce = require('lodash.debounce');
const langs = require('langs');
const { useTranslation } = require('react-i18next');
const { useRouteFocused } = require('stremio-router');
const { useServices } = require('stremio/services');
const { useSettings, useFullscreen, useBinaryState, useToast, useStreamingServer, withCoreSuspender, useProfile, useStorage, useShell,
    usePlatform
} = require('stremio/common');
const { HorizontalNavBar, Transition, ContextMenu } = require('stremio/components');
const BufferingLoader = require('./BufferingLoader');
const VolumeChangeIndicator = require('./VolumeChangeIndicator');
const Error = require('./Error');
const ControlBar = require('./ControlBar');
const NextVideoPopup = require('./NextVideoPopup');
const StatisticsMenu = require('./StatisticsMenu');
const OptionsMenu = require('./OptionsMenu');
const SubtitlesMenu = require('./SubtitlesMenu');
const { default: AudioMenu } = require('./AudioMenu');
const SpeedMenu = require('./SpeedMenu');
const { default: SideDrawerButton } = require('./SideDrawerButton');
const { default: SideDrawer } = require('./SideDrawer');
const usePlayer = require('./usePlayer');
const useStatistics = require('./useStatistics');
const useVideo = require('./useVideo');
const styles = require('./styles');
const Video = require('./Video');

const Player = ({ urlParams, queryParams }) => {
    const { t } = useTranslation();
    const services = useServices();
    const shell = useShell();
    const forceTranscoding = React.useMemo(() => {
        return queryParams.has('forceTranscoding');
    }, [queryParams]);

    const [player, videoParamsChanged, timeChanged, seek, pausedChanged, ended, nextVideo] = usePlayer(urlParams);
    const [settings, updateSettings] = useSettings();
    const [storage, updateStorage] = useStorage();
    const streamingServer = useStreamingServer();
    const statistics = useStatistics(player, streamingServer);
    const video = useVideo();
    const routeFocused = useRouteFocused();
    const platform = usePlatform();
    const toast = useToast();
    const profile = useProfile();

    const [seeking, setSeeking] = React.useState(false);

    const [casting, setCasting] = React.useState(() => {
        return services.chromecast.active && services.chromecast.transport.getCastState() === cast.framework.CastState.CONNECTED;
    });
    const playbackDevices = React.useMemo(() => streamingServer.playbackDevices !== null && streamingServer.playbackDevices.type === 'Ready' ? streamingServer.playbackDevices.content : [], [streamingServer]);

    const bufferingRef = React.useRef();
    const errorRef = React.useRef();

    const [immersed, setImmersed] = React.useState(true);
    const setImmersedDebounced = React.useCallback(debounce(setImmersed, 3000), []);
    const [, , , toggleFullscreen] = useFullscreen();

    const [optionsMenuOpen, , closeOptionsMenu, toggleOptionsMenu] = useBinaryState(false);
    const [subtitlesMenuOpen, , closeSubtitlesMenu, toggleSubtitlesMenu] = useBinaryState(false);
    const [audioMenuOpen, , closeAudioMenu, toggleAudioMenu] = useBinaryState(false);
    const [speedMenuOpen, , closeSpeedMenu, toggleSpeedMenu] = useBinaryState(false);
    const [statisticsMenuOpen, , closeStatisticsMenu, toggleStatisticsMenu] = useBinaryState(false);
    const [nextVideoPopupOpen, openNextVideoPopup, closeNextVideoPopup] = useBinaryState(false);
    const [sideDrawerOpen, , closeSideDrawer, toggleSideDrawer] = useBinaryState(false);
    const [externalEmbedded, setExternalEmbedded] = React.useState(false);

    const menusOpen = React.useMemo(() => {
        return optionsMenuOpen || subtitlesMenuOpen || audioMenuOpen || speedMenuOpen || statisticsMenuOpen || sideDrawerOpen;
    }, [optionsMenuOpen, subtitlesMenuOpen, audioMenuOpen, speedMenuOpen, statisticsMenuOpen, sideDrawerOpen]);

    const closeMenus = React.useCallback(() => {
        closeOptionsMenu();
        closeSubtitlesMenu();
        closeAudioMenu();
        closeSpeedMenu();
        closeStatisticsMenu();
        closeSideDrawer();
    }, []);

    const overlayHidden = React.useMemo(() => {
        return immersed && !casting && video.state.paused !== null && !video.state.paused && !menusOpen && !nextVideoPopupOpen;
    }, [immersed, casting, video.state.paused, menusOpen, nextVideoPopupOpen]);

    const nextVideoPopupDismissed = React.useRef(false);
    const nextVideoInitialData = React.useRef(player.nextVideo);
    nextVideoInitialData.current = player.nextVideo;
    const defaultSubtitlesSelected = React.useRef(false);
    const defaultAudioTrackSelected = React.useRef(false);
    const [error, setError] = React.useState(null);

    const isNavigating = React.useRef(false);

    React.useEffect(() => {
        const trackId = video.state.selectedSubtitlesTrackId;
        if (!trackId) return;
        const selectedTrack =
            video.state.subtitlesTracks.find((track) => track.id === trackId) ||
            video.state.extraSubtitlesTracks.find((track) => track.id === trackId);
        if (!selectedTrack) return;
        const isEmbedded = selectedTrack.origin === 'EMBEDDED';
        setExternalEmbedded(!isEmbedded);
    }, [video.state.selectedSubtitlesTrackId]);

    React.useEffect(() => {
        if (!player.selected || !player.metaItem || player.metaItem.type !== 'Ready' || !video.state.duration || !storage.isDiscordRpcOn) {
            return;
        }

        const videoType = player.metaItem.content.type === 'movie' ? 'movie' : 'series';
        const title = player.metaItem.content.name || '';
        const season = player.seriesInfo?.season;
        const episode = player.seriesInfo?.episode;

        let episodeName = '';
        let episodeThumbnail = '';

        if (videoType === 'series' && Array.isArray(player.metaItem.content.videos)) {
            const currentEpisode = player.metaItem.content.videos.find(v => v.season === season && v.episode === episode);
            if (currentEpisode) {
                episodeName = currentEpisode.title;
                episodeThumbnail = currentEpisode.thumbnail;
            }
        }

        const mainThumbnail = player.metaItem.content.poster || player.metaItem.content.background || '';
        const elapsedSeconds = Math.floor((video.state.time / 1000) || 0);
        const durationSeconds = Math.floor((video.state.duration / 1000) || 0);
        const isPaused = video.state.paused ? 'yes' : 'no';

        const imdbLink = player.metaItem.content.links?.find(link => link.category === 'imdb')?.url || '';
        const stremioLink = player.metaItem.content.links?.find(link => link.category === 'share')?.url || '';

        shell.send('activity', [
            'watching',
            videoType,
            title,
            season ? season.toString() : '',
            episode ? episode.toString() : '',
            episodeName,
            episodeThumbnail,
            mainThumbnail,
            elapsedSeconds.toString(),
            durationSeconds.toString(),
            isPaused,
            imdbLink,
            stremioLink,
        ]);

    }, [
        player.selected,
        player.metaItem,
        player.seriesInfo,
        video.state.time,
        video.state.duration,
        video.state.paused,
        shell,
        storage
    ]);

    const onImplementationChanged = React.useCallback(() => {
        video.setProp('subtitlesSize', settings.subtitlesSize);
        video.setProp('subtitlesOffset', settings.subtitlesOffset);
        video.setProp('subtitlesTextColor', settings.subtitlesTextColor);
        video.setProp('subtitlesBackgroundColor', settings.subtitlesBackgroundColor);
        video.setProp('subtitlesOutlineColor', settings.subtitlesOutlineColor);
        video.setProp('extraSubtitlesSize', settings.subtitlesSize);
        video.setProp('extraSubtitlesOffset', settings.subtitlesOffset);
        video.setProp('extraSubtitlesTextColor', settings.subtitlesTextColor);
        video.setProp('extraSubtitlesBackgroundColor', settings.subtitlesBackgroundColor);
        video.setProp('extraSubtitlesOutlineColor', settings.subtitlesOutlineColor);
    }, [settings.subtitlesSize, settings.subtitlesOffset, settings.subtitlesTextColor, settings.subtitlesBackgroundColor, settings.subtitlesOutlineColor]);

    const onEnded = React.useCallback(() => {
        player.nextVideo = nextVideoInitialData.current;
        if (isNavigating.current) {
            return;
        }

        ended();
        if (player.nextVideo !== null) {
            onNextVideoRequested();
        } else {
            window.history.back();
        }
    }, [player.nextVideo, onNextVideoRequested]);

    const onError = React.useCallback((error) => {
        console.error('Player', error);
        if (error.critical) {
            setError(error);
        } else {
            toast.show({
                type: 'error',
                title: t('ERROR'),
                message: error.message ? error.message : error,
                timeout: 3000
            });
        }
    }, []);

    const onVisibilityChange = React.useCallback(() => {
        if (profile.settings.playInBackground) return;
        if (document.visibilityState === 'hidden') {
            video.setProp('paused', true);
        } else {
            video.setProp('paused', false);
        }
    }, []);

    const onSubtitlesTrackLoaded = React.useCallback(() => {
        toast.show({
            type: 'success',
            title: t('PLAYER_SUBTITLES_LOADED'),
            message: 'Player loaded subtitles',
            timeout: 3000
        });
    }, []);

    const onSubtitlesTrackChoosen = React.useCallback(() => {
        if (!storage.showSubTrackLoadedToast) return;
        toast.show({
            type: 'success',
            title: t('PLAYER_SUBTITLES_LOADED'),
            message: 'Subtitle track loaded',
            timeout: 3000
        });
    }, []);

    const getAltThumbnail = React.useCallback((video, currentSeason) => {
        if (currentSeason === null || typeof video.thumbnail !== 'string' || video.thumbnail.length === 0 || typeof video.episode !== 'number' || isNaN(video.episode)) return '';
        const previousEpisodes = player.metaItem.content.videos.filter((videoData) =>
            videoData.season !== null && videoData.season !== 0 && videoData.season && videoData.season < currentSeason
        ).length;
        if (isNaN(previousEpisodes) || previousEpisodes === 0) return '';
        //Fallback correction for Animes
        const correctedEpisode = previousEpisodes + video.episode;
        // This regex assumes the URL is in the format:
        // protocol://domain/id/season/episode/rest
        return video.thumbnail.replace(
            /^(https?:\/\/[^/]+\/[^/]+)\/(\d+)\/(\d+)(\/.*)$/,
            (_, base, origSeason, origEpisode, rest) => {
                // Replace the season with "1" and the episode with the corrected value
                return `${base}/1/${correctedEpisode}${rest}`;
            }
        );
    }, [player.metaItem]);

    const findTrackByLanguagesWithPriorityKeywords = React.useCallback((tracks, languages, priorityKeywords = []) => {
        const lowerKeywords = priorityKeywords.map((keyword) => keyword.toLowerCase());
        for (const lang of languages) {
            const candidates = tracks.filter((track) =>
                track.lang === lang ||
                (langs.where && langs.where('1', track.lang)?.[2] === lang)
            );
            if (candidates.length === 0) continue;
            if (candidates.length === 1) return candidates[0];
            for (const keyword of lowerKeywords) {
                const match = candidates.find((candidate) =>
                    candidate.label.toLowerCase().includes(keyword)
                );
                if (match) return match;
            }
            return candidates[0];
        }
        return null;
    }, []);

    const onPlayRequested = React.useCallback(() => {
        video.setProp('paused', false);
        setSeeking(false);
    }, []);

    const onPlayRequestedDebounced = React.useCallback(debounce(onPlayRequested, 200), []);

    const onPauseRequested = React.useCallback(() => {
        video.setProp('paused', true);
    }, []);

    const onPauseRequestedDebounced = React.useCallback(debounce(onPauseRequested, 200), []);
    const onMuteRequested = React.useCallback(() => {
        video.setProp('muted', true);
    }, []);

    const onUnmuteRequested = React.useCallback(() => {
        video.setProp('muted', false);
    }, []);

    const onVolumeChangeRequested = React.useCallback((volume) => {
        video.setProp('volume', Math.min(volume, Number(storage.maxVolume)));
    }, []);

    const onSeekRequested = React.useCallback((time) => {
        video.setProp('time', time);
        seek(time, video.state.duration, video.state.manifest?.name);
    }, [video.state.duration, video.state.manifest]);

    const onPlaybackSpeedChanged = React.useCallback((rate) => {
        video.setProp('playbackSpeed', rate);
    }, []);

    const onSubtitlesTrackSelected = React.useCallback((id) => {
        video.setProp('selectedSubtitlesTrackId', id);
        video.setProp('selectedExtraSubtitlesTrackId', null);
    }, []);

    const onExtraSubtitlesTrackSelected = React.useCallback((id) => {
        video.setProp('selectedSubtitlesTrackId', null);
        video.setProp('selectedExtraSubtitlesTrackId', id);
    }, []);

    const onAudioTrackSelected = React.useCallback((id) => {
        video.setProp('selectedAudioTrackId', id);
    }, []);

    const onExtraSubtitlesDelayChanged = React.useCallback((delay) => {
        video.setProp('extraSubtitlesDelay', delay);
    }, []);

    const onSubtitlesDelayChanged = React.useCallback((delay) => {
        video.setProp('subtitlesDelay', delay / 1000);
    }, []);

    const onSubtitlesSizeChanged = React.useCallback((size) => {
        updateSettings({ subtitlesSize: size });
    }, [updateSettings]);

    const onSubtitlesOffsetChanged = React.useCallback((offset) => {
        updateSettings({ subtitlesOffset: offset });
    }, [updateSettings]);

    const onDismissNextVideoPopup = React.useCallback(() => {
        closeNextVideoPopup();
        nextVideoPopupDismissed.current = true;
    }, []);

    const onNextVideoRequested = React.useCallback(() => {
        if (player.nextVideo !== null) {
            nextVideo();

            const deepLinks = player.nextVideo.deepLinks;
            if (deepLinks.metaDetailsStreams && deepLinks.player) {
                window.location.replace(deepLinks.metaDetailsStreams);
                window.location.href = deepLinks.player;
            } else {
                window.location.replace(deepLinks.player ?? deepLinks.metaDetailsStreams);
            }
        }
    }, [player.nextVideo]);

    const onVideoClick = React.useCallback(() => {
        if (video.state.paused !== null) {
            if (video.state.paused) {
                onPlayRequestedDebounced();
            } else {
                onPauseRequestedDebounced();
            }
        }
    }, [video.state.paused]);

    const onVideoDoubleClick = React.useCallback(() => {
        onPlayRequestedDebounced.cancel();
        onPauseRequestedDebounced.cancel();
        toggleFullscreen();
    }, [toggleFullscreen]);

    const onContainerMouseDown = React.useCallback((event) => {
        if (!event.nativeEvent.optionsMenuClosePrevented) {
            closeOptionsMenu();
        }
        if (!event.nativeEvent.subtitlesMenuClosePrevented) {
            closeSubtitlesMenu();
        }
        if (!event.nativeEvent.audioMenuClosePrevented) {
            closeAudioMenu();
        }
        if (!event.nativeEvent.speedMenuClosePrevented) {
            closeSpeedMenu();
        }
        if (!event.nativeEvent.statisticsMenuClosePrevented) {
            closeStatisticsMenu();
        }

        closeSideDrawer();
    }, []);

    const onContainerMouseMove = React.useCallback((event) => {
        setImmersed(false);
        if (!event.nativeEvent.immersePrevented) {
            setImmersedDebounced(true);
        } else {
            setImmersedDebounced.cancel();
        }
    }, []);

    const onContainerMouseLeave = React.useCallback(() => {
        setImmersedDebounced.cancel();
        setImmersed(true);
    }, []);

    const onBarMouseMove = React.useCallback((event) => {
        event.nativeEvent.immersePrevented = true;
    }, []);

    React.useEffect(() => {
        if (!storage.embeddedSubDelay && video.state.selectedSubtitlesTrackId && video.state.subtitlesDelay !== 0 && !externalEmbedded) {
            shell.send('mpv-set-prop', ['sub-delay', '0']);
        }
    }, [
        externalEmbedded,
        storage.embeddedSubDelay,
        video.state.selectedSubtitlesTrackId,
        video.state.subtitlesDelay
    ]);

    React.useEffect(() => {
        setError(null);
        video.unload();

        if (player.selected && player.stream?.type === 'Ready' && streamingServer.settings?.type !== 'Loading') {
            video.load({
                simklMedia: simklMediaForPlayer(player),
                stream: {
                    ...player.stream.content,
                    subtitles: Array.isArray(player.selected.stream.subtitles) ?
                        player.selected.stream.subtitles.map((subtitles) => ({
                            ...subtitles,
                            label: subtitles.url
                        }))
                        :
                        []
                },
                autoplay: true,
                time: player.libraryItem !== null &&
                player.selected.streamRequest !== null &&
                player.selected.streamRequest.path !== null &&
                player.libraryItem.state.video_id === player.selected.streamRequest.path.id ?
                    player.libraryItem.state.timeOffset
                    :
                    0,
                forceTranscoding: forceTranscoding || casting,
                maxAudioChannels: settings.surroundSound ? 32 : 2,
                hardwareDecoding: settings.hardwareDecoding,
                videoMode: settings.videoMode,
                platform: platform.name,
                streamingServerURL: streamingServer.baseUrl ?
                    casting ?
                        streamingServer.baseUrl
                        :
                        streamingServer.selected.transportUrl
                    :
                    null,
                seriesInfo: player.seriesInfo,
            }, {
                chromecastTransport: services.chromecast.active ? services.chromecast.transport : null,
                shellTransport: services.shell.active ? services.shell.transport : null,
            });
        }
    }, [streamingServer.baseUrl, player.selected, player.stream, forceTranscoding, casting]);
    React.useEffect(() => {
        if (video.state.stream !== null) {
            const tracks = player.subtitles.map((subtitles) => ({
                ...subtitles,
                label: subtitles.url
            }));
            video.addExtraSubtitlesTracks(tracks);
        }
    }, [player.subtitles, video.state.stream]);

    React.useEffect(() => {
        video.setProp('subtitlesSize', settings.subtitlesSize);
        video.setProp('extraSubtitlesSize', settings.subtitlesSize);
    }, [settings.subtitlesSize]);

    React.useEffect(() => {
        video.setProp('subtitlesOffset', settings.subtitlesOffset);
        video.setProp('extraSubtitlesOffset', settings.subtitlesOffset);
    }, [settings.subtitlesOffset]);

    React.useEffect(() => {
        video.setProp('subtitlesTextColor', settings.subtitlesTextColor);
        video.setProp('extraSubtitlesTextColor', settings.subtitlesTextColor);
    }, [settings.subtitlesTextColor]);

    React.useEffect(() => {
        video.setProp('subtitlesBackgroundColor', settings.subtitlesBackgroundColor);
        video.setProp('extraSubtitlesBackgroundColor', settings.subtitlesBackgroundColor);
    }, [settings.subtitlesBackgroundColor]);

    React.useEffect(() => {
        video.setProp('subtitlesOutlineColor', settings.subtitlesOutlineColor);
        video.setProp('extraSubtitlesOutlineColor', settings.subtitlesOutlineColor);
    }, [settings.subtitlesOutlineColor]);

    React.useEffect(() => {
        !seeking && timeChanged(video.state.time, video.state.duration, video.state.manifest?.name);
    }, [video.state.time, video.state.duration, video.state.manifest, seeking]);

    React.useEffect(() => {
        if (video.state.paused !== null) {
            pausedChanged(video.state.paused);
        }
    }, [video.state.paused]);

    React.useEffect(() => {
        videoParamsChanged(video.state.videoParams);
    }, [video.state.videoParams]);

    React.useEffect(() => {
        if (!!settings.bingeWatching && player.nextVideo !== null && !nextVideoPopupDismissed.current) {
            if (video.state.time !== null && video.state.duration !== null && video.state.time < video.state.duration && (video.state.duration - video.state.time) <= settings.nextVideoNotificationDuration) {
                openNextVideoPopup();
            } else {
                closeNextVideoPopup();
            }
        }
    }, [player.nextVideo, video.state.time, video.state.duration]);

    const autoSelectSubtitles = React.useCallback(() => {
        if (!defaultSubtitlesSelected.current) {
            if (video.state.extraSubtitlesTracks.length === 0 && video.state.subtitlesTracks.length === 0) return;

            const lastVideo = storage.lastVideo;
            const lastSubtitleId = storage.subtitleId;
            if (lastVideo !== urlParams.id) updateStorage({lastVideo: urlParams.id});

            if (lastVideo === urlParams.id && lastSubtitleId && storage.rememberTrackSelection) {
                if (lastSubtitleId === 'off') {
                    defaultSubtitlesSelected.current = true;
                    onSubtitlesTrackLoaded();
                    return;
                }

                const foundSubtitle = video.state.subtitlesTracks.find((track) => track.id === lastSubtitleId);
                const foundExtraSubtitle = video.state.extraSubtitlesTracks.find((track) => track.id === lastSubtitleId);

                if (foundSubtitle) {
                    onSubtitlesTrackSelected(lastSubtitleId);
                    defaultSubtitlesSelected.current = true;
                    onSubtitlesTrackLoaded();
                    return;
                } else if (foundExtraSubtitle) {
                    onExtraSubtitlesTrackSelected(lastSubtitleId);
                    defaultSubtitlesSelected.current = true;
                    onSubtitlesTrackLoaded();
                    return;
                }
            }

            if (storage.subtitleSelectionMode === 'off') {
                defaultSubtitlesSelected.current = true;
                onSubtitlesTrackLoaded();
                return;
            }

            const filterForced = storage.subtitleSelectionMode === 'forced';
            const availableSubtitles = filterForced
                ? video.state.subtitlesTracks.filter((t) => t.forced || (t.label && t.label.toLowerCase().includes('forced')))
                : video.state.subtitlesTracks;
            const availableExtraSubtitles = filterForced
                ? video.state.extraSubtitlesTracks.filter((t) => t.forced || (t.label && t.label.toLowerCase().includes('forced')))
                : video.state.extraSubtitlesTracks;

            const subtitlesTrack = findTrackByLanguagesWithPriorityKeywords(availableSubtitles, storage.defaultSubtitleLanguages, storage.subtitlePriorityKeywords);
            const extraSubtitlesTrack = findTrackByLanguagesWithPriorityKeywords(availableExtraSubtitles, storage.defaultSubtitleLanguages, storage.subtitlePriorityKeywords);
            if (subtitlesTrack && subtitlesTrack.id) {
                onSubtitlesTrackSelected(subtitlesTrack.id);
                updateStorage({subtitleId: subtitlesTrack.id});
                onSubtitlesTrackLoaded();
                defaultSubtitlesSelected.current = true;
            } else if (extraSubtitlesTrack && extraSubtitlesTrack.id) {
                onExtraSubtitlesTrackSelected(extraSubtitlesTrack.id);
                updateStorage({subtitleId: subtitlesTrack.id});
                onSubtitlesTrackLoaded();
                defaultSubtitlesSelected.current = true;
            }
        }
    }, [video.state.subtitlesTracks, video.state.extraSubtitlesTracks]);

    const autoSelectSubtitlesDebounced = React.useMemo(
        () => debounce(autoSelectSubtitles, 500),
        [autoSelectSubtitles]
    );

    React.useEffect(() => {
        autoSelectSubtitlesDebounced();
        return () => {
            autoSelectSubtitlesDebounced.cancel();
        };
    }, [video.state.subtitlesTracks, video.state.extraSubtitlesTracks, autoSelectSubtitlesDebounced]);

    React.useEffect(() => {
        if (!defaultAudioTrackSelected.current) {
            if (video.state.audioTracks.length === 0) return;
            const lastVideo = storage.lastVideo;
            const lastAudioTrackId = storage.audioTrackId;
            const foundAudioTrack = video.state.audioTracks.find((track) => track.id === lastAudioTrackId);
            if (lastVideo === urlParams.id && lastAudioTrackId && foundAudioTrack && storage.rememberTrackSelection) {
                onAudioTrackSelected(lastAudioTrackId);
                defaultAudioTrackSelected.current = true;
                return;
            }

            const audioTrack = findTrackByLanguagesWithPriorityKeywords(video.state.audioTracks, storage.defaultAudioLanguages);

            if (audioTrack && audioTrack.id) {
                onAudioTrackSelected(audioTrack.id);
                updateStorage({audioTrackId: audioTrack.id});
                defaultAudioTrackSelected.current = true;
            }
        }
    }, [video.state.audioTracks]);

    React.useEffect(() => {
        defaultSubtitlesSelected.current = false;
        defaultAudioTrackSelected.current = false;
        nextVideoPopupDismissed.current = false;
    }, [video.state.stream]);

    React.useEffect(() => {
        if ((!Array.isArray(video.state.subtitlesTracks) || video.state.subtitlesTracks.length === 0) &&
            (!Array.isArray(video.state.extraSubtitlesTracks) || video.state.extraSubtitlesTracks.length === 0)) {
            closeSubtitlesMenu();
        }
    }, [video.state.subtitlesTracks, video.state.extraSubtitlesTracks]);

    React.useEffect(() => {
        if (!Array.isArray(video.state.audioTracks) || video.state.audioTracks.length === 0) {
            closeAudioMenu();
        }
    }, [video.state.audioTracks]);

    React.useEffect(() => {
        if (video.state.playbackSpeed === null) {
            closeSpeedMenu();
        }
    }, [video.state.playbackSpeed]);

    React.useEffect(() => {
        const toastFilter = (item) => item?.dataset?.type === 'CoreEvent';
        toast.addFilter(toastFilter);
        const onCastStateChange = () => {
            setCasting(services.chromecast.active && services.chromecast.transport.getCastState() === cast.framework.CastState.CONNECTED);
        };
        const onChromecastServiceStateChange = () => {
            onCastStateChange();
            if (services.chromecast.active) {
                services.chromecast.transport.on(
                    cast.framework.CastContextEventType.CAST_STATE_CHANGED,
                    onCastStateChange
                );
            }
        };
        const onCoreEvent = ({ event }) => {
            if (event === 'PlayingOnDevice') {
                onPauseRequested();
            }
        };
        services.chromecast.on('stateChanged', onChromecastServiceStateChange);
        services.core.transport.on('CoreEvent', onCoreEvent);
        onChromecastServiceStateChange();
        return () => {
            toast.removeFilter(toastFilter);
            services.chromecast.off('stateChanged', onChromecastServiceStateChange);
            services.core.transport.off('CoreEvent', onCoreEvent);
            if (services.chromecast.active) {
                services.chromecast.transport.off(
                    cast.framework.CastContextEventType.CAST_STATE_CHANGED,
                    onCastStateChange
                );
            }
        };
    }, []);

    React.useEffect(() => {
        if (settings.pauseOnMinimize && (shell.windowClosed || shell.windowHidden)) {
            onPauseRequested();
        }
    }, [settings.pauseOnMinimize, shell.windowClosed, shell.windowHidden]);

    // Media Session PlaybackState
    React.useEffect(() => {
        if (!navigator.mediaSession) return;

        navigator.mediaSession.playbackState = !video.state.paused ? 'playing' : 'paused';

        return () => navigator.mediaSession.playbackState = 'none';
    }, [video.state.paused]);

    // Media Session Metadata
    React.useEffect(() => {
        if (!navigator.mediaSession) return;

        const metaItem = player.metaItem && player.metaItem?.type === 'Ready' ? player.metaItem.content : null;
        const videoId = player.selected ? player.selected?.streamRequest?.path?.id : null;
        const video = metaItem ? metaItem.videos.find(({ id }) => id === videoId) : null;

        const videoInfo = video && video.season && video.episode ? ` (${video.season}x${video.episode})`: null;
        const videoTitle = video ? `${video.title}${videoInfo}` : null;
        const metaTitle = metaItem ? metaItem.name : null;
        const imageUrl = metaItem ? metaItem.logo : null;

        const title = videoTitle ?? metaTitle;
        const artist = videoTitle ? metaTitle : undefined;
        const artwork = imageUrl ? [{ src: imageUrl }] : undefined;

        if (title) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title,
                artist,
                artwork,
            });
        }
    }, [player.metaItem, player.selected]);

    // Media Session Actions
    React.useEffect(() => {
        if (!navigator.mediaSession) return;

        navigator.mediaSession.setActionHandler('play', onPlayRequested);
        navigator.mediaSession.setActionHandler('pause', onPauseRequested);

        const nexVideoCallback = player.nextVideo ? onNextVideoRequested : null;
        navigator.mediaSession.setActionHandler('nexttrack', nexVideoCallback);
    }, [player.nextVideo, onPlayRequested, onPauseRequested, onNextVideoRequested]);

    React.useLayoutEffect(() => {
        const onKeyDown = (event) => {
            const codeOrKey = event.code || event.key;
            switch (codeOrKey) {
                case 'MediaPlayPause':
                case 'Space': {
                    if (!menusOpen && !nextVideoPopupOpen && video.state.paused !== null) {
                        if (video.state.paused) {
                            onPlayRequested();
                            setSeeking(false);
                        } else {
                            onPauseRequested();
                        }
                    }

                    break;
                }
                case 'Numpad6':
                case 'MediaTrackNext':
                case 'ArrowRight': {
                    if (!menusOpen && !nextVideoPopupOpen && video.state.time !== null) {
                        const seekDuration = event.shiftKey ? settings.seekShortTimeDuration : settings.seekTimeDuration;
                        setSeeking(true);
                        onSeekRequested(video.state.time + seekDuration);
                    }

                    break;
                }
                case 'Numpad4':
                case 'MediaTrackPrevious':
                case 'ArrowLeft': {
                    if (!menusOpen && !nextVideoPopupOpen && video.state.time !== null) {
                        const seekDuration = event.shiftKey ? settings.seekShortTimeDuration : settings.seekTimeDuration;
                        setSeeking(true);
                        onSeekRequested(video.state.time - seekDuration);
                    }

                    break;
                }
                case 'Numpad8':
                case 'ArrowUp': {
                    if (!menusOpen && !nextVideoPopupOpen && video.state.volume !== null) {
                        onVolumeChangeRequested(video.state.volume + 5);
                    }

                    break;
                }
                case 'Numpad2':
                case 'ArrowDown': {
                    if (!menusOpen && !nextVideoPopupOpen && video.state.volume !== null) {
                        onVolumeChangeRequested(Math.max(video.state.volume - 5, 0));
                    }

                    break;
                }
                case 'KeyS': {
                    if (event.ctrlKey) {
                        video.state.selectedSubtitlesTrackId
                            ? onSubtitlesTrackSelected(null)
                            : (storage.subtitleId.includes('EMBEDDED')
                                ? onSubtitlesTrackSelected
                                : onExtraSubtitlesTrackSelected)(storage.subtitleId);
                        break;
                    }
                    closeMenus();
                    if ((Array.isArray(video.state.subtitlesTracks) && video.state.subtitlesTracks.length > 0) ||
                        (Array.isArray(video.state.extraSubtitlesTracks) && video.state.extraSubtitlesTracks.length > 0)) {
                        toggleSubtitlesMenu();
                    }

                    break;
                }
                case 'KeyA': {
                    closeMenus();
                    if (Array.isArray(video.state.audioTracks) && video.state.audioTracks.length > 0) {
                        toggleAudioMenu();
                    }

                    break;
                }
                case 'KeyI': {
                    closeMenus();
                    if (player.metaItem !== null && player.metaItem.type === 'Ready') {
                        toggleSideDrawer();
                    }

                    break;
                }
                case 'KeyR': {
                    closeMenus();
                    if (video.state.playbackSpeed !== null) {
                        toggleSpeedMenu();
                    }

                    break;
                }
                case 'KeyD': {
                    closeMenus();
                    if (streamingServer.statistics !== null && streamingServer.statistics.type !== 'Err' && player.selected && typeof player.selected.stream.infoHash === 'string' && typeof player.selected.stream.fileIdx === 'number') {
                        toggleStatisticsMenu();
                    }

                    break;
                }
                case 'Escape': {
                    closeMenus();
                    !settings.escExitFullscreen && window.history.back();
                    break;
                }
                default: {
                    /*
                      * Mpv input.conf wants literal keys, we do the following to convert:
                      * 1) Map special event.code values to mpv-friendly names (e.g., ArrowLeft → LEFT).
                      * 2) Convert modifiers (Shift, Ctrl, Alt, Meta) into mpv’s SHIFT+, CTRL+, ALT+, META+ prefixes.
                      * 3) For plain letters or digits, remove "Key", "Digit", "Numpad", etc. from event.code.
                      * 4) Ensure correct casing.
                      *
                      * Note that mpv accepts either symbolic names (e.g., LEFT, SHIFT+LEFT) or literal characters
                      * (e.g. "a", or "!" if Shift+1). According to mpv docs, either approach works
                      * We'll generally use modifiers (e.g., SHIFT+1) for shifted digits or punctuation, plus
                      * symbolic names for non-character keys.
                    */
                    const specialMap = {
                        'ArrowLeft': 'LEFT',
                        'ArrowRight': 'RIGHT',
                        'ArrowUp': 'UP',
                        'ArrowDown': 'DOWN',
                        'Space': 'SPACE',
                        'Enter': 'ENTER',
                        'Escape': 'ESC',
                        'Backspace': 'BS',
                        'Tab': 'TAB',
                        'PrintScreen': 'PRINT_SCREEN',
                        'ScrollLock': 'SCROLL_LOCK',
                        'Pause': 'PAUSE',
                        'Insert': 'INSERT',
                        'Home': 'HOME',
                        'PageUp': 'PAGE_UP',
                        'Delete': 'DELETE',
                        'End': 'END',
                        'PageDown': 'PAGE_DOWN',
                        'NumpadAdd': 'KP_PLUS',
                        'NumpadSubtract': 'KP_MINUS',
                        'NumpadMultiply': 'KP_MULTIPLY',
                        'NumpadDivide': 'KP_DIVIDE',
                        'NumpadEnter': 'KP_ENTER',
                        'NumpadDecimal': 'KP_PERIOD',
                        'Numpad0': 'KP0',
                        'Numpad1': 'KP1',
                        'Numpad2': 'KP2',
                        'Numpad3': 'KP3',
                        'Numpad4': 'KP4',
                        'Numpad5': 'KP5',
                        'Numpad6': 'KP6',
                        'Numpad7': 'KP7',
                        'Numpad8': 'KP8',
                        'Numpad9': 'KP9',
                        'Comma': ',',
                        'Period': '.',
                        'Slash': '/',
                        'Semicolon': ';',
                        'Quote': '\'',
                        'BracketLeft': '[',
                        'BracketRight': ']',
                        'Backslash': '\\',
                        'Minus': '-',
                        'Equal': '=',
                        'Backquote': '`',
                        'CapsLock': ''
                    };

                    if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
                        break;
                    }
                    let baseKey = specialMap[event.code];
                    if (!baseKey) {
                        baseKey = event.code
                            .replace(/^Key/, '')
                            .replace(/^Digit/, '')
                            .replace(/^Numpad/, '');
                    }

                    const modifiers = [];
                    if (event.shiftKey && event.code !== 'Shift') modifiers.push('SHIFT');
                    if (event.ctrlKey && event.code !== 'Control') modifiers.push('CTRL');
                    if (event.altKey && event.code !== 'Alt') modifiers.push('ALT');
                    if (event.metaKey && event.code !== 'Meta') modifiers.push('META');

                    let finalKey;
                    if (modifiers.length > 0) {
                        finalKey = modifiers.join('+') + '+' + baseKey;
                    } else {
                        finalKey = /^[A-Z0-9]$/i.test(baseKey) ? baseKey.toLowerCase() : baseKey;
                    }

                    if (finalKey && shell.active) {
                        shell.send('mpv-command', ['keypress', finalKey]);
                    }
                    break;
                }
            }
        };
        const onKeyUp = (event) => {
            switch (event.code) {
                case 'ArrowRight':
                case 'ArrowLeft':
                case 'Numpad6':
                case 'Numpad4':
                case 'MediaTrackPrevious':
                case 'MediaTrackNext':
                    setSeeking(false);
                    break;
            }
        };
        const onWheel = ({ deltaY }) => {
            if (menusOpen || video.state.volume === null) return;

            if (deltaY > 0) {
                onVolumeChangeRequested(Math.max(video.state.volume - 5, 0));
            } else {
                onVolumeChangeRequested(video.state.volume + 5);
            }
        };
        if (routeFocused) {
            window.addEventListener('keydown', onKeyDown);
            window.addEventListener('keyup', onKeyUp);
            window.addEventListener('wheel', onWheel);
        }
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('wheel', onWheel);
        };
    }, [player.metaItem, player.selected, streamingServer.statistics, settings.seekTimeDuration, settings.seekShortTimeDuration, settings.escExitFullscreen, routeFocused, menusOpen, nextVideoPopupOpen, video.state.paused, video.state.time, video.state.volume, video.state.audioTracks, video.state.subtitlesTracks, video.state.extraSubtitlesTracks, video.state.playbackSpeed, toggleSubtitlesMenu, toggleStatisticsMenu, toggleSideDrawer]);

    React.useEffect(() => {
        video.events.on('error', onError);
        video.events.on('ended', onEnded);
        video.events.on('implementationChanged', onImplementationChanged);
        document.addEventListener('visibilitychange', onVisibilityChange);

        if (shell.active && profile.settings.hardwareDecoding) {
            shell.send('mpv-set-prop', ['hwdec', 'auto-safe']);
            shell.send('mpv-set-prop', ['hwdec-codecs', 'all']);
        } else if (shell.active) {
            shell.send('mpv-set-prop', ['hwdec', 'no']);
            shell.send('mpv-set-prop', ['hwdec-codecs', 'h264,vc1,hevc,vp8,vp9,av1,prores']);
        }

        shell.send('mpv-set-prop', ['subs-with-matching-audio', { forced: 'forced', off: 'no', default: 'yes' }[storage.subtitleSelectionMode]]);
        shell.send('mpv-set-prop', ['subs-match-os-language', 'no']);
        shell.send('mpv-set-prop', ['subs-fallback', 'no']);
        shell.send('mpv-set-prop', ['subs-fallback-forced', 'no']);
        shell.send('mpv-set-prop', ['speed', storage.playbackSpeed]);

        return () => {
            video.events.off('error', onError);
            video.events.off('ended', onEnded);
            video.events.off('implementationChanged', onImplementationChanged);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, []);

    React.useLayoutEffect(() => {
        return () => {
            setImmersedDebounced.cancel();
            onPlayRequestedDebounced.cancel();
            onPauseRequestedDebounced.cancel();
        };
    }, []);

    return (
        <div className={classnames(styles['player-container'], { [styles['overlayHidden']]: overlayHidden })}
             onMouseDown={onContainerMouseDown}
             onMouseMove={onContainerMouseMove}
             onMouseOver={onContainerMouseMove}
             onMouseLeave={onContainerMouseLeave}>
            <Video
                ref={video.containerElement}
                className={styles['layer']}
                onClick={onVideoClick}
                onDoubleClick={onVideoDoubleClick}
            />
            {
                !video.state.loaded ?
                    <div className={classnames(styles['layer'], styles['background-layer'])}>
                        <img className={styles['image']} src={player?.metaItem?.content?.background} />
                    </div>
                    :
                    null
            }
            {
                (video.state.buffering || !video.state.loaded) && !error ?
                    <BufferingLoader
                        ref={bufferingRef}
                        className={classnames(styles['layer'], styles['buffering-layer'])}
                        logo={player?.metaItem?.content?.logo}
                    />
                    :
                    null
            }
            {
                error !== null ?
                    <Error
                        ref={errorRef}
                        className={classnames(styles['layer'], styles['error-layer'])}
                        stream={video.state.stream}
                        {...error}
                    />
                    :
                    null
            }
            {
                menusOpen ?
                    <div className={styles['layer']} />
                    :
                    null
            }
            {
                video.state.volume !== null && overlayHidden ?
                    <VolumeChangeIndicator
                        muted={video.state.muted}
                        volume={video.state.volume}
                    />
                    :
                    null
            }
            <ContextMenu on={[video.containerElement, bufferingRef, errorRef]} autoClose>
                <OptionsMenu
                    className={classnames(styles['layer'], styles['menu-layer'])}
                    stream={player?.selected?.stream}
                    playbackDevices={playbackDevices}
                />
            </ContextMenu>
            <HorizontalNavBar
                className={classnames(styles['layer'], styles['nav-bar-layer'])}
                title={player.title !== null ? player.title : ''}
                backButton={true}
                fullscreenButton={true}
                onMouseMove={onBarMouseMove}
                onMouseOver={onBarMouseMove}
            />
            {
                player.metaItem?.type === 'Ready' ?
                    <SideDrawerButton
                        className={classnames(styles['layer'], styles['side-drawer-button-layer'])}
                        onClick={toggleSideDrawer}
                    />
                    :
                    null
            }
            <ControlBar
                className={classnames(styles['layer'], styles['control-bar-layer'])}
                paused={video.state.paused}
                time={video.state.time}
                duration={video.state.duration}
                buffered={video.state.buffered}
                volume={video.state.volume}
                muted={video.state.muted}
                playbackSpeed={video.state.playbackSpeed}
                subtitlesTracks={video.state.subtitlesTracks.concat(video.state.extraSubtitlesTracks)}
                audioTracks={video.state.audioTracks}
                metaItem={player.metaItem}
                nextVideo={player.nextVideo}
                stream={player.selected !== null ? player.selected.stream : null}
                statistics={statistics}
                onPlayRequested={onPlayRequested}
                onPauseRequested={onPauseRequested}
                onNextVideoRequested={onNextVideoRequested}
                onMuteRequested={onMuteRequested}
                onUnmuteRequested={onUnmuteRequested}
                onVolumeChangeRequested={onVolumeChangeRequested}
                onSeekRequested={onSeekRequested}
                onToggleOptionsMenu={toggleOptionsMenu}
                onToggleSubtitlesMenu={toggleSubtitlesMenu}
                onToggleAudioMenu={toggleAudioMenu}
                onToggleSpeedMenu={toggleSpeedMenu}
                onToggleStatisticsMenu={toggleStatisticsMenu}
                onToggleSideDrawer={toggleSideDrawer}
                onMouseMove={onBarMouseMove}
                onMouseOver={onBarMouseMove}
                onTouchEnd={onContainerMouseLeave}
            />
            {
                nextVideoPopupOpen ?
                    <NextVideoPopup
                        className={classnames(styles['layer'], styles['menu-layer'])}
                        metaItem={player.metaItem !== null && player.metaItem.type === 'Ready' ? player.metaItem.content : null}
                        nextVideo={player.nextVideo}
                        onDismiss={onDismissNextVideoPopup}
                        altThumbnail={getAltThumbnail(player?.nextVideo, player.seriesInfo?.season)}
                        onNextVideoRequested={onNextVideoRequested}
                    />
                    :
                    null
            }
            {
                statisticsMenuOpen ?
                    <StatisticsMenu
                        className={classnames(styles['layer'], styles['menu-layer'])}
                        {...statistics}
                    />
                    :
                    null
            }
            <Transition when={sideDrawerOpen} name={'slide-left'}>
                <SideDrawer
                    className={classnames(styles['layer'], styles['side-drawer-layer'])}
                    metaItem={player.metaItem?.content}
                    seriesInfo={player.seriesInfo}
                    closeSideDrawer={closeSideDrawer}
                />
            </Transition>
            {
                subtitlesMenuOpen ?
                    <SubtitlesMenu
                        className={classnames(styles['layer'], styles['menu-layer'])}
                        subtitlesTracks={video.state.subtitlesTracks}
                        selectedSubtitlesTrackId={video.state.selectedSubtitlesTrackId}
                        subtitlesOffset={video.state.subtitlesOffset}
                        subtitlesSize={video.state.subtitlesSize}
                        subtitlesDelay={video.state.subtitlesDelay}
                        onSubtitlesDelayChanged={onSubtitlesDelayChanged}
                        extraSubtitlesTracks={video.state.extraSubtitlesTracks}
                        selectedExtraSubtitlesTrackId={video.state.selectedExtraSubtitlesTrackId}
                        extraSubtitlesOffset={video.state.extraSubtitlesOffset}
                        extraSubtitlesDelay={video.state.extraSubtitlesDelay}
                        extraSubtitlesSize={video.state.extraSubtitlesSize}
                        onSubtitlesTrackSelected={onSubtitlesTrackSelected}
                        onExtraSubtitlesTrackSelected={onExtraSubtitlesTrackSelected}
                        onSubtitlesOffsetChanged={onSubtitlesOffsetChanged}
                        onSubtitlesSizeChanged={onSubtitlesSizeChanged}
                        onExtraSubtitlesOffsetChanged={onSubtitlesOffsetChanged}
                        onExtraSubtitlesDelayChanged={onExtraSubtitlesDelayChanged}
                        onExtraSubtitlesSizeChanged={onSubtitlesSizeChanged}
                        onSubtitlesTrackChoosen={onSubtitlesTrackChoosen}
                        externalEmbedded={externalEmbedded}
                        setExternalEmbedded={setExternalEmbedded}
                    />
                    :
                    null
            }
            {
                audioMenuOpen ?
                    <AudioMenu
                        className={classnames(styles['layer'], styles['menu-layer'])}
                        audioTracks={video.state.audioTracks}
                        selectedAudioTrackId={video.state.selectedAudioTrackId}
                        onAudioTrackSelected={onAudioTrackSelected}
                    />
                    :
                    null
            }
            {
                speedMenuOpen ?
                    <SpeedMenu
                        className={classnames(styles['layer'], styles['menu-layer'])}
                        playbackSpeed={video.state.playbackSpeed}
                        onPlaybackSpeedChanged={onPlaybackSpeedChanged}
                    />
                    :
                    null
            }
            {
                optionsMenuOpen ?
                    <OptionsMenu
                        className={classnames(styles['layer'], styles['menu-layer'])}
                        stream={player.selected.stream}
                        playbackDevices={playbackDevices}
                    />
                    :
                    null
            }
        </div>
    );
};

Player.propTypes = {
    urlParams: PropTypes.shape({
        stream: PropTypes.string,
        streamTransportUrl: PropTypes.string,
        metaTransportUrl: PropTypes.string,
        type: PropTypes.string,
        id: PropTypes.string,
        videoId: PropTypes.string
    }),
    queryParams: PropTypes.instanceOf(URLSearchParams)
};

const PlayerFallback = () => (
    <div className={classnames(styles['player-container'])} />
);

module.exports = withCoreSuspender(Player, PlayerFallback);
