/**
 * Integration tests: the real repositories against a real SQLite database with the
 * real migrations applied (see tests/support). These cover the paths where a bug
 * costs someone their workout history, which the pure-engine tests cannot reach.
 */
import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';

import { db, expoDb, initDatabase, resetDatabase } from './support/client.ts';
import * as schema from '../src/db/schema.ts';
import {
  addSlot,
  createPlan,
  createRoutine,
  addDay,
  getDays,
  getSlots,
  removeSlot,
  resolveNextDay,
  restoreSlot,
  setActiveRoutine,
  updateSlot,
} from '../src/db/repositories/program.ts';
import {
  cancelSession,
  deleteSession,
  finishSession,
  getSessionPlan,
  getSessionSets,
  insertSet,
  planProgress,
  reopenSession,
  skipDay,
  skipExercise,
  startSession,
  swapSessionExercise,
  removeSessionExercise,
  restoreSessionExercise,
  unskipExercise,
} from '../src/db/repositories/sessions.ts';
import { getSettings, setRaw, setSetting } from '../src/db/repositories/settings.ts';
import { wipeAllData } from '../src/db/repositories/admin.ts';

before(async () => {
  await initDatabase();
});

/** Two exercises are enough for every flow here. */
function seedExercises(): void {
  db.insert(schema.exercise)
    .values([
      { id: 'squat', name: 'Squat', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['quads'], isCustom: 0 },
      { id: 'bench', name: 'Bench Press', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['chest'], isCustom: 0 },
      { id: 'row', name: 'Row', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['back'], isCustom: 0 },
    ])
    .run();
}

/** A two-day plan: Day A = squat + bench, Day B = row. */
function seedPlan() {
  const r = createPlan(
    {
      name: 'Test plan',
      daysPerWeek: 2,
      days: [
        { label: 'Day A', slots: [{ exerciseId: 'squat', targetSets: 2, repLo: 5, repHi: 8 }, { exerciseId: 'bench', targetSets: 2, repLo: 5, repHi: 8 }] },
        { label: 'Day B', slots: [{ exerciseId: 'row', targetSets: 2, repLo: 8, repHi: 12 }] },
      ],
    },
    { activate: true },
  );
  const days = getDays(r.id);
  return { routine: r, dayA: days[0]!, dayB: days[1]! };
}

beforeEach(() => {
  resetDatabase();
  seedExercises();
});

const work = (sessionId: string, exerciseId: string, n: number) => {
  for (let i = 0; i < n; i++) insertSet({ sessionId, exerciseId, weight: 60, reps: 5, rir: 2 });
};

describe('workout lifecycle', () => {
  test('starting a workout snapshots the plan, so editing the plan later does not rewrite today', () => {
    const { dayA } = seedPlan();
    const s = startSession(dayA.id);
    const slot = getSlots(dayA.id)[0]!;
    updateSlot(slot.id, { targetSets: 9 });
    removeSlot(getSlots(dayA.id)[1]!.id);

    const plan = getSessionPlan(s.id);
    assert.deepEqual(plan.map((p) => p.exerciseId), ['squat', 'bench']);
    assert.equal(plan[0]!.slot?.targetSets, 2, 'today keeps the targets it started with');
  });

  test('a second start resumes the open workout instead of creating another', () => {
    const { dayA } = seedPlan();
    const a = startSession(dayA.id);
    const b = startSession(dayA.id);
    assert.equal(a.id, b.id);
    assert.equal(db.select().from(schema.session).all().length, 1);
  });

  test('finishing with nothing logged discards the workout entirely', () => {
    const { dayA } = seedPlan();
    const s = startSession(dayA.id);
    const r = finishSession(s.id);
    assert.equal(r.discarded, true);
    assert.equal(db.select().from(schema.session).all().length, 0);
  });

  test('all target sets = completed; some = partial', () => {
    const { dayA } = seedPlan();
    const a = startSession(dayA.id);
    work(a.id, 'squat', 2);
    work(a.id, 'bench', 2);
    assert.equal(finishSession(a.id).status, 'completed');

    const b = startSession(dayA.id);
    work(b.id, 'squat', 1);
    assert.equal(finishSession(b.id).status, 'partial');
  });

  test('a skipped exercise still counts the day as complete', () => {
    const { dayA } = seedPlan();
    const s = startSession(dayA.id);
    work(s.id, 'squat', 2);
    skipExercise(s.id, 'bench');
    assert.equal(finishSession(s.id).status, 'completed');
  });

  test('cancelling keeps the sets but never counts the day as done', () => {
    const { routine, dayA } = seedPlan();
    const s = startSession(dayA.id);
    work(s.id, 'squat', 1);
    cancelSession(s.id, true);

    assert.equal(db.select().from(schema.session).get()!.status, 'cancelled');
    assert.equal(getSessionSets(s.id).length, 1, 'the sets really happened');
    assert.equal(resolveNextDay(routine.id)?.id, dayA.id, 'the day is still waiting for you');
  });

  test('cancelling without keeping deletes the workout and its sets', () => {
    const { dayA } = seedPlan();
    const s = startSession(dayA.id);
    work(s.id, 'squat', 1);
    cancelSession(s.id, false);
    assert.equal(db.select().from(schema.session).all().length, 0);
    assert.equal(db.select().from(schema.setLog).all().length, 0, 'sets are cascaded, not orphaned');
  });

  test('deleting a workout cascades to its sets and its exercise list', () => {
    const { dayA } = seedPlan();
    const s = startSession(dayA.id);
    work(s.id, 'squat', 2);
    deleteSession(s.id);
    assert.equal(db.select().from(schema.setLog).all().length, 0);
    assert.equal(db.select().from(schema.sessionExercise).all().length, 0);
  });

  test('reopen undoes an accidental finish', () => {
    const { dayA } = seedPlan();
    const s = startSession(dayA.id);
    work(s.id, 'squat', 2);
    finishSession(s.id);
    assert.equal(reopenSession(s.id), true);
    const row = db.select().from(schema.session).get()!;
    assert.equal(row.status, 'active');
    assert.equal(row.endedAt, null);
    assert.equal(getSessionSets(s.id).length, 2, 'reopening never drops what was logged');
  });
});

describe('the plan cycle', () => {
  test('days run in order and a cancelled workout does not advance them', () => {
    const { routine, dayA, dayB } = seedPlan();
    assert.equal(resolveNextDay(routine.id)?.id, dayA.id);

    const s1 = startSession(dayA.id);
    work(s1.id, 'squat', 2);
    work(s1.id, 'bench', 2);
    finishSession(s1.id);
    assert.equal(resolveNextDay(routine.id)?.id, dayB.id, 'a finished day advances');

    const s2 = startSession(dayB.id);
    work(s2.id, 'row', 1);
    cancelSession(s2.id, true);
    assert.equal(resolveNextDay(routine.id)?.id, dayB.id, 'a cancelled day waits for you');
  });

  test('skipping a day advances the cycle, and undo puts it back', () => {
    const { routine, dayA, dayB } = seedPlan();
    const id = skipDay(dayA.id);
    assert.equal(resolveNextDay(routine.id)?.id, dayB.id);
    deleteSession(id);
    assert.equal(resolveNextDay(routine.id)?.id, dayA.id);
  });
});

describe('changing today without breaking history', () => {
  test('swap moves the plan entry and keeps position', () => {
    const { dayA } = seedPlan();
    const s = startSession(dayA.id);
    swapSessionExercise(s.id, 'bench', 'row');
    assert.deepEqual(getSessionPlan(s.id).map((p) => p.exerciseId), ['squat', 'row']);
  });

  test('remove is undoable and restores the same position', () => {
    const { dayA } = seedPlan();
    const s = startSession(dayA.id);
    const removed = removeSessionExercise(s.id, 'squat');
    assert.deepEqual(getSessionPlan(s.id).map((p) => p.exerciseId), ['bench']);
    restoreSessionExercise(removed);
    assert.deepEqual(getSessionPlan(s.id).map((p) => p.exerciseId), ['squat', 'bench']);
  });

  test('skip and un-skip only flip a flag, never lose the exercise', () => {
    const { dayA } = seedPlan();
    const s = startSession(dayA.id);
    skipExercise(s.id, 'squat');
    assert.equal(getSessionPlan(s.id)[0]!.skipped, true);
    assert.equal(planProgress(s.id).skipped, 1);
    unskipExercise(s.id, 'squat');
    assert.equal(getSessionPlan(s.id)[0]!.skipped, false);
  });

  test('an exercise logged but no longer on the list still shows up', () => {
    const { dayA } = seedPlan();
    const s = startSession(dayA.id);
    insertSet({ sessionId: s.id, exerciseId: 'row', weight: 40, reps: 10, rir: 2 });
    assert.ok(getSessionPlan(s.id).some((p) => p.exerciseId === 'row' && p.adHoc));
  });
});

describe('plan editing', () => {
  test('removing a slot is undoable', () => {
    const r = createRoutine('R', 3);
    const d = addDay(r.id, 'Day 1');
    addSlot(d.id, 'squat');
    const row = removeSlot(getSlots(d.id)[0]!.id)!;
    assert.equal(getSlots(d.id).length, 0);
    restoreSlot(row);
    assert.equal(getSlots(d.id).length, 1);
  });

  test('a rep range stays coherent whichever bound you move', () => {
    const r = createRoutine('R', 3);
    const d = addDay(r.id, 'Day 1');
    const slot = addSlot(d.id, 'squat', { repLo: 5, repHi: 8 });
    updateSlot(slot.id, { repLo: 12 });
    const after = getSlots(d.id)[0]!;
    assert.ok(after.repLo <= after.repHi, `got ${after.repLo}-${after.repHi}`);
  });
});

describe('settings', () => {
  test('every setting survives a round trip', () => {
    setSetting('name', 'Rakesh');
    setSetting('trainingDays', [1, 3, 5]);
    setSetting('experience', 'beginner');
    setSetting('tools', ['barbell', 'rack']);
    const s = getSettings();
    assert.equal(s.name, 'Rakesh');
    assert.deepEqual(s.trainingDays, [1, 3, 5]);
    assert.equal(s.experience, 'beginner');
    assert.deepEqual(s.tools, ['barbell', 'rack']);
  });

  test('a corrupt or hostile value falls back to the default instead of crashing', () => {
    setRaw('experience', '"astronaut"');
    setRaw('heightCm', 'not json');
    setRaw('trainingDays', '{"not":"an array"}');
    const s = getSettings();
    assert.equal(s.experience, 'intermediate');
    assert.equal(s.heightCm, 173);
    assert.deepEqual(s.trainingDays, [1, 2, 4, 5]);
  });
});

describe('delete all my data', () => {
  test('removes workouts, plans and settings but keeps the exercise catalogue', () => {
    const { dayA } = seedPlan();
    const s = startSession(dayA.id);
    work(s.id, 'squat', 2);
    finishSession(s.id);
    setSetting('name', 'Rakesh');

    wipeAllData();

    assert.equal(db.select().from(schema.session).all().length, 0);
    assert.equal(db.select().from(schema.setLog).all().length, 0);
    assert.equal(db.select().from(schema.routine).all().length, 0);
    assert.equal(getSettings().name, '', 'settings go back to defaults');
    assert.ok(db.select().from(schema.exercise).all().length >= 3, 'the catalogue survives');
  });
});

describe('foreign keys', () => {
  test('are actually on, so cascades work', () => {
    const [row] = expoDb.getAllSync<{ foreign_keys: number }>('PRAGMA foreign_keys');
    assert.equal(row?.foreign_keys, 1);
  });
});
