/**
 * Cancelling a workout, and what counts as "there is something to lose".
 *
 * The regression this guards: both screens used to count only working sets before
 * offering Keep/Discard, so a workout where the warm-up had been logged and nothing
 * else took the silent path and was deleted without asking (UX-05).
 */
import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';

import { db, initDatabase, resetDatabase } from './support/client.ts';
import * as schema from '../src/db/schema.ts';
import {
  cancelSession,
  finishSession,
  getSession,
  getSessionSets,
  insertSet,
  savedSetCount,
  startSession,
} from '../src/db/repositories/sessions.ts';

before(async () => {
  await initDatabase();
});

beforeEach(() => {
  resetDatabase();
  db.insert(schema.exercise)
    .values([{ id: 'squat', name: 'Squat', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['quads'], isCustom: 0 }])
    .run();
});

const warmupOnly = () => {
  const s = startSession(null);
  insertSet({ sessionId: s.id, exerciseId: 'squat', weight: 20, reps: 10, rir: 5, isWarmup: true });
  return s.id;
};

describe('cancelling a workout', () => {
  test('a warm-up counts: the screens are told there is something to lose', () => {
    const id = warmupOnly();
    assert.equal(savedSetCount(id), 1);
  });

  test('keeping the sets keeps the warm-up and marks the workout cancelled', () => {
    const id = warmupOnly();
    cancelSession(id, true);
    const after = getSession(id);
    assert.equal(after?.status, 'cancelled');
    assert.notEqual(after?.endedAt, null);
    const kept = getSessionSets(id);
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.isWarmup, 1);
  });

  test('discarding removes the workout and its warm-ups', () => {
    const id = warmupOnly();
    cancelSession(id, false);
    assert.equal(getSession(id), undefined);
    assert.equal(getSessionSets(id).length, 0);
  });

  test('cancelling never counts as completed, even with every set logged', () => {
    const s = startSession(null);
    insertSet({ sessionId: s.id, exerciseId: 'squat', weight: 100, reps: 5, rir: 2 });
    cancelSession(s.id, true);
    assert.equal(getSession(s.id)?.status, 'cancelled');
  });

  test('finishing a warm-up-only workout keeps it rather than discarding it', () => {
    const id = warmupOnly();
    const r = finishSession(id);
    assert.equal(r.discarded, false);
    assert.equal(getSessionSets(id).length, 1);
  });

  test('a workout with nothing logged at all is still discarded on cancel', () => {
    const s = startSession(null);
    assert.equal(savedSetCount(s.id), 0);
    cancelSession(s.id, true);
    assert.equal(getSession(s.id), undefined);
  });
});
