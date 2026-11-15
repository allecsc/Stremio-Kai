function isPlayerLoaded(video, props) {
    if (!props.includes('loaded')) {
        return Promise.resolve(true);
    }
    return new Promise(function(resolve, reject) {
        var isLoaded = null;
        video.on('propChanged', function(propName, propValue) {
            if (propName === 'loaded' && propValue !== null && isLoaded === null) {
                isLoaded = propValue;
                if (propValue === true) {
                    resolve(true);
                } else if (propValue === false) {
                    reject(Error('Player failed to load, will not retrieve video params'));
                }
            }
        });
        video.dispatch({
            type: 'observeProp',
            propName: 'loaded'
        });
    });
}

module.exports = isPlayerLoaded;
