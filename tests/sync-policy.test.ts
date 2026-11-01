/** When cloud sync runs on its own: at the moments that matter, never per tap. */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BACKGROUND_EVERY_MINUTES, isDue, OPEN_AFTER_HOURS, shouldSyncOnBackground } from '../src/lib/syncPolicy.ts';

const now = Date.parse('2026-11-01T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();

describe('isDue', () => {
  test('never synced, or an unreadable time, is due', () => {
    assert.equal(isDue(null, now), true);
    assert.equal(isDue('not a date', now), true);
  });

  test('due once the newest copy is old enough', () => {
    assert.equal(isDue(hoursAgo(OPEN_AFTER_HOURS - 1), now), false);
    assert.equal(isDue(hoursAgo(OPEN_AFTER_HOURS), now), true);
  });
});

describe('shouldSyncOnBackground', () => {
  const base = { dirty: true, workoutOpen: false, lastAttemptMs: null, nowMs: now };

  test('syncs new data when the app is put away', () => {
    assert.equal(shouldSyncOnBackground(base), true);
  });

  test('nothing new, nothing to send', () => {
    assert.equal(shouldSyncOnBackground({ ...base, dirty: false }), false);
  });

  test('waits for the workout to finish rather than uploading between sets', () => {
    assert.equal(shouldSyncOnBackground({ ...base, workoutOpen: true }), false);
  });

  test('not again within a few minutes', () => {
    assert.equal(shouldSyncOnBackground({ ...base, lastAttemptMs: now - 60_000 }), false);
    assert.equal(shouldSyncOnBackground({ ...base, lastAttemptMs: now - BACKGROUND_EVERY_MINUTES * 60_000 }), true);
  });
});
