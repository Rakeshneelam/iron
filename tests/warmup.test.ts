import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rampSets, sessionWarmup, warmedStates, WARMUP_BUDGET_S, type SessionLift } from '../src/engine/warmup.ts';
import { alternativesFor, cooldown, recoverySession } from '../src/engine/recovery.ts';

const lift = (name: string, pattern: string, equipment = 'barbell', compound = true, primary: string[] = [], repHi = 8): SessionLift =>
  ({ name, pattern, equipment, compound, primary, repHi });

const GYM = { level: 'intermediate' as const, available: new Set(['band', 'cardio_machine', 'pullup_bar']) };
const HOME = { level: 'beginner' as const, available: new Set<string>() };

const lower = [lift('Squat', 'squat', 'barbell', true, ['quads', 'glutes']), lift('RDL', 'hinge', 'barbell', true, ['hamstrings']), lift('Leg Press', 'squat', 'machine', true, ['quads']), lift('Leg Curl', 'knee_flexion', 'machine', false, ['hamstrings'])];
const upper = [lift('Bench', 'horizontal_push', 'barbell', true, ['chest']), lift('Row', 'horizontal_pull', 'barbell', true, ['back']), lift('OHP', 'vertical_push', 'barbell', true, ['shoulders'])];
const ids = (r: { items: { drill: { id: string } }[] }) => r.items.map((i) => i.drill.id);

describe('session warm-up', () => {
  test('lower-body day: squat and hinge prep, hip/ankle mobility, no static stretching', () => {
    const w = sessionWarmup(lower, 'standard', GYM);
    const got = ids(w);
    assert.ok(got.includes('p-bw-squat'));
    assert.ok(got.includes('p-hip-hinge'));
    assert.ok(w.items.some((i) => i.phase === 'mobility' && i.drill.regions.some((r) => r === 'hips' || r === 'ankles')));
    assert.ok(!w.items.some((i) => i.drill.kind === 'stretch'));
    assert.ok(w.seconds <= WARMUP_BUDGET_S.standard);
  });

  test('upper-body day: pressing prep and shoulder work, nothing for the legs', () => {
    const w = sessionWarmup(upper, 'standard', GYM);
    assert.ok(ids(w).includes('p-incline-pushup'));
    assert.ok(w.items.some((i) => i.drill.regions.includes('shoulders')));
    assert.ok(!w.items.some((i) => i.phase === 'prep' && i.drill.regions.includes('quads')));
  });

  test('full-body day gets one warm-up covering both, not one per lift', () => {
    const w = sessionWarmup([lower[0]!, upper[0]!, upper[1]!, lower[1]!], 'full', GYM);
    const got = ids(w);
    assert.equal(new Set(got).size, got.length, 'no duplicates');
    assert.ok(got.includes('p-bw-squat') && got.includes('p-incline-pushup'));
    assert.ok(w.seconds <= WARMUP_BUDGET_S.full);
  });

  test('quick keeps the highest-priority pieces rather than truncating', () => {
    const quick = sessionWarmup(lower, 'quick', GYM);
    const full = sessionWarmup(lower, 'full', GYM);
    assert.ok(quick.seconds <= WARMUP_BUDGET_S.quick);
    assert.ok(ids(quick).includes('p-bw-squat'), 'prep for the first lift survives');
    assert.ok(!quick.items.some((i) => i.phase === 'general'), 'the cardio block is the first thing dropped');
    assert.ok(full.items.some((i) => i.phase === 'general'));
    assert.ok(full.items.length > quick.items.length);
  });

  test('home with no equipment never needs a band, bar or cardio machine', () => {
    const w = sessionWarmup([lift('Push-Up', 'horizontal_push', 'bodyweight'), lift('Split Squat', 'lunge', 'bodyweight')], 'standard', HOME);
    assert.ok(w.items.every((i) => i.drill.equipment === 'none'));
    assert.ok(w.items.every((i) => i.drill.level !== 'intermediate'), 'beginner-appropriate drills only');
    assert.ok(!w.items.some((i) => i.phase === 'prep'), 'bodyweight lifts are their own prep');
  });

  test('empty session → empty warm-up', () => {
    assert.equal(sessionWarmup([], 'standard', GYM).items.length, 0);
  });
});

describe('warm-up sets', () => {
  const base = { equipment: 'barbell', loadStep: 2.5, repHi: 5, compound: true, warmed: 'none' as const, generalDone: true };

  test('heavy compound ramps from the empty bar, ascending, never reaching the work weight', () => {
    const r = rampSets({ ...base, workKg: 140 });
    assert.equal(r[0]?.kg, 20);
    assert.ok(r.length >= 3 && r.length <= 6);
    for (let i = 1; i < r.length; i++) assert.ok(r[i]!.kg > r[i - 1]!.kg);
    assert.ok(r.every((s) => s.kg < 140));
    assert.ok(r[r.length - 1]!.reps <= 3, 'last ramp set is low-rep');
  });

  test('a second lift of the same pattern needs only one or two sets', () => {
    assert.ok(rampSets({ ...base, workKg: 100, warmed: 'pattern' }).length <= 2);
  });

  test('isolation work after its muscle is warm needs none', () => {
    assert.deepEqual(rampSets({ ...base, compound: false, workKg: 30, warmed: 'muscle' }), []);
  });

  test('bodyweight and band exercises get no ramp', () => {
    assert.deepEqual(rampSets({ ...base, equipment: 'bodyweight', workKg: 10 }), []);
    assert.deepEqual(rampSets({ ...base, equipment: 'band', workKg: 1 }), []);
  });

  test('skipping the session warm-up adds a light set to the first big lift', () => {
    const done = rampSets({ ...base, workKg: 100, repHi: 10, generalDone: true });
    const skipped = rampSets({ ...base, workKg: 100, repHi: 10, generalDone: false });
    assert.ok(skipped.length > done.length);
  });

  test('light dumbbell work gets at most one set', () => {
    assert.ok(rampSets({ ...base, equipment: 'dumbbell', loadStep: 2, workKg: 16, repHi: 12 }).length <= 1);
  });

  test('warmedStates marks repeats of a pattern and of a muscle', () => {
    assert.deepEqual(warmedStates([lower[0]!, lower[2]!, lower[3]!, lower[1]!]), ['none', 'pattern', 'none', 'muscle']);
  });
});

describe('cooldown and recovery', () => {
  const trained = [{ primary: ['quads', 'glutes'], sets: 6 }, { primary: ['hamstrings'], sets: 3 }];

  test('cooldown stretches what was trained and ends with breathing', () => {
    const c = cooldown(trained, 'standard', GYM.available);
    assert.ok(c.items.some((i) => i.drill.kind === 'stretch' && i.drill.regions.some((r) => ['quads', 'hips', 'glutes', 'hamstrings'].includes(r))));
    assert.equal(c.items[c.items.length - 1]?.drill.kind, 'breathing');
    assert.ok(!c.items.some((i) => i.drill.regions.includes('chest')), 'no chest stretch after a leg day');
  });

  test('short cooldown is shorter than standard', () => {
    assert.ok(cooldown(trained, 'short', GYM.available).seconds < cooldown(trained, 'standard', GYM.available).seconds);
  });

  test('recovery day is gentle: no activation, prep or hard cardio', () => {
    const r = recoverySession(['chest'], HOME.available);
    assert.ok(r.items.every((i) => ['mobility', 'stretch', 'breathing'].includes(i.phase)));
    assert.ok(r.seconds <= 12 * 60);
  });

  test('replace offers same-kind drills for the same area', () => {
    const c = cooldown(trained, 'standard', GYM.available);
    const stretch = c.items.find((i) => i.phase === 'stretch')!;
    const alts = alternativesFor(stretch, new Set(), GYM.available);
    assert.ok(alts.length > 0 && alts.every((d) => d.kind === 'stretch'));
  });
});
