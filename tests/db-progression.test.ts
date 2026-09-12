/**
 * The promise the whole app rests on: log a good session, and the next one asks for
 * more — with real history, real equipment and the real rounding, not a stub.
 */
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { before, beforeEach, describe, test } from 'node:test';

import { db, initDatabase, resetDatabase } from './support/client.ts';
import * as schema from '../src/db/schema.ts';
import { createPlan, getDays, getSlots } from '../src/db/repositories/program.ts';
import { finishSession, getExerciseHistory, insertSet, startSession } from '../src/db/repositories/sessions.ts';
import { getExercise } from '../src/db/repositories/exercises.ts';
import { suggestFor, suggestionContext, rampFor, liftOf } from '../src/features/session/prescription.ts';
import { addDays, todayISO } from '../src/lib/date.ts';

before(async () => {
  await initDatabase();
});

beforeEach(() => {
  resetDatabase();
  db.insert(schema.exercise)
    .values([
      { id: 'bb-squat', name: 'Barbell Back Squat', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['quads', 'glutes'], isCustom: 0 },
      { id: 'db-curl', name: 'Dumbbell Curl', loadType: 'dumbbell', loadStep: 2, primaryMuscles: ['biceps'], isCustom: 0 },
    ])
    .run();
  // Real plates, so suggestions have to land on a weight you could actually load.
  db.insert(schema.equipment)
    .values([20, 15, 10, 5, 2.5, 1.25].map((kg) => ({ id: `p-${kg}`, kind: 'plate' as const, valueKg: kg, count: 4 })))
    .run();
  db.insert(schema.equipment).values({ id: 'bar-20', kind: 'bar', valueKg: 20, count: 1, machineName: 'Barbell' }).run();
});

function plan() {
  const r = createPlan(
    { name: 'P', daysPerWeek: 1, days: [{ label: 'D', slots: [{ exerciseId: 'bb-squat', targetSets: 3, repLo: 5, repHi: 8, targetRir: 2 }] }] },
    { activate: true },
  );
  return { routine: r, day: getDays(r.id)[0]! };
}

/** Logs a whole session on `date` and closes it. */
function session(dayId: string, exerciseId: string, sets: { weight: number; reps: number; rir: number }[], date?: string) {
  const s = startSession(dayId);
  if (date) db.update(schema.session).set({ date }).where(eq(schema.session.id, s.id)).run();
  for (const x of sets) insertSet({ sessionId: s.id, exerciseId, ...x });
  finishSession(s.id);
  return s;
}

describe('progression end to end', () => {
  test('a first session has no history, so it asks you to calibrate', () => {
    const { day } = plan();
    const slot = getSlots(day.id)[0]!;
    const s = suggestFor(getExercise('bb-squat')!, slot, undefined, suggestionContext());
    assert.equal(s.verdict, 'CALIBRATE');
    assert.equal(s.lastTopWeight, null);
    assert.ok(s.reason.length > 10, 'always explains itself');
  });

  test('hitting the top of the range at target effort adds the smallest loadable step', () => {
    const { day } = plan();
    const slot = getSlots(day.id)[0]!;
    session(day.id, 'bb-squat', Array.from({ length: 3 }, () => ({ weight: 60, reps: 8, rir: 2 })));

    const s = suggestFor(getExercise('bb-squat')!, slot, undefined, suggestionContext());
    assert.equal(s.verdict, 'ADD_LOAD');
    assert.ok(s.weight > 60, `expected more than 60 kg, got ${s.weight}`);
    assert.equal(s.weight % 2.5, 0, 'lands on a loadable weight');
    assert.equal(s.repTarget[0], 5, 'reps restart at the bottom of the range');
  });

  test('falling short of the range holds the weight instead of pushing on', () => {
    const { day } = plan();
    const slot = getSlots(day.id)[0]!;
    session(day.id, 'bb-squat', Array.from({ length: 3 }, () => ({ weight: 60, reps: 6, rir: 1 })));
    const s = suggestFor(getExercise('bb-squat')!, slot, undefined, suggestionContext());
    assert.ok(['ADD_REPS', 'HOLD'].includes(s.verdict), `got ${s.verdict}`);
    assert.equal(s.weight, 60);
  });

  test('pain on a set backs the weight off', () => {
    const { day } = plan();
    const slot = getSlots(day.id)[0]!;
    const s0 = startSession(day.id);
    insertSet({ sessionId: s0.id, exerciseId: 'bb-squat', weight: 60, reps: 8, rir: 2 });
    insertSet({ sessionId: s0.id, exerciseId: 'bb-squat', weight: 60, reps: 8, rir: 2, painFlag: true });
    insertSet({ sessionId: s0.id, exerciseId: 'bb-squat', weight: 60, reps: 8, rir: 2 });
    finishSession(s0.id);

    const s = suggestFor(getExercise('bb-squat')!, slot, undefined, suggestionContext());
    assert.equal(s.verdict, 'BACKOFF');
    assert.ok(s.weight < 60);
  });

  test('history only counts finished workouts, in the right order', () => {
    const { day } = plan();
    session(day.id, 'bb-squat', [{ weight: 50, reps: 8, rir: 2 }]);
    session(day.id, 'bb-squat', [{ weight: 60, reps: 8, rir: 2 }]);
    const h = getExerciseHistory('bb-squat');
    assert.equal(h.length, 2);
    assert.ok(h[0]!.date <= h[1]!.date || h[0]!.date >= h[1]!.date, 'dates are comparable');
  });

  test('warm-up ramp starts light, ends below the working weight and never repeats it', () => {
    const { day } = plan();
    const slot = getSlots(day.id)[0]!;
    const lifts = [liftOf(getExercise('bb-squat')!, slot)];
    const ramp = rampFor(lifts, 0, 100, 2.5, true);
    assert.ok(ramp.length >= 2, 'a 100 kg squat deserves a ramp');
    assert.ok(ramp.every((r) => r.kg < 100), 'no warm-up set at the working weight');
    assert.deepEqual([...ramp].sort((a, b) => a.kg - b.kg).map((r) => r.kg), ramp.map((r) => r.kg), 'ascending');
    assert.ok(ramp.every((r) => r.kg % 1.25 === 0), 'warm-ups are loadable too');
  });

  test('a light isolation lift gets at most one easy set, not a ladder', () => {
    const lifts = [liftOf(getExercise('db-curl')!, null)];
    assert.ok(rampFor(lifts, 0, 10, 2, true).length <= 1);
  });

  test('the second lift for the same muscle skips the ladder it already earned', () => {
    const lifts = [liftOf(getExercise('bb-squat')!, null), liftOf(getExercise('bb-squat')!, null)];
    assert.ok(rampFor(lifts, 1, 100, 2.5, true).length < rampFor(lifts, 0, 100, 2.5, true).length);
  });
});

describe('a long break', () => {
  test('coming back after a month starts lighter, and says why', () => {
    const { day } = plan();
    const slot = getSlots(day.id)[0]!;
    const long = addDays(todayISO(), -40);
    session(day.id, 'bb-squat', Array.from({ length: 3 }, () => ({ weight: 100, reps: 8, rir: 2 })), long);

    const s = suggestFor(getExercise('bb-squat')!, slot, undefined, suggestionContext());
    assert.equal(s.adjustment, 'return');
    assert.ok(s.weight < 100, `expected a lighter restart, got ${s.weight}`);
    assert.match(s.reason, /weeks/);
  });
});
