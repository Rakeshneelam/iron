import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { recommend, type RecExercise, type RecInput } from '../src/engine/recommend.ts';
import { VOLUME_LANDMARKS } from '../src/engine/progression.ts';

const ex = (over: Partial<RecExercise> = {}): RecExercise => ({
  exerciseId: 'bb-bench', name: 'Bench', primaryMuscle: 'chest', slotId: 'slot-1', targetSets: 3,
  planned: 4, skipped: 0, trained: 4, painSessions: 0, trend: 1, trendSessions: 4, consecutiveResets: 0,
  ...over,
});

const input = (over: Partial<RecInput> = {}): RecInput => ({
  exercises: [ex()],
  plannedWeeklySets: { chest: 12 },
  landmarks: VOLUME_LANDMARKS,
  consistency: { weeks: 4, daysPerWeek: 4, done: 16, skippedDays: 0 },
  avgSessionRpe: null,
  ...over,
});

describe('recommend', () => {
  test('progressing and in range → only "keep going"', () => {
    const r = recommend(input());
    assert.equal(r.length, 1);
    assert.equal(r[0]?.kind, 'keep_going');
  });

  test('repeated pain → replace, before anything else', () => {
    const r = recommend(input({ exercises: [ex({ painSessions: 2, trend: -1 })] }));
    assert.equal(r[0]?.kind, 'replace_exercise');
    assert.equal(r[0]?.id, 'pain:bb-bench');
    // the same exercise is not also told to add a set
    assert.ok(!r.some((x) => x.kind === 'add_set' && x.exerciseId === 'bb-bench'));
  });

  test('stalled with room under MAV → add a set as an approvable change', () => {
    const r = recommend(input({ exercises: [ex({ trend: 0 })] }));
    const add = r.find((x) => x.kind === 'add_set');
    assert.deepEqual(add?.change, { slotId: 'slot-1', targetSets: 4 });
  });

  test('stalled after two resets → swap advice, no plan change', () => {
    const r = recommend(input({ exercises: [ex({ trend: -0.5, consecutiveResets: 2 })] }));
    assert.equal(r[0]?.kind, 'replace_exercise');
    assert.equal(r[0]?.change, undefined);
  });

  test('over MRV → remove a set; under MEV → add a set', () => {
    const over = recommend(input({ plannedWeeklySets: { chest: 30 } }));
    assert.ok(over.some((x) => x.kind === 'remove_set' && x.change?.targetSets === 2));
    const under = recommend(input({ plannedWeeklySets: { chest: 3 } }));
    assert.ok(under.some((x) => x.kind === 'add_set' && x.change?.targetSets === 4));
  });

  test('often skipped exercise is flagged', () => {
    const r = recommend(input({ exercises: [ex({ planned: 4, skipped: 3 })] }));
    assert.ok(r.some((x) => x.id === 'skipped:bb-bench'));
  });

  test('low consistency suggests fewer days; one missed week does not', () => {
    const low = recommend(input({ consistency: { weeks: 4, daysPerWeek: 5, done: 8, skippedDays: 3 } }));
    assert.ok(low.some((x) => x.kind === 'fewer_days'));
    const short = recommend(input({ consistency: { weeks: 1, daysPerWeek: 5, done: 1, skippedDays: 0 } }));
    assert.ok(!short.some((x) => x.kind === 'fewer_days'));
  });

  test('never proposes more than 6 sets', () => {
    const r = recommend(input({ exercises: [ex({ trend: 0, targetSets: 6 })] }));
    assert.ok(!r.some((x) => x.change && x.change.targetSets > 6));
  });
});
