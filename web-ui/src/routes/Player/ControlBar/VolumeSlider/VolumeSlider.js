// Copyright (C) 2017-2023 Smart code 203358507

const React = require('react');
const PropTypes = require('prop-types');
const classnames = require('classnames');
const debounce = require('lodash.debounce');
const { useRouteFocused } = require('stremio-router');
const { Slider } = require('stremio/components');
const styles = require('./styles');
const {useStorage} = require('stremio/common');

const VolumeSlider = ({ className, volume, onVolumeChangeRequested, muted }) => {
    const [storage,] = useStorage();
    const disabled = volume === null || isNaN(volume);
    const routeFocused = useRouteFocused();
    const [slidingVolume, setSlidingVolume] = React.useState(null);
    const maxVolume = Number(storage.maxVolume) || 100;
    const resetVolumeDebounced = React.useCallback(debounce(() => {
        setSlidingVolume(null);
    }, 100), []);
    const onSlide = React.useCallback((volume) => {
        resetVolumeDebounced.cancel();
        setSlidingVolume(volume);
        if (typeof onVolumeChangeRequested === 'function') {
            onVolumeChangeRequested(volume);
        }
    }, [onVolumeChangeRequested]);
    const onComplete = React.useCallback((volume) => {
        resetVolumeDebounced();
        setSlidingVolume(volume);
        if (typeof onVolumeChangeRequested === 'function') {
            onVolumeChangeRequested(volume);
        }
    }, [onVolumeChangeRequested]);
    React.useLayoutEffect(() => {
        if (!routeFocused || disabled) {
            resetVolumeDebounced.cancel();
            setSlidingVolume(null);
        }
    }, [routeFocused, disabled]);
    React.useEffect(() => {
        return () => {
            resetVolumeDebounced.cancel();
        };
    }, []);
    return (
        <Slider
            className={classnames(className, styles['volume-slider'], { 'active': slidingVolume !== null })}
            value={
                !disabled ?
                    !muted ?
                        slidingVolume !== null ? slidingVolume : volume
                        : 0
                    :
                    50
            }
            minimumValue={0}
            maximumValue={maxVolume}
            disabled={false}
            onSlide={onSlide}
            onComplete={onComplete}
            audioBoost={false}
        />
    );
};

VolumeSlider.propTypes = {
    className: PropTypes.string,
    volume: PropTypes.number,
    onVolumeChangeRequested: PropTypes.func,
    muted: PropTypes.bool,
};

module.exports = VolumeSlider;
