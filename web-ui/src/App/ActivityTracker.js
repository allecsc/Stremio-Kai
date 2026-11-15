const React = require('react');
const {useShell, useStorage} = require('stremio/common');

const ActivityTracker = () => {
    const shell = useShell();
    const [storage,] = useStorage();

    React.useEffect(() => {
        const handleHashChange = () => {
            const path = window.location.hash.slice(1); // remove '#' from '#/addons'

            // Routes handled in src -> /player | /detail
            if (path.startsWith('/player') || path.startsWith('/detail')) {
                return;
            }

            if (!storage.isDiscordRpcOn) {
                shell.send('activity', ['clear']);
                return;
            }

            if (path.startsWith('/discover')) {
                shell.send('activity', ['discover']);
            } else if (path.startsWith('/library')) {
                shell.send('activity', ['library']);
            } else if (path.startsWith('/calendar')) {
                shell.send('activity', ['calendar']);
            } else if (path.startsWith('/addons')) {
                shell.send('activity', ['addons']);
            } else if (path.startsWith('/settings')) {
                shell.send('activity', ['settings']);
            } else if (path.startsWith('/search')) {
                shell.send('activity', ['search']);
            } else if (path === '/' || path.startsWith('/board')) {
                shell.send('activity', ['board']);
            } else {
                shell.send('activity', ['board']);
            }
        };

        window.addEventListener('hashchange', handleHashChange);
        handleHashChange();

        return () => window.removeEventListener('hashchange', handleHashChange);
    }, [shell, storage]);

    return null;
};

module.exports = ActivityTracker;
