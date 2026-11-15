import React, { useEffect } from 'react';
import Icon from '@stremio/stremio-icons/react';
import { useTranslation } from 'react-i18next';
import { useServices } from 'stremio/services';
import { useBinaryState, useShell } from 'stremio/common';
import { Button, Transition } from 'stremio/components';
import styles from './UpdaterBanner.less';

type Props = {
    className: string,
};

const UpdaterBanner = ({ className }: Props) => {
    const { t } = useTranslation();
    const { shell } = useServices();
    const shellTransport = useShell();
    const [visible, show, hide] = useBinaryState(false);

    const onInstallClick = () => {
        shellTransport.send('autoupdater-notif-clicked');
    };

    useEffect(() => {
        shell.transport && shell.transport.on('autoupdater-show-notif', show);

        return () => {
            shell.transport && shell.transport.off('autoupdater-show-notif', show);
        };
    }, []);

    return (
        <div className={className}>
            <Transition when={visible} name={'slide-up'}>
                <div className={styles['updater-banner']}>
                    <div className={styles['label']}>
                        { t('UPDATER_TITLE') }
                    </div>
                    <Button className={styles['button']} onClick={onInstallClick}>
                        { t('UPDATER_INSTALL_BUTTON') }
                    </Button>
                    <Button className={styles['close']} onClick={hide}>
                        <Icon className={styles['icon']} name={'close'} />
                    </Button>
                </div>
            </Transition>
        </div>
    );
};

export default UpdaterBanner;
