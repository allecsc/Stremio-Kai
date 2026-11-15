// Copyright (C) 2017-2025 Smart code 203358507

import { useState, useEffect, useMemo } from 'react';

type DeviceOrientation = 'landscape' | 'portrait';

const useOrientation = () => {
    const [windowHeight, setWindowHeight] = useState(window.innerHeight);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);

    const orientation: DeviceOrientation = useMemo(() => {
        if (windowHeight > windowWidth) {
            return 'portrait';
        } else {
            return 'landscape';
        }
    }, [windowWidth, windowHeight]);

    useEffect(() => {
        const handleResize = () => {
            setWindowHeight(window.innerHeight);
            setWindowWidth(window.innerWidth);
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [window.innerWidth, window.innerHeight]);

    return orientation;
};

export default useOrientation;
