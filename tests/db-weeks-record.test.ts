/** Progress's long record: many weeks in one read, bucketed correctly. */
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { before, beforeEach, describe, test } from 'node:test';

import { db, initDatabase, resetDatabase } from './support/client.ts';
import * as schema from '../src/db/schema.ts';
import { upsertWeighIn } from '../src/db/repositories/body.ts';
import { liftTops, weeksRecord } from '../src/db/repositories/progress.ts';
import { finishSession, insertSet, skipDay, startSession } from '../src/db/repositories/sessions.ts';
import { logWater } from '../src/db/repositories/water.ts';
import { addDays, todayISO, weekStartISO } from '../src/lib/date.ts';

before(async () => {
  await initDatabase();
});

beforeEach(() => {
  resetDatabase();
  db.insert(schema.exercise)
    .values([{ id: 'squat', name: 'Squat', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['quads'], isCustom: 0 }])
    .run();
});

/** A finished workout on `date` with `sets` working sets of squat at `weight`. */
function trained(date: string, sets: number, weight = 100): void {
  const s = startSession(null);
  for (let i = 0; i < sets; i++) insertSet({ sessionId: s.id, exerciseId: 'squat', weight, reps: 5, rir: 2 });
  finishSession(s.id);
  db.update(schema.session).set({ date, startedAt: `${date}T09:00:00.000Z` }).where(eq(schema.session.id, s.id)).run();
  db.update(schema.exerciseSessionStat).set({ date }).where(eq(schema.exerciseSessionStat.sessionId, s.id)).run();
}

describe('weeksRecord', () => {
  test('puts each workout, set, missed day and rest day in its own week', () => {
    const thisWeek = weekStartISO(todayISO());
    const lastWeek = addDays(thisWeek, -7);
    trained(addDays(lastWeek, 1), 3);
    trained(addDays(lastWeek, 3), 2);
    trained(thisWeek, 4);
    const missed = skipDay(null, 'skipped');
    db.update(schema.session).set({ date: addDays(lastWeek, 5) }).where(eq(schema.session.id, missed)).run();
    const rest = skipDay(null, 'rest');
    db.update(schema.session).set({ date: lastWeek }).where(eq(schema.session.id, rest)).run();

    const [a, b] = weeksRecord(thisWeek, 2, 3000);
    assert.equal(a?.weekStart, lastWeek);
    assert.deepEqual([a?.trained, a?.sets, a?.missed, a?.rest], [2, 5, 1, 1]);
    assert.deepEqual([b?.trained, b?.sets, b?.missed, b?.rest], [1, 4, 0, 0]);
  });

  test('a week with nothing logged is empty, never zero kcal or a missed target', () => {
    const thisWeek = weekStartISO(todayISO());
    const [w] = weeksRecord(thisWeek, 1, 3000);
    assert.equal(w?.avgKcal, null);
    assert.equal(w?.foodDays, 0);
    assert.equal(w?.waterDays, 0);
    assert.equal(w?.trend, null);
  });

  test('water counts days logged and days at the target separately', () => {
    const today = todayISO();
    const thisWeek = weekStartISO(today);
    logWater(3200, thisWeek);
    if (today !== thisWeek) logWater(500, today);
    const [w] = weeksRecord(thisWeek, 1, 3000);
    assert.equal(w?.waterDays, today === thisWeek ? 1 : 2);
    assert.equal(w?.waterHit, 1);
  });

  test('the trend at a week is the smoothed weight as it stood at that week’s end', () => {
    const thisWeek = weekStartISO(todayISO());
    const lastWeek = addDays(thisWeek, -7);
    upsertWeighIn(addDays(lastWeek, 2), 84);
    const [earliest] = weeksRecord(thisWeek, 3, 3000);
    const [a, b] = weeksRecord(thisWeek, 2, 3000);
    assert.equal(earliest?.trend, null, 'no reading had been taken by then');
    assert.equal(a?.trend, 84);
    assert.equal(b?.trend, 84, 'a week without a reading carries the trend it inherited');
  });
});

describe('liftTops', () => {
  test('returns each lift’s recent top sets oldest first, capped', () => {
    const thisWeek = weekStartISO(todayISO());
    trained(addDays(thisWeek, -14), 1, 90);
    trained(addDays(thisWeek, -7), 1, 95);
    trained(thisWeek, 1, 100);
    const tops = liftTops(['squat'], 2).get('squat');
    assert.deepEqual(
      tops?.map((t) => t.topWeight),
      [95, 100],
    );
  });
});
