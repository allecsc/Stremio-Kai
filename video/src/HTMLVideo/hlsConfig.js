module.exports = {
    debug: false,
    enableWorker: true,
    lowLatencyMode: false,
    backBufferLength: 30,
    maxBufferLength: 50,
    maxMaxBufferLength: 80,
    maxFragLookUpTolerance: 0,
    maxBufferHole: 0,
    appendErrorMaxRetry: 20,
    nudgeMaxRetry: 20,
    manifestLoadingTimeOut: 30000,
    manifestLoadingMaxRetry: 10,
    fragLoadPolicy: {
        default: {
            maxTimeToFirstByteMs: 10000,
            maxLoadTimeMs: 120000,
            timeoutRetry: {
                maxNumRetry: 20,
                retryDelayMs: 0,
                maxRetryDelayMs: 15
            },
            errorRetry: {
                maxNumRetry: 6,
                retryDelayMs: 1000,
                maxRetryDelayMs: 15
            }
        }
    }
    // liveDurationInfinity: false
};
