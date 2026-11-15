const assert = require('node:assert/strict');
const { test } = require('node:test');
const shouldShowWarning = require('../src/common/shouldShowStreamingServerWarning');

const now = Date.UTC(2026, 10, 15);
const notDismissed = new Date(NaN);
test('starting, reloading and healthy servers do not display an unavailable warning', () => {
    for (const settings of [null, undefined, { type: 'Loading' }, { type: 'Ready', content: {} }]) {
        assert.equal(shouldShowWarning(settings, notDismissed, now), false);
    }
});
test('a failed server stays visible until recovery or an explicit dismissal', () => {
    const failed = { type: 'Err', content: 'Connection refused' };
    assert.equal(shouldShowWarning(failed, notDismissed, now), true);
    assert.equal(shouldShowWarning(failed, new Date(now - 1), now), true);
    assert.equal(shouldShowWarning(failed, new Date(now + 1), now), false);
    assert.equal(shouldShowWarning(failed, new Date(now), now), true);
    assert.equal(shouldShowWarning({ type: 'Ready', content: {} }, notDismissed, now), false);
});
