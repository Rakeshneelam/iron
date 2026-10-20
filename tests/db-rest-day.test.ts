/**
 * Marking a day as not trained — rest (on purpose) or missed (it did not happen).
 *
 * The distinction is not cosmetic: a rest day must leave the plan exactly where it
 * was, while a missed day uses the plan's day up. Getting that backwards would
 * either skip a workout nobody skipped, or offer the same day forever.
 */
import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';

import { db, initDatabase, resetDatabase } from './support/client.ts';
import * as schema from '../src/db/schema.ts';
import {
  deleteSession,
  finishSession,
  getSession,
  insertSet,
  isNoTraining,
  reopenSession,
  skipDay,
  startSession,
} from '../src/db/repositories/sessions.ts';
import { recentWorkouts, searchWorkoutsPage } from '../src/db/repositories/progress.ts';
import { resolveNextDay } from '../src/db/repositories/program.ts';
import { todayISO } from '../src/lib/date.ts';

const ROUTINE = 'r1';
const DAY_A = 'd-a';
const DAY_B = 'd-b';

before(async () => {
  await initDatabase();
});

beforeEach(() => {
  resetDatabase();
  db.insert(schema.exercise)
    .values([{ id: 'squat', name: 'Squat', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['quads'], isCustom: 0 }])
    .run();
  db.insert(schema.routine).values({ id: ROUTINE, name: 'Plan', daysPerWeek: 2, active: 1, createdAt: new Date(0).toISOString() }).run();
  db.insert(schema.routineDay)
    .values([
      { id: DAY_A, routineId: ROUTINE, dayIndex: 0, label: 'Upper' },
      { id: DAY_B, routineId: ROUTINE, dayIndex: 1, label: 'Lower' },
    ])
    .run();
});

const countSessions = () => db.select().from(schema.session).all().length;

describe('rest days and missed days', () => {
  test('a rest day leaves the plan where it was — the same day is still next', () => {
    assert.equal(resolveNextDay(ROUTINE)?.id, DAY_A);
    skipDay(DAY_A, 'rest');
    assert.equal(resolveNextDay(ROUTINE)?.id, DAY_A, 'a day off must not consume the workout');
  });

  test('a missed day uses the plan day up — the next one comes round', () => {
    skipDay(DAY_A, 'skipped');
    assert.equal(resolveNextDay(ROUTINE)?.id, DAY_B);
  });

  test('both work with no plan at all', () => {
    for (const status of ['rest', 'skipped'] as const) {
      // The second call replaces the first, which is the behaviour under test below.
      const id = skipDay(null, status);
      const s = getSession(id);
      assert.ok(s);
      assert.equal(s.routineDayId, null);
      assert.equal(s.status, status);
      assert.equal(s.date, todayISO());
      assert.ok(s.endedAt, 'a marked day is finished the moment it is marked');
    }
  });

  test('changing your mind replaces the mark instead of stacking a second row', () => {
    skipDay(DAY_A, 'rest');
    const second = skipDay(DAY_A, 'skipped');
    assert.equal(countSessions(), 1);
    assert.equal(getSession(second)?.status, 'skipped');
  });

  test('marking a day off never touches a workout logged the same day', () => {
    const workout = startSession(DAY_A);
    insertSet({ sessionId: workout.id, exerciseId: 'squat', weight: 60, reps: 5, rir: 2 });
    skipDay(DAY_B, 'rest');
    assert.ok(getSession(workout.id), 'the real workout and its sets must survive');
    assert.equal(db.select().from(schema.setLog).all().length, 1);
  });

  test('undo is a plain delete, and it leaves nothing behind', () => {
    const id = skipDay(DAY_A, 'rest');
    deleteSession(id);
    assert.equal(countSessions(), 0);
    assert.equal(resolveNextDay(ROUTINE)?.id, DAY_A);
  });

  test('a marked day has nothing to reopen', () => {
    assert.equal(reopenSession(skipDay(DAY_A, 'rest')), false);
    assert.equal(reopenSession(skipDay(DAY_A, 'skipped')), false);
  });

  test('a marked day is not a recent workout, and never pushes one off the list', () => {
    const workout = startSession(DAY_A);
    insertSet({ sessionId: workout.id, exerciseId: 'squat', weight: 60, reps: 5, rir: 2 });
    finishSession(workout.id);
    skipDay(DAY_B, 'rest'); // newer than the workout

    const recent = recentWorkouts(1);
    assert.equal(recent.length, 1);
    assert.equal(recent[0]?.session.id, workout.id, 'Today shows the workout, not the day off');
  });

  test('a marked day still shows in history — that is where it belongs', () => {
    const id = skipDay(DAY_A, 'rest');
    assert.ok(
      searchWorkoutsPage({ limit: 10 }).rows.some((r) => r.session.id === id),
      'history must reflect the day off (feature 5)',
    );
  });

  test('isNoTraining covers both marks and nothing else', () => {
    assert.equal(isNoTraining('rest'), true);
    assert.equal(isNoTraining('skipped'), true);
    for (const s of ['active', 'completed', 'partial', 'cancelled'] as const) assert.equal(isNoTraining(s), false);
  });
});
