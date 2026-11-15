// Copyright (C) 2017-2023 Smart code 203358507

import React, { useCallback } from 'react';
import {string, bool, object, func} from 'prop-types';
import classnames from 'classnames';
import {default as Icon} from '@stremio/stremio-icons/react';
import {Button} from 'stremio/components';
import styles from './styles.less';

const DiscreteSelectInput = ({className, value, label, disabled, dataset, onChange}) => {
    const buttonOnClick = useCallback((event) => {
        if (typeof onChange === 'function') {
            onChange({
                type: 'change',
                value: event.currentTarget.dataset.type,
                dataset: dataset,
                reactEvent: event,
                nativeEvent: event.nativeEvent
            });
        }
    }, [dataset, onChange]);
    const onWheel = useCallback((event) => {
        if (disabled || typeof onChange !== 'function') return;
        const direction = event.deltaY < 0 ? 'increment' : 'decrement';
        onChange({
            type: 'change',
            value: direction,
            dataset: dataset,
            reactEvent: event,
            nativeEvent: event.nativeEvent
        });
    }, [dataset, disabled, onChange]);
    return (
        <div className={classnames(className, styles['discrete-input-container'], {'disabled': disabled})}
            onWheel={onWheel}>
            <div className={styles['header']}>{label}</div>
            <div className={styles['input-container']} title={disabled ? `${label} is not configurable` : null}>
                <Button className={classnames(styles['button-container'], {'disabled': disabled})}
                    data-type={'decrement'} onClick={buttonOnClick}>
                    <Icon className={styles['icon']} name={'remove'}/>
                </Button>
                <div className={styles['option-label']} title={value}>{value}</div>
                <Button className={classnames(styles['button-container'], {'disabled': disabled})}
                    data-type={'increment'} onClick={buttonOnClick}>
                    <Icon className={styles['icon']} name={'add'}/>
                </Button>
            </div>
        </div>
    );
};

DiscreteSelectInput.propTypes = {
    className: string,
    value: string,
    label: string,
    disabled: bool,
    dataset: object,
    onChange: func
};

export default DiscreteSelectInput;
