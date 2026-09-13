/** The daily check-in, and how a workout picks it up. */
import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';

import { db, initDatabase, resetDatabase } from './support/client.ts';
import * as schema from '../src/db/schema.ts';
import { deleteCheckIn, getCheckIn, listCheckIns, saveCheckIn, upsertWeighIn } from '../src/db/repositories/body.ts';
import { getSession, insertSet, startSession, syncReadiness } from '../src/db/repositories/sessions.ts';
import { todayISO } from '../src/lib/date.ts';

before(async () => {
  await initDatabase();
});

beforeEach(() => {
  resetDatabase();
  db.insert(schema.exercise)
    .values([{ id: 'squat', name: 'Squat', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['quads'], isCustom: 0 }])
    .run();
});

describe('check-in', () => {
  test('one per day: checking in again replaces the answers', () => {
    const today = todayISO();
    saveCheckIn({ date: today, sleepHours: 6, soreness: 2, stress: null });
    saveCheckIn({ date: today, sleepHours: 8, soreness: null, stress: 4 });
    assert.deepEqual(getCheckIn(today), { date: today, sleepHours: 8, soreness: null, stress: 4 });
    assert.equal(listCheckIns(today).length, 1);
    deleteCheckIn(today);
    assert.equal(getCheckIn(today), undefined);
  });

  test("a workout starts with the day's check-in and weigh-in as its readiness", () => {
    const today = todayISO();
    upsertWeighIn(today, 80.4);
    saveCheckIn({ date: today, sleepHours: 5, soreness: 4, stress: 3 });
    const row = getSession(startSession(null).id)!;
    assert.equal(row.bodyweightKg, 80.4);
    assert.equal(row.sleepHours, 5);
    assert.equal(row.soreness, 4);
    assert.equal(row.stress, 3);
  });

  test('a check-in after Start counts until the first set, then targets stay put', () => {
    const today = todayISO();
    const s = startSession(null);
    assert.equal(getSession(s.id)!.sleepHours, null, 'skipping the check-in leaves readiness empty');

    saveCheckIn({ date: today, sleepHours: 7, soreness: null, stress: null });
    syncReadiness();
    assert.equal(getSession(s.id)!.sleepHours, 7);

    insertSet({ sessionId: s.id, exerciseId: 'squat', weight: 100, reps: 5, rir: 2, isWarmup: false, painFlag: false, wasOverride: false });
    saveCheckIn({ date: today, sleepHours: 5, soreness: null, stress: null });
    syncReadiness();
    assert.equal(getSession(s.id)!.sleepHours, 7, 'a logged set freezes readiness');
  });
});
