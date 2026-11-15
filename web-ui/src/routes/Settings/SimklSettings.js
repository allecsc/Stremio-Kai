const React = require('react');
const classnames = require('classnames');
const { Button, Toggle } = require('stremio/components');
const styles = require('./styles');

function send(name, args = []) {
    window.chrome.webview.postMessage(JSON.stringify({ type: 6, object: 'transport', method: 'onEvent', args: [name, args] }));
}

function SimklSettings() {
    const [status, setStatus] = React.useState(null);
    React.useEffect(() => {
        if (!window.kaiNativeSimkl) return;
        const receive = ({ data }) => {
            try {
                const event = typeof data === 'string' ? JSON.parse(data) : data;
                if (event.type === 1 && event.args?.[0] === 'simkl-status' && typeof event.args[1] === 'object') {
                    setStatus(event.args[1]);
                }
            } catch (_) { /* Other shell messages are handled by their existing listeners. */ }
        };
        window.chrome.webview.addEventListener('message', receive);
        send('simkl-status');
        return () => window.chrome.webview.removeEventListener('message', receive);
    }, []);
    if (!window.kaiNativeSimkl) return null;
    const action = status?.connecting ? 'Cancel connection' : status?.connected ? 'Disconnect' : 'Connect';
    return <>
        <div className={styles['option-container']}>
            <div className={styles['option-name-container']}>
                <div className={styles['label']}>Simkl Scrobbling</div>
            </div>
            <Button className={classnames(styles['option-input-container'], styles['button-container'])}
                title={action + ' Simkl'} role={'button'} disabled={!status}
                onClick={() => status && send(status.connected || status.connecting ? 'simkl-disconnect' : 'simkl-connect')}>
                <div className={styles['label']}>{action}</div>
            </Button>
        </div>
        <div className={styles['option-container']}>
            <div className={styles['option-name-container']}>
                <div className={styles['label']}>Enable Simkl Scrobbling</div>
            </div>
            <Toggle className={classnames(styles['option-input-container'], styles['toggle-container'])}
                title={'Enable Simkl Scrobbling'} role={'switch'} aria-checked={!!status?.enabled}
                checked={!!status?.enabled} disabled={!status}
                onClick={() => status && send('simkl-enable', [String(!status.enabled)])} />
        </div>
        <div className={styles['option-container']} role={'status'} aria-live={'polite'}>
            <div className={styles['option-name-container']}>
                <div className={styles['label']}>{status?.message || 'Loading Simkl status…'}</div>
            </div>
        </div>
    </>;
}

module.exports = SimklSettings;
