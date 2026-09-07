import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  prescribe, e1RM, roundToStep, slope, readinessModifier,
  shouldDeload, acwr, volumeStatus, buildWarmups,
  type ExerciseConfig, type SessionLog, type SetLog,
} from '../src/engine/progression.ts';

const bench: ExerciseConfig = {
  id: 'bb-bench', name: 'Barbell Bench Press', goal: 'hypertrophy',
  repRange: [6, 10], targetSets: 3, targetRIR: 1,
  loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['chest', 'triceps'],
};

const sess = (date: string, sets: SetLog[]): SessionLog =>
  ({ sessionId: date, date, exerciseId: 'bb-bench', sets });

const uniform = (weight: number, reps: number, rir: number, n = 3): SetLog[] =>
  Array.from({ length: n }, () => ({ weight, reps, rir }));

describe('e1RM', () => {
  test('rises with reps and with RIR', () => {
    assert.ok(e1RM(60, 8, 2) > e1RM(60, 8, 0));
    assert.ok(e1RM(60, 10, 0) > e1RM(60, 5, 0));
  });
  test('a single rep at RIR 0 is roughly the weight itself', () => {
    assert.ok(Math.abs(e1RM(100, 1, 0) - 100) < 3);
  });
  test('clamps absurd effective reps instead of extrapolating to nonsense', () => {
    assert.equal(e1RM(40, 30, 5), e1RM(40, 15, 0));
  });
});

describe('roundToStep', () => {
  test('never returns an unloadable weight', () => {
    assert.equal(roundToStep(61.3, 2.5), 62.5);
    assert.equal(roundToStep(23.75, 2), 24);
  });
});

describe('slope', () => {
  test('signs the direction of a series', () => {
    assert.ok(slope([1, 2, 3, 4]) > 0);
    assert.ok(slope([4, 3, 2, 1]) < 0);
    assert.equal(slope([2, 2, 2]), 0);
  });
});

describe('readinessModifier', () => {
  test('never scales load up', () => {
    assert.equal(readinessModifier({ sleepHours: 9, soreness: 1, stress: 1 }), 1);
    assert.equal(readinessModifier(undefined), 1);
  });
  test('scales down on a bad day', () => {
    assert.ok(readinessModifier({ sleepHours: 4, soreness: 5, stress: 5 }) < 1);
  });
});

describe('prescribe', () => {
  test('calibrates with no history', () => {
    const p = prescribe(bench, []);
    assert.equal(p.verdict, 'CALIBRATE');
    assert.equal(p.confidence, 0);
  });

  test('adds load when the top of the range is cleared at target RIR', () => {
    const p = prescribe(bench, [sess('2026-09-05', uniform(60, 10, 2))]);
    assert.equal(p.verdict, 'ADD_LOAD');
    assert.ok(p.weight > 60);
    assert.equal(p.weight % bench.loadStep, 0);
  });

  test('holds when the range is cleared but it was a grind', () => {
    const p = prescribe(bench, [sess('2026-09-05', uniform(60, 10, 0))]);
    assert.equal(p.verdict, 'HOLD');
    assert.equal(p.weight, 60);
  });

  test('chases a rep mid-range', () => {
    const p = prescribe(bench, [sess('2026-09-05', uniform(60, 8, 1))]);
    assert.equal(p.verdict, 'ADD_REPS');
    assert.equal(p.weight, 60);
    assert.equal(p.repTarget[0], 9);
  });

  test('backs off when reps collapse below the floor', () => {
    const p = prescribe(bench, [sess('2026-09-05', uniform(75, 3, 0))]);
    assert.equal(p.verdict, 'BACKOFF');
    assert.ok(p.weight < 75);
  });

  test('a pain flag overrides everything, even a clean session', () => {
    const sets = uniform(60, 10, 2);
    sets[0]!.painFlag = true;
    const p = prescribe(bench, [sess('2026-09-05', sets)]);
    assert.equal(p.verdict, 'BACKOFF');
    assert.ok(p.weight < 60);
  });

  const stalled = [
    sess('2026-09-05', uniform(65, 7, 0)),
    sess('2026-09-01', uniform(65, 8, 0)),
    sess('2026-08-28', uniform(65, 8, 0)),
  ];

  test('buys progress with a set when volume is below MAV', () => {
    const p = prescribe(bench, stalled, undefined, 10, 16);
    assert.equal(p.verdict, 'ADD_SET');
    assert.equal(p.sets, bench.targetSets + 1);
  });

  test('resets load when volume is already at MAV', () => {
    const p = prescribe({ ...bench, targetSets: 5 }, stalled, undefined, 18, 16);
    assert.equal(p.verdict, 'RESET');
    assert.ok(p.weight < 65);
  });

  test('swaps the movement after two failed resets', () => {
    const p = prescribe({ ...bench, targetSets: 5, consecutiveResets: 2 }, stalled, undefined, 18, 16);
    assert.equal(p.verdict, 'SWAP');
  });

  test('a terrible day never costs more than one step', () => {
    const p = prescribe(bench, [sess('2026-09-05', uniform(60, 8, 1))],
      { sleepHours: 3, soreness: 5, stress: 5 });
    assert.ok(p.weight >= 60 - bench.loadStep);
  });

  test('every prescription carries a reason the UI can show', () => {
    const p = prescribe(bench, [sess('2026-09-05', uniform(60, 10, 2))]);
    assert.ok(p.reason.length > 20);
  });

  test('warmups ramp up to but never reach the working weight', () => {
    const w = buildWarmups(100, bench);
    assert.ok(w.length > 0);
    assert.ok(w.every((s) => s.weight < 100));
    assert.ok(w[0]!.weight < w[w.length - 1]!.weight);
  });
});

describe('deload', () => {
  test('needs two independent signals, not one', () => {
    const only = shouldDeload({
      exerciseTrends: [1, 2, 1], dailyTonnage: Array(28).fill(5000),
      avgRIR7d: 2, poorReadinessDays: 0, weeksSinceDeload: 9,
    });
    assert.equal(only.deload, false);
  });

  test('fires when the picture is consistently bad', () => {
    const d = shouldDeload({
      exerciseTrends: [-1, -0.5, 0.2, -2],
      dailyTonnage: Array.from({ length: 28 }, (_, i) => (i > 20 ? 9000 : 5000)),
      avgRIR7d: 0.5, poorReadinessDays: 4, weeksSinceDeload: 9,
    });
    assert.equal(d.deload, true);
    assert.ok(d.reasons.length >= 2);
  });

  test('acwr flags a volume spike', () => {
    assert.ok(acwr(Array.from({ length: 28 }, (_, i) => (i > 20 ? 10000 : 4000))) > 1.5);
  });
});

describe('volumeStatus', () => {
  test('maps sets onto landmarks', () => {
    assert.equal(volumeStatus('chest', 4), 'under');
    assert.equal(volumeStatus('chest', 14), 'optimal');
    assert.equal(volumeStatus('chest', 30), 'over');
  });
});
