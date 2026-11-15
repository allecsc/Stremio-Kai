import React, { createContext, useContext, useState, useEffect } from 'react';

interface StorageData {
    lastVideo: string;
    subtitleId: string;
    audioTrackId: string;
    subtitlePriorityKeywords: string[];
    subtitleSelectionMode: string;
    defaultSubtitleLanguages: string[];
    defaultAudioLanguages: string[];
    allowedSubtitleLanguages: string[];
    allowedAudioLanguages: string[];
    rememberTrackSelection: boolean;
    showSubTrackLoadedToast: boolean;
    useMpvForExternalSubtitles: boolean;
    embeddedSubDelay: boolean;
    isDiscordRpcOn: boolean;
    parseOnPaste: boolean;
    maxVolume: string;
    playbackSpeed: string;
}

// Central default values for storage data
const localProfile: StorageData = {
    lastVideo: '',
    subtitleId: '',
    audioTrackId: '',
    subtitlePriorityKeywords: ['full', 'dialogue'],
    subtitleSelectionMode: 'default',
    defaultSubtitleLanguages: ['eng'],
    defaultAudioLanguages: ['eng'],
    allowedSubtitleLanguages: ['any'],
    allowedAudioLanguages: ['any'],
    rememberTrackSelection: true,
    showSubTrackLoadedToast: true,
    useMpvForExternalSubtitles: true,
    embeddedSubDelay: true,
    isDiscordRpcOn: true,
    parseOnPaste: true,
    maxVolume: '130',
    playbackSpeed: '1'
};

export const defaultsMultiSelect = {
    defaultPriorityKeywords: ['full', 'dialogue', 'signs', 'sings', 'songs', 'lyrics'].map((keyword) => ({
        value: keyword,
        label: keyword.charAt(0).toUpperCase() + keyword.slice(1)
    })),
    defaultMaxVolume: ['75', '100', '125', '130', '150', '175', '200', '225'].map((keyword) => ({
        value: keyword,
        label: keyword + '%'
    })),
    defaultPlaybackSpeed: ['0.5', '0.75', '1', '1.25', '1.5', '1.75', '2'].map((keyword) => ({
        value: keyword,
        label: keyword + 'x'
    })),
    defaultSubSelectionMode: [
        {
            value: 'default',
            label: 'Select Default Subtitle'
        },
        {
            value: 'forced',
            label: 'Select Forced Subtitle'
        },
        {
            value: 'off',
            label: 'Select Disabled'
        }
    ],
};

interface StorageContextType {
    storage: StorageData;
    updateStorage: (update: Partial<StorageData>) => void;
}

type Props = {
    children: JSX.Element;
};

const StorageContext = createContext<StorageContextType>({} as StorageContextType);

export const StorageProvider = ({ children }: Props) => {
    // Initialize the storage state from localStorage or fall back to the default.
    const [storage, setStorage] = useState<StorageData>(() => {
        try {
            const storedValue = localStorage.getItem('localProfile');
            if (storedValue) {
                const parsed = JSON.parse(storedValue);
                return { ...localProfile, ...parsed };
            } else {
                return localProfile;
            }
        } catch (error) {
            console.error('Error reading from localStorage:', error);
            return localProfile;
        }
    });

    // Sync the storage state to localStorage on every update.
    useEffect(() => {
        try {
            localStorage.setItem('localProfile', JSON.stringify(storage));
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    }, [storage]);

    // Helper to update the storage state by merging new values with the existing ones.
    const updateStorage = (update: Partial<StorageData>) => {
        setStorage((prev) => ({ ...prev, ...update }));
    };

    return (
        <StorageContext.Provider value={{ storage, updateStorage }}>
            {children}
        </StorageContext.Provider>
    );
};

// Custom hook returning an array so you can use array destructuring.
export const useStorage = (): [StorageData, (update: Partial<StorageData>) => void] => {
    const context = useContext(StorageContext);
    if (!context) {
        throw new Error('useStorage must be used within a StorageProvider');
    }
    return [context.storage, context.updateStorage] as const;
};
