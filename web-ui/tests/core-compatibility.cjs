// Exercise the real released WASM core against the retained Kai UI's API contract.
// A clean in-memory host is used; no account/profile credentials are loaded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const storage = new Map();
globalThis.self = globalThis;
globalThis.document = { baseURI: 'https://kai.local/' };
globalThis.WorkerGlobalScope = class { static [Symbol.hasInstance](value) { return value === globalThis; } };
globalThis.app_version = require('../package.json').version;
globalThis.shell_version = '5.0.22';
globalThis.client_info = JSON.stringify({ platform: 'desktop', os: 'windows' });
globalThis.get_location_hash = async () => '#/';
globalThis.local_storage_get_item = async key => storage.get(key) ?? null;
globalThis.local_storage_set_item = async (key, value) => { storage.set(key, value); };
globalThis.local_storage_remove_item = async key => { storage.delete(key); };
const core = require('@stremio/stremio-core-web');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const useMetaExtensionTabs = require('../src/routes/MetaDetails/useMetaExtensionTabs');
const shouldShowStreamingServerWarning = require('../src/common/shouldShowStreamingServerWarning');
function DetailsExtensions({ extensions }) {
    const [tabs] = useMetaExtensionTabs(extensions);
    return React.createElement('nav', null, tabs.map(tab =>
        React.createElement('span', { key: tab.id }, tab.label)));
}
(async () => {
    const binary = fs.readFileSync(path.join(path.dirname(require.resolve('@stremio/stremio-core-web')), 'stremio_core_web_bg.wasm'));
    await core.default({ module_or_path: binary });
    await core.initialize_runtime(() => {});
    const server = core.get_state('streaming_server');
    assert.equal(server.settings.type, 'Loading', 'server discovery starts in Loading');
    assert.equal(shouldShowStreamingServerWarning(server.settings, new Date(NaN)), false,
        'initial server discovery must not display an unavailable warning');
    const ctx = core.get_state('ctx');
    assert.ok(ctx.profile.settings, 'retained Settings expects ctx.profile.settings');
    assert.ok(Array.isArray(ctx.profile.addons), 'retained Addons expects profile.addons');
    core.dispatch({ action: 'Ctx', args: { action: 'UpdateSettings', args: {
        ...ctx.profile.settings, pauseOnMinimize: !ctx.profile.settings.pauseOnMinimize,
    } } }, undefined, '#/settings');
    assert.equal(core.get_state('ctx').profile.settings.pauseOnMinimize, !ctx.profile.settings.pauseOnMinimize);
    core.dispatch({ action: 'Load', args: { model: 'LibraryWithFilters', args: {
        request: { type: null },
    } } }, 'library', '#/library');
    assert.ok(core.get_state('library'), 'retained library load schema is accepted');
    for (const [type, id, videoId] of [
        ['movie', 'tt1254207', 'tt1254207'],
        ['series', 'tt14134550', 'tt14134550:1:1'],
    ]) {
        core.dispatch({ action: 'Load', args: { model: 'MetaDetails', args: {
            metaPath: { resource: 'meta', type, id, extra: [] },
            streamPath: { resource: 'stream', type, id: videoId, extra: [] },
            guessStream: true,
        } } }, 'meta_details', '#/detail');
        const details = core.get_state('meta_details');
        assert.equal(details.selected.metaPath.id, id);
        assert.equal(renderToStaticMarkup(React.createElement(DetailsExtensions, {
            extensions: details.metaExtensions,
        })), '<nav></nav>', 'title details must render when the new core omits legacy metaExtensions');
        core.dispatch({ action: 'Unload' }, 'meta_details', '#/');
    }
    assert.equal(renderToStaticMarkup(React.createElement(DetailsExtensions, {
        extensions: [{ url: 'https://example.com/extension', addon: { manifest: { name: 'Legacy extension' } } }],
    })), '<nav><span>Legacy extension</span></nav>', 'legacy core extension tabs remain supported');
    const player = core.get_state('player');
    assert.equal(player.selected, null);
    const stream = { url: 'https://example.com/fixture.mp4' };
    const encoded = core.encode_stream(stream);
    assert.equal(core.decode_stream(encoded).url, stream.url);
    core.dispatch({ action: 'Load', args: { model: 'Player', args: {
        stream, streamRequest: null, metaRequest: null, subtitlesPath: null,
    } } }, 'player', '#/player');
    assert.equal(core.get_state('player').selected.stream.url, stream.url,
        'retained Player load schema must be accepted by the upgraded core');
    for (const action of [
        { action: 'PausedChanged', args: { paused: true } },
        { action: 'TimeChanged', args: { time: 30000, duration: 60000, device: 'ShellVideo' } },
        { action: 'Seek', args: { time: 40000, duration: 60000, device: 'ShellVideo' } },
        { action: 'Ended' },
    ]) core.dispatch({ action: 'Player', args: action }, 'player', '#/player');
    core.dispatch({ action: 'Unload' }, 'player', '#/');
    console.log('Core 0.67.1: settings/library/title-details rendering, legacy extension tabs, stream encoding and playback contracts passed.');
    process.exit(0); // The core owns streaming-server discovery timers in a real application.
})().catch(error => { console.error(error); process.exit(1); });
