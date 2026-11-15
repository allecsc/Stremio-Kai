const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const { Image } = require('stremio/components');
const styles = require('./styles');
const {useServices} = require('stremio/services');

const UpdateDialogHandler = ({ className }) => {
    const { shell } = useServices();

    const onUpdateClick = () => {
        shell.transport.send('update-requested', {});
    };

    const onLaterClick = () => {
        const dialog = document.getElementById('update-dialog');
        if (dialog) {
            dialog.style.display = 'none';
        }
    };

    return (
        <div
            id="update-dialog"
            className={classnames(className, styles['update-container'])}
            style={{ display: 'none' }}
        >
            <Image
                className={styles['update-image']}
                src={require('/images/icon.png')}
                alt={' '}
            />
            <div className={styles['update-text']}>
                Stremio update available!
            </div>
            <div className={styles['button-row']}>
                <button
                    className={styles['update-button']}
                    onClick={onUpdateClick}
                >
                    Update
                </button>
                <button
                    className={styles['later-button']}
                    onClick={onLaterClick}
                >
                    Later
                </button>
            </div>
        </div>
    );
};

UpdateDialogHandler.displayName = 'UpdateDialogHandler';

UpdateDialogHandler.propTypes = {
    className: PropTypes.string,
};

module.exports = UpdateDialogHandler;
