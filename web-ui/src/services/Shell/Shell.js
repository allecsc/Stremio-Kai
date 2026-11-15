// Copyright (C) 2017-2023 Smart code 203358507

const EventEmitter = require('eventemitter3');
const ShellTransport = require('./ShellTransport');
const WebViewTransport = require('./WebViewTransport');
const pako = require('pako');

function Shell({ core }) {
    let active = false;
    let error = null;
    let starting = false;
    let transport = null;

    const events = new EventEmitter();

    function onTransportInit() {
        active = true;
        error = null;
        starting = false;
        onStateChanged();
    }
    function onTransportInitError(err) {
        console.error(err);
        active = false;
        error = new Error(err);
        starting = false;
        onStateChanged();
        transport = null;
    }

    function playLocalFile(filepath) {
        const decodedPath = decodeURIComponent(filepath);
        const fileName = decodedPath.split(/[\\/]/).pop();
        const filePathPayload = {
            url: decodedPath,
            behaviorHints: {
                filename: fileName,
            }
        };
        const compressedPayload = pako.deflate(JSON.stringify(filePathPayload));
        const base64String = Buffer.from(compressedPayload).toString('base64');
        const urlSafeString = encodeURIComponent(base64String);
        window.location.assign('#/player/' + urlSafeString);
    }

    function showDialogWhenExists() {
        const dialog = document.getElementById('update-dialog');
        if (dialog) {
            dialog.style.display = 'flex';
        } else {
            setTimeout(showDialogWhenExists, 100);
        }
    }

    function onAppEvent(event, nativeMsg) {
        switch (event) {
            case 'requestUpdate':
                showDialogWhenExists();
                break;
            case 'ReplaceLocation':
                window.location.assign(decodeURIComponent(nativeMsg.path.replace('stremio://', '#/')));
                break;
            case 'showPictureInPicture': {
                const pipOverlay = document.getElementById('pip-overlay');
                if (pipOverlay) pipOverlay.style.display = 'block';
                break;
            }
            case 'hidePictureInPicture': {
                const pipOverlay = document.getElementById('pip-overlay');
                if (pipOverlay) pipOverlay.style.display = 'none';
                break;
            }
            case 'SubtitleDropped': {
                const file_name = decodeURIComponent(nativeMsg.path.split(/[\\/]/).pop() || 'subtitle');
                events.emit('ShowToast', 'success', 'Added subtitle file', file_name, 4000);
                break;
            }
            case 'FileDropped': {
                playLocalFile(nativeMsg.path);
                break;
            }
            case 'AddonInstall': {
                if (nativeMsg.path.startsWith('stremio:///detail/')) {
                    const detailsPath = nativeMsg.path.replace('stremio://', '');
                    window.location.assign('#' + detailsPath);
                    break;
                }
                const addonPath = nativeMsg.path.replace('stremio://', 'https://');
                window.location.assign('#/addons?addon_url=' + addonPath);
                break;
            }
            case 'OpenFile': {
                playLocalFile(nativeMsg.path);
                break;
            }
            case 'OpenTorrent': {
                let argsData;
                if (nativeMsg.data) {
                    const uint8Array = new Uint8Array(nativeMsg.data);
                    argsData = Array.from(uint8Array);
                } else if (nativeMsg.magnet) {
                    argsData = nativeMsg.magnet;
                }
                if (!argsData) break;
                core.transport.dispatch({
                    action: 'StreamingServer',
                    args: {
                        action: 'CreateTorrent',
                        args: argsData
                    }
                });
                break;
            }
            case 'ServerStarted': {
                const reloadServer = () => {
                    core.transport.dispatch({
                        action: 'StreamingServer',
                        args: {
                            action: 'Reload',
                        },
                    });
                };
                if (core.active) {
                    reloadServer();
                } else {
                    const onCoreEvent = () => {
                        reloadServer();
                        core.transport.off('CoreEvent', onCoreEvent);
                    };
                    core.transport.on('CoreEvent', onCoreEvent);
                }
                break;
            }
            default:
                console.warn('Unknown onAppEvent Message: ' + nativeMsg);
                break;
        }
    }

    function onStateChanged() {
        events.emit('stateChanged');
    }

    Object.defineProperties(this, {
        active: {
            configurable: false,
            enumerable: true,
            get: function() {
                return active;
            }
        },
        error: {
            configurable: false,
            enumerable: true,
            get: function() {
                return error;
            }
        },
        starting: {
            configurable: false,
            enumerable: true,
            get: function() {
                return starting;
            }
        },
        transport: {
            configurable: false,
            enumerable: true,
            get: function() {
                return transport;
            }
        }
    });

    this.start = function() {
        if (active || error instanceof Error || starting) {
            return;
        }

        active = false;
        starting = true;
        if (window.qt) {
            console.log('Qt Transport');
            transport = new ShellTransport();
        } else {
            //For Backwards compatibility
            console.log('WebView Transport');
            transport = new WebViewTransport({ core });
        }
        transport.playLocalFile = playLocalFile;
        transport.on('init', onTransportInit);
        transport.on('init-error', onTransportInitError);
        // General AppEvents
        transport.on('requestUpdate', (data) => onAppEvent('requestUpdate', data));
        transport.on('showPictureInPicture', (data) => onAppEvent('showPictureInPicture', data));
        transport.on('hidePictureInPicture', (data) => onAppEvent('hidePictureInPicture', data));
        transport.on('FileDropped', (data) => onAppEvent('FileDropped', data));
        transport.on('SubtitleDropped', (data) => onAppEvent('SubtitleDropped', data));
        transport.on('AddonInstall', (data) => onAppEvent('AddonInstall', data));
        transport.on('OpenFile', (data) => onAppEvent('OpenFile', data));
        transport.on('OpenTorrent', (data) => onAppEvent('OpenTorrent', data));
        transport.on('ServerStarted', (data) => onAppEvent('ServerStarted', data));
        transport.on('ReplaceLocation', (data) => onAppEvent('ReplaceLocation', data));
        onStateChanged();
    };
    this.stop = function() {
        active = false;
        error = null;
        starting = false;
        onStateChanged();
    };
    this.on = function(name, listener) {
        events.on(name, listener);
    };
    this.off = function(name, listener) {
        events.off(name, listener);
    };
}

module.exports = Shell;
