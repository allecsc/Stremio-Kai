// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const EMPTY_EXTENSIONS = Object.freeze([]);

// Current cores omit this legacy field. Keep old-core tabs when supplied.
const useMetaExtensionTabs = (metaExtensions = EMPTY_EXTENSIONS) => {
    const tabs = React.useMemo(() => {
        return metaExtensions
            .map((extension) => ({
                id: extension.url,
                label: extension.addon.manifest.name,
                logo: extension.addon.manifest.logo,
                icon: 'addons',
                onClick: () => setSelected(extension)
            }));
    }, [metaExtensions]);
    const [selected, setSelected] = React.useState(null);
    const clear = React.useCallback(() => {
        setSelected(null);
    }, []);
    return [tabs, selected, clear];
};

module.exports = useMetaExtensionTabs;
