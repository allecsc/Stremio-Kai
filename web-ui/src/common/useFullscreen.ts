// Copyright (C) 2017-2023 Smart code 203358507

import { useCallback, useEffect, useState } from 'react';

const useFullscreen = () => {
    const [fullscreen, setFullscreen] = useState(document.fullscreenElement === document.documentElement);
    const requestFullscreen = useCallback(() => {
        document.documentElement.requestFullscreen();
    }, []);
    const exitFullscreen = useCallback(() => {
        document.exitFullscreen();
    }, []);
    const toggleFullscreen = useCallback(() => {
        if (fullscreen) {
            exitFullscreen();
        } else {
            requestFullscreen();
        }
    }, [fullscreen]);
    useEffect(() => {
        const onFullscreenChange = () => {
            setFullscreen(document.fullscreenElement === document.documentElement);
        };
        document.addEventListener('fullscreenchange', onFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', onFullscreenChange);
        };
    }, []);
    return [fullscreen, requestFullscreen, exitFullscreen, toggleFullscreen];
};

export default useFullscreen;
