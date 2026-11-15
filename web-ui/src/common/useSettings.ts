// Copyright (C) 2017-2025 Smart code 203358507

import { useCallback } from 'react';
import { useServices } from 'stremio/services';
import useProfile from './useProfile';

const useSettings = (): [Settings, (settings: Settings) => void] => {
    const { core } = useServices();
    const profile = useProfile();

    const updateSettings = useCallback((settings: Settings) => {
        core.transport.dispatch({
            action: 'Ctx',
            args: {
                action: 'UpdateSettings',
                args: {
                    ...profile.settings,
                    ...settings
                }
            }
        });
    }, [profile]);

    return [profile.settings, updateSettings];
};

export default useSettings;
