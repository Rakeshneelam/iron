/**
 * The walk through check-in → warm-up → lifts → cool-down → summary.
 *
 * The rules worth pinning down are the empty ones: a day with no drills must not
 * show an empty warm-up, a workout with nothing logged must not offer a cool-down
 * for nothing, and resuming a session whose stage has since emptied must not land
 * on a blank screen.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { nextStage, resolveStage, stagesShown, STAGE_ORDER } from '../src/features/session/stages.ts';

const BOTH = { warmup: true, cooldown: true };
const NEITHER = { warmup: false, cooldown: false };

describe('workout stages', () => {
  test('the full walk, in order, ending in the summary', () => {
    assert.equal(nextStage('checkin', BOTH), 'warmup');
    assert.equal(nextStage('warmup', BOTH), 'main');
    assert.equal(nextStage('main', BOTH), 'cooldown');
    assert.equal(nextStage('cooldown', BOTH), 'finish');
  });

  test('a stage with nothing in it is stepped over, not shown', () => {
    assert.equal(nextStage('checkin', { warmup: false, cooldown: true }), 'main');
    assert.equal(nextStage('main', { warmup: true, cooldown: false }), 'finish');
    assert.equal(nextStage('checkin', NEITHER), 'main');
  });

  test('the lifts are never skipped — only warm-up and cool-down can be empty', () => {
    for (const content of [BOTH, NEITHER, { warmup: true, cooldown: false }, { warmup: false, cooldown: true }]) {
      assert.ok(stagesShown(content).includes('main'), `main missing for ${JSON.stringify(content)}`);
      assert.ok(stagesShown(content).includes('checkin'));
    }
  });

  test('stagesShown drops exactly the empty ones, keeping the order', () => {
    assert.deepEqual(stagesShown(BOTH), [...STAGE_ORDER]);
    assert.deepEqual(stagesShown(NEITHER), ['checkin', 'main']);
    assert.deepEqual(stagesShown({ warmup: true, cooldown: false }), ['checkin', 'warmup', 'main']);
  });

  test('resuming a stage that has emptied moves on instead of stranding', () => {
    assert.equal(resolveStage('warmup', { warmup: false, cooldown: true }), 'main');
    assert.equal(resolveStage('cooldown', NEITHER), 'finish');
    // Still there: resuming does not move you on for no reason.
    assert.equal(resolveStage('warmup', BOTH), 'warmup');
    assert.equal(resolveStage('main', NEITHER), 'main');
  });
});
