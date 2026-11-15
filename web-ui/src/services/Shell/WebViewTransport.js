const EventEmitter = require('eventemitter3');
const pako = require('pako');

let shellAvailable = false;
const shellEvents = new EventEmitter();

if (!window.qt) {
    window.initShellComm = function () {
        delete window.initShellComm;
        shellEvents.emit('availabilityChanged');
    };
}

const initialize = () => {
    if(!window.chrome || !window.chrome.webview) return Promise.reject('Qt API not found');
    return new Promise((resolve) => {
        function onShellAvailabilityChanged() {
            shellEvents.off('availabilityChanged', onShellAvailabilityChanged);
            shellAvailable = true;
            window.qt = function () { console.error('This is fake its really Webview'); };
            resolve();
        }
        if (shellAvailable) {
            onShellAvailabilityChanged();
        } else {
            shellEvents.on('availabilityChanged', onShellAvailabilityChanged);
        }
    });
};

const showDialogWhenExists = () => {
    const dialog = document.getElementById('update-dialog');
    if (dialog) {
        dialog.style.display = 'flex';
    } else {
        setTimeout(showDialogWhenExists, 100);
    }
};

const playLocalFile = (filepath) => {
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
};

function WebViewTransport( { core } ) {
    const events = new EventEmitter();

    this.props = {};

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const shell = this;

    initialize()
        .then(() => {
            const transport = {};

            let msgId = 0;
            transport.send = function (ev, args) {
                const msg = {
                    id: msgId++,
                    event: ev,
                    args: args || [],
                };
                window.chrome.webview.postMessage(JSON.stringify(msg));
            };

            shell.send = function (ev, args) {
                transport.send(ev, args);
            };

            window.chrome.webview.addEventListener('message', (e) => {
                const nativeMsg = e.data;

                if (nativeMsg && typeof nativeMsg === 'object') {
                    switch (nativeMsg.type) {
                        case 'shellVersion':
                            if (typeof nativeMsg.value === 'string') {
                                shell.shellVersionArr = (
                                    nativeMsg.value.match(/(\d+)\.(\d+)\.(\d+)/) || []
                                )
                                    .slice(1, 4)
                                    .map(Number);
                            }
                            events.emit('received-props', shell.props);
                            break;
                        case 'requestUpdate':
                            showDialogWhenExists();
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
                        case 'FileDropped': {
                            playLocalFile(nativeMsg.path);
                            break;
                        }
                        case 'AddonInstall': {
                            const addonPath = nativeMsg.path.replace('stremio://', 'https://');
                            window.location.assign('#/addons?addon=' + addonPath);
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
                            events.emit(nativeMsg.type, nativeMsg);
                            break;
                    }
                }
            });

            shell.send('app-ready', {});
            events.emit('init');
        })
        .catch((error) => {
            events.emit('init-error', error);
        });

    // standard event methods
    this.on = function (name, listener) {
        events.on(name, listener);
    };
    this.off = function (name, listener) {
        events.off(name, listener);
    };
    this.removeAllListeners = function () {
        events.removeAllListeners();
    };
}

module.exports = WebViewTransport;
