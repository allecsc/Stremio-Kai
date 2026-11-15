// Copyright (C) 2026 Stremio Kai contributors

const shouldShowStreamingServerWarning = (settings, dismissedUntil, now = Date.now()) => {
    // Discovery and reloads are not failures. Keep real errors and the user's
    // existing Later / Don't show again preference unchanged.
    return settings?.type === 'Err' && !(dismissedUntil.getTime() > now);
};

module.exports = shouldShowStreamingServerWarning;
