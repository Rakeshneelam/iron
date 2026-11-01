/** The lifetime counts behind XP and badges, read from what was actually logged. */
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { before, beforeEach, describe, test } from 'node:test';

import { db, initDatabase, resetDatabase } from './support/client.ts';
import * as schema from '../src/db/schema.ts';
import { upsertWeighIn } from '../src/db/repositories/body.ts';
import { bestBefore, lifetimeStats } from '../src/db/repositories/level.ts';
import { finishSession, insertSet, startSession } from '../src/db/repositories/sessions.ts';
import { logWater } from '../src/db/repositories/water.ts';
import { addDays, todayISO } from '../src/lib/date.ts';

before(async () => {
  await initDatabase();
});

beforeEach(() => {
  resetDatabase();
  db.insert(schema.exercise)
    .values([{ id: 'squat', name: 'Squat', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['quads'], isCustom: 0 }])
    .run();
});

/** A finished squat workout `daysAgo` days back: `sets` sets of 5 at `weight`. */
function trained(daysAgo: number, sets: number, weight: number): string {
  const date = addDays(todayISO(), -daysAgo);
  const s = startSession(null);
  for (let i = 0; i < sets; i++) insertSet({ sessionId: s.id, exerciseId: 'squat', weight, reps: 5, rir: 2 });
  finishSession(s.id);
  db.update(schema.session).set({ date, startedAt: `${date}T09:00:00.000Z`, endedAt: `${date}T10:00:00.000Z` }).where(eq(schema.session.id, s.id)).run();
  db.update(schema.exerciseSessionStat).set({ date }).where(eq(schema.exerciseSessionStat.sessionId, s.id)).run();
  return s.id;
}

describe('lifetimeStats', () => {
  test('an empty log is all zeros', () => {
    const s = lifetimeStats({ waterTargetMl: 3000 });
    assert.deepEqual([s.workouts, s.sets, s.tonnage, s.bests, s.weighIns], [0, 0, 0, 0, 0]);
  });

  test('counts workouts, working sets and kilograms moved', () => {
    trained(3, 3, 100);
    trained(1, 2, 100);
    const s = lifetimeStats({ waterTargetMl: 3000 });
    assert.equal(s.workouts, 2);
    assert.equal(s.sets, 5);
    assert.equal(s.tonnage, 5 * 100 * 5);
  });

  test('a first session sets the bar; only beating it is a best', () => {
    trained(5, 3, 100);
    trained(3, 3, 100); // same load: not a best
    trained(1, 3, 110); // heavier: a best
    assert.equal(lifetimeStats({ waterTargetMl: 3000 }).bests, 1);
  });

  test('excluding a workout gives the stats from before it', () => {
    trained(3, 3, 100);
    const last = trained(1, 3, 110);
    const before = lifetimeStats({ waterTargetMl: 3000, exclude: last });
    const after = lifetimeStats({ waterTargetMl: 3000 });
    assert.equal(after.workouts - before.workouts, 1);
    assert.equal(after.sets - before.sets, 3);
    assert.equal(after.bests - before.bests, 1);
  });

  test('water days count against the target; weigh-ins count once a day', () => {
    logWater(2000, todayISO());
    logWater(1500, todayISO());
    logWater(500, addDays(todayISO(), -1));
    upsertWeighIn(todayISO(), 80);
    upsertWeighIn(todayISO(), 79.8);
    const s = lifetimeStats({ waterTargetMl: 3000 });
    assert.equal(s.waterDays, 1);
    assert.equal(s.weighIns, 1);
  });

  test('bestBefore is the top estimate from any other workout', () => {
    trained(3, 2, 100);
    const now = startSession(null);
    assert.ok(bestBefore('squat', now.id) > 100);
    assert.equal(bestBefore('deadlift', now.id), 0);
  });
});
