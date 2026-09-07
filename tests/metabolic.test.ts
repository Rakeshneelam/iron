import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  weightTrend, weeklyRateKg, adaptiveTDEE, dailyTargets, phaseCheck,
  hydrationTargetMl, scheduleHydration, bmrMifflin, fmtTime,
  type WeighIn, type IntakeDay,
} from '../src/engine/metabolic.ts';

const day = (i: number) => new Date(Date.parse('2026-08-01') + i * 86_400_000).toISOString().slice(0, 10);

/** 84 kg drifting down ~0.2 kg/wk, with realistic daily water noise on top. */
const weighIns: WeighIn[] = Array.from({ length: 28 }, (_, i) => ({
  date: day(i),
  kg: 84 - i * 0.03 + (i % 3 === 0 ? 0.7 : -0.4),
}));
const intake: IntakeDay[] = weighIns.map((w) => ({ date: w.date, kcal: 2300 }));

describe('weightTrend', () => {
  test('smooths noise instead of following it', () => {
    const t = weightTrend(weighIns);
    const rawSwing = Math.max(...weighIns.map((w) => w.kg)) - Math.min(...weighIns.map((w) => w.kg));
    const trendSwing = Math.max(...t.map((x) => x.trend)) - Math.min(...t.map((x) => x.trend));
    assert.ok(trendSwing < rawSwing);
  });
  test('keeps the raw value alongside the trend so the UI can show both', () => {
    const t = weightTrend(weighIns);
    assert.equal(t[0]!.raw, weighIns[0]!.kg);
  });
});

describe('weeklyRateKg', () => {
  test('reports a downward drift as negative', () => {
    assert.ok(weeklyRateKg(weighIns) < 0);
  });
  test('returns 0 rather than guessing from too little data', () => {
    assert.equal(weeklyRateKg(weighIns.slice(0, 3)), 0);
  });
});

describe('adaptiveTDEE', () => {
  test('returns null until there is enough data to be honest', () => {
    assert.equal(adaptiveTDEE(intake.slice(0, 5), weighIns.slice(0, 5)), null);
  });
  test('lands above intake when weight is falling', () => {
    const r = adaptiveTDEE(intake, weighIns);
    assert.ok(r);
    assert.ok(r!.tdee > 2300);
    assert.ok(r!.confidence > 0 && r!.confidence <= 1);
  });
});

describe('dailyTargets', () => {
  test('labels formula estimates as estimates', () => {
    const t = dailyTargets({ weightKg: 84, heightCm: 173, age: 29, sex: 'male', phase: 'recomp' });
    assert.equal(t.basis, 'estimated');
  });
  test('uses measured TDEE when it exists', () => {
    const t = dailyTargets({ weightKg: 84, heightCm: 173, age: 29, sex: 'male', phase: 'recomp', tdee: 2800 });
    assert.equal(t.basis, 'measured');
    assert.ok(t.kcal < 2800);
  });
  test('protein scales with bodyweight and macros reconcile to the calorie target', () => {
    const t = dailyTargets({ weightKg: 84, heightCm: 173, age: 29, sex: 'male', phase: 'recomp', tdee: 2800 });
    assert.ok(t.proteinG >= 84 * 1.8);
    const fromMacros = t.proteinG * 4 + t.carbG * 4 + t.fatG * 9;
    assert.ok(Math.abs(fromMacros - t.kcal) < 25);
  });
  test('a cut is stricter than a bulk', () => {
    const base = { weightKg: 84, heightCm: 173, age: 29, sex: 'male' as const, tdee: 2800 };
    assert.ok(dailyTargets({ ...base, phase: 'cut' }).kcal < dailyTargets({ ...base, phase: 'bulk' }).kcal);
  });
  test('bmr is in a sane range for him', () => {
    const b = bmrMifflin(84, 173, 29, 'male');
    assert.ok(b > 1600 && b < 2000);
  });
});

describe('phaseCheck', () => {
  test('tells him to eat more when the scale is falling too fast', () => {
    const r = phaseCheck('cut', 84, -1.2);
    assert.equal(r.onTrack, false);
    assert.ok(r.suggestedKcalDelta > 0);
  });
  test('is quiet when the rate is inside the band', () => {
    assert.equal(phaseCheck('recomp', 84, -0.1).onTrack, true);
  });
});

describe('hydration', () => {
  test('training and heat raise the target', () => {
    const rest = hydrationTargetMl({ weightKg: 84, trainingToday: false });
    const hot = hydrationTargetMl({ weightKg: 84, trainingToday: true, trainingMinutes: 70, ambientTempC: 38 });
    assert.ok(hot > rest);
    assert.ok(rest > 2000 && rest < 3200);
  });

  test('says nothing when he is already at target — the whole point', () => {
    assert.deepEqual(scheduleHydration({ targetMl: 3000, consumedMl: 3000, nowMinutes: 13 * 60 }), []);
  });

  test('spaces the remainder across the rest of the waking day', () => {
    const slots = scheduleHydration({ targetMl: 3000, consumedMl: 900, nowMinutes: 13 * 60 });
    assert.ok(slots.length > 1);
    const total = slots.reduce((a, s) => a + s.amountMl, 0);
    assert.ok(Math.abs(total - 2100) < 200);
  });

  test('never schedules past bedtime', () => {
    const sleep = 22 * 60 + 30;
    const slots = scheduleHydration({ targetMl: 3000, consumedMl: 500, nowMinutes: 13 * 60, sleepMinutes: sleep });
    assert.ok(slots.every((s) => s.atMinutes < sleep));
  });

  test('calls out a deficit once rather than firing three nudges', () => {
    const slots = scheduleHydration({ targetMl: 3000, consumedMl: 100, nowMinutes: 17 * 60 });
    assert.equal(slots.filter((s) => s.label.includes('behind')).length, 1);
  });

  test('formats slot times as wall clock', () => {
    assert.equal(fmtTime(13 * 60 + 5), '13:05');
  });
});
