/**
 * The Haptics switch reaches everything (UX-11).
 *
 * It was consulted in exactly one place — the session screen's commit feedback —
 * while Stepper, ChipRow, ToggleChips, PrimaryButton, the rest timer and the drill
 * player all went straight to expo-haptics with their own `haptics = true`. Turning
 * it off silenced logging a set and nothing else: every ± tap still buzzed.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { hapticsEnabled, setHapticsEnabled } from '../src/lib/haptics.ts';
import { db, initDatabase, resetDatabase } from './support/client.ts';
import { getSettings, setSetting } from '../src/db/repositories/settings.ts';

beforeEach(() => {
  setHapticsEnabled(true);
});

describe('the haptics switch', () => {
  test('defaults on, and the setter is what everything reads', () => {
    assert.equal(hapticsEnabled(), true);
    setHapticsEnabled(false);
    assert.equal(hapticsEnabled(), false);
    setHapticsEnabled(true);
    assert.equal(hapticsEnabled(), true);
  });

  test('firing a haptic while off does nothing and throws nothing', async () => {
    const { impact, selection, success } = await import('../src/lib/haptics.ts');
    setHapticsEnabled(false);
    // The point is that these are safe no-ops, not that they are observable.
    assert.doesNotThrow(() => {
      selection();
      impact();
      success();
    });
    assert.equal(hapticsEnabled(), false, 'and firing one does not re-enable it');
  });
});

describe('reading settings pushes the preference down', () => {
  test('so a primitive that cannot reach a repository still obeys it', async () => {
    await initDatabase();
    resetDatabase();
    assert.ok(db);

    setSetting('hapticsEnabled', false);
    getSettings();
    assert.equal(hapticsEnabled(), false, 'settings read must silence the shared controls');

    setSetting('hapticsEnabled', true);
    getSettings();
    assert.equal(hapticsEnabled(), true);
  });
});
