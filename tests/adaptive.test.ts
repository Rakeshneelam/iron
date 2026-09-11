import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prescribe, type ExerciseConfig, type SessionLog, type SetLog } from '../src/engine/progression.ts';
import { adaptForBand, adaptForTime, adjustForGap, RULE_TEXT } from '../src/engine/adjust.ts';
import { detectRecords, workoutMilestone } from '../src/engine/records.ts';
import { weeklyInsights, type WeekFacts } from '../src/engine/insights.ts';
import { adaptTemplate, fitSession, recommendTemplates, PRESET_TOOLS, type TrainingProfile } from '../src/engine/planner.ts';
import { CATALOG_BY_ID } from '../src/data/catalog/index.ts';
import { PLAN_TEMPLATES } from '../src/data/templates.ts';

const cfg: ExerciseConfig = { id: 'db-bench', name: 'Dumbbell Bench Press', goal: 'hypertrophy', repRange: [8, 12], targetSets: 3, targetRIR: 2, loadType: 'dumbbell', loadStep: 2, primaryMuscles: ['chest'] };
const sess = (date: string, sets: SetLog[]): SessionLog => ({ sessionId: date, date, exerciseId: cfg.id, sets });
const uniform = (weight: number, reps: number, rir: number, n = 3): SetLog[] => Array.from({ length: n }, () => ({ weight, reps, rir }));

describe('progression scenarios', () => {
  test('beginner first workout: calibrate, with a reason', () => {
    const p = prescribe(cfg, []);
    assert.equal(p.verdict, 'CALIBRATE');
    assert.ok(RULE_TEXT.CALIBRATE.length > 20);
  });

  test('top of the range on every set → add the smallest step (20 → 22 kg), and the reason says why', () => {
    const p = prescribe(cfg, [sess('2026-09-08', uniform(20, 12, 2))]);
    assert.equal(p.verdict, 'ADD_LOAD');
    assert.equal(p.weight, 22);
    assert.match(p.reason, /12/);
  });

  test('repeatedly failing the rep floor → back off, never add', () => {
    const p = prescribe(cfg, [sess('2026-09-08', uniform(24, 5, 0)), sess('2026-09-04', uniform(24, 6, 0))]);
    assert.equal(p.verdict, 'BACKOFF');
    assert.ok(p.weight < 24);
  });
});

describe('real-life gaps', () => {
  const ready = prescribe(cfg, [sess('2026-08-01', uniform(20, 12, 2))]);

  test('about two weeks off: hold the old weight instead of adding', () => {
    const a = adjustForGap(ready, 14, 20, 2);
    assert.equal(a.verdict, 'HOLD');
    assert.equal(a.weight, 20);
    assert.equal(a.adjustment, 'hold-gap');
  });

  test('back after a month: start ~10% lighter; after two months ~20%', () => {
    assert.equal(adjustForGap(ready, 30, 40, 2).weight, 36);
    assert.equal(adjustForGap(ready, 60, 40, 2).weight, 32);
    assert.match(adjustForGap(ready, 30, 40, 2).reason, /weeks/);
  });

  test('a normal gap changes nothing', () => {
    assert.deepEqual(adjustForGap(ready, 4, 20, 2), ready);
  });

  test('timed sets talk in seconds and never "add 2.5 kg"', () => {
    const plank: ExerciseConfig = { ...cfg, id: 'plank', name: 'Plank', repRange: [20, 40], loadType: 'bodyweight', loadStep: 2.5 };
    const add = prescribe(plank, [{ sessionId: 'x', date: '2026-09-08', exerciseId: 'plank', sets: uniform(0, 40, 2) }]);
    const t = adaptForTime(add, 0, 'Ab Wheel Rollout');
    assert.equal(t.verdict, 'HOLD');
    assert.equal(t.weight, 0);
    assert.match(t.reason, /Ab Wheel/);
  });

  test('bands: progress means a stronger band, the logged level stays', () => {
    const add = prescribe({ ...cfg, loadType: 'bodyweight', loadStep: 1 }, [sess('2026-09-08', uniform(3, 12, 2))]);
    const b = adaptForBand(add, 3);
    assert.equal(b.weight, 3);
    assert.match(b.reason, /stronger band/);
  });
});

describe('records', () => {
  const prior = [[{ weight: 60, reps: 8, e1rm: 76 }, { weight: 60, reps: 8, e1rm: 76 }], [{ weight: 62.5, reps: 6, e1rm: 75 }]];

  test('first-ever session is not a record', () => {
    assert.deepEqual(detectRecords([], [{ weight: 60, reps: 8, e1rm: 76 }]), []);
  });

  test('heavier weight and a better estimate are both detected', () => {
    const r = detectRecords(prior, [{ weight: 65, reps: 6, e1rm: 79 }]).map((x) => x.kind);
    assert.ok(r.includes('weight') && r.includes('e1rm'));
  });

  test('more reps at a weight lifted before', () => {
    const r = detectRecords(prior, [{ weight: 60, reps: 10, e1rm: 80 }]);
    assert.ok(r.some((x) => x.kind === 'reps' && x.value === 10 && x.previous === 8));
  });

  test('a normal session is not a record', () => {
    assert.deepEqual(detectRecords(prior, [{ weight: 60, reps: 7, e1rm: 74 }]), []);
  });

  test('milestones only on round numbers', () => {
    assert.equal(workoutMilestone(25), '25 workouts logged');
    assert.equal(workoutMilestone(26), null);
  });
});

describe('weekly insights', () => {
  const base: WeekFacts = {
    planned: 4, done: 4, skipped: 0, sets: { upper: 30, lower: 24 }, prevSets: { upper: 30, lower: 24 },
    lifts: [], records: 0, bodyweightChange: null, goal: 'cut', water: { hit: 6, days: 7 }, skippedLabels: [], nutrition: null,
  };

  test('says what improved and explains a volume drop with the skipped day', () => {
    const out = weeklyInsights({
      ...base, done: 3, skipped: 1, sets: { upper: 30, lower: 12 }, skippedLabels: ['Lower B'],
      lifts: [{ name: 'Bench', region: 'push', e1rmDelta: 2.5 }],
    });
    assert.ok(out.some((s) => /pressing strength improved/.test(s)));
    assert.ok(out.some((s) => /Lower-body volume dropped 50% — Lower B was skipped/.test(s)));
    assert.ok(out.length <= 3);
  });

  test('flags weight moving against the goal, and poor water', () => {
    const out = weeklyInsights({ ...base, bodyweightChange: 0.6, water: { hit: 1, days: 7 } });
    assert.ok(out.some((s) => /against your fat-loss goal/.test(s)));
    assert.ok(out.some((s) => /Water target hit on 1 of 7/.test(s)));
  });

  test('protein shortfall is named with numbers, and steady protein is praised once', () => {
    const short = weeklyInsights({ ...base, nutrition: { daysLogged: 5, days: 7, avgProteinG: 90, targetProteinG: 150 } });
    assert.ok(short.some((s) => /Protein averaged 90 g/.test(s)));
    const ok = weeklyInsights({ ...base, nutrition: { daysLogged: 6, days: 7, avgProteinG: 148, targetProteinG: 150 } });
    assert.ok(ok.some((s) => /Protein held at 148 g/.test(s)));
    // Two logged days is not enough to judge intake, so it only nudges.
    const thin = weeklyInsights({ ...base, nutrition: { daysLogged: 2, days: 7, avgProteinG: 60, targetProteinG: 150 } });
    assert.ok(thin.some((s) => /Food logged on 2 of 7 days/.test(s)));
    assert.ok(!thin.some((s) => /Protein averaged/.test(s)));
  });

  test('a missed week gets a no-guilt message first', () => {
    assert.match(weeklyInsights({ ...base, done: 0 })[0] ?? '', /waiting where you left off/);
  });
});

describe('planner', () => {
  const profile = (over: Partial<TrainingProfile> = {}): TrainingProfile => ({
    goal: 'hypertrophy', level: 'intermediate', daysPerWeek: 4, minutes: 60,
    tools: new Set(PRESET_TOOLS.gym), disliked: new Set(), limitations: new Set(), ...over,
  });

  test('recommends a plan that matches days, level and goal', () => {
    const top = recommendTemplates(profile(), PLAN_TEMPLATES, CATALOG_BY_ID)[0]!;
    assert.equal(top.template.daysPerWeek, 4);
    assert.equal(top.template.goal, 'hypertrophy');
    assert.ok(top.reasons.length >= 2);
  });

  test('beginner at home with no equipment gets a bodyweight plan', () => {
    const top = recommendTemplates(profile({ level: 'beginner', daysPerWeek: 3, minutes: 30, goal: 'general', tools: new Set(PRESET_TOOLS.bodyweight) }), PLAN_TEMPLATES, CATALOG_BY_ID)[0]!;
    assert.equal(top.template.equipment, 'bodyweight');
    assert.ok(top.fits);
  });

  test('equipment unavailable: a gym plan adapted to dumbbells swaps, never keeps unavailable lifts', () => {
    const t = PLAN_TEMPLATES.find((x) => x.id === 'upper-lower-4')!;
    const a = adaptTemplate(t, profile({ tools: new Set(PRESET_TOOLS.dumbbells) }), CATALOG_BY_ID);
    assert.ok(a.swaps.length > 0);
    for (const d of a.days) for (const s of d.slots) {
      const e = CATALOG_BY_ID.get(s.exerciseId)!;
      assert.ok(['dumbbell', 'bodyweight'].includes(e.equipment), s.exerciseId);
    }
  });

  test('disliked exercises are swapped out', () => {
    const t = PLAN_TEMPLATES.find((x) => x.id === 'beginner-dumbbell')!;
    const a = adaptTemplate(t, profile({ tools: new Set(PRESET_TOOLS.dumbbells), disliked: new Set(['goblet-squat']) }), CATALOG_BY_ID);
    assert.ok(a.days.every((d) => d.slots.every((s) => s.exerciseId !== 'goblet-squat')));
  });

  test('short workout: keeps the first lifts, trims accessories first', () => {
    const slots = [
      { exerciseId: 'bb-squat', sets: 3, restSeconds: 180, compound: true, repHi: 8 },
      { exerciseId: 'rdl', sets: 3, restSeconds: 150, compound: true, repHi: 10 },
      { exerciseId: 'leg-press', sets: 3, restSeconds: 120, compound: true, repHi: 15 },
      { exerciseId: 'leg-curl', sets: 3, restSeconds: 75, compound: false, repHi: 15 },
      { exerciseId: 'calf-raise', sets: 3, restSeconds: 75, compound: false, repHi: 15 },
    ];
    const f = fitSession(slots, 30, 300);
    assert.equal(f.slots[0]?.exerciseId, 'bb-squat');
    assert.ok(f.dropped.includes('calf-raise'));
    assert.ok(!f.dropped.includes('bb-squat') && !f.dropped.includes('rdl'));
    assert.ok(f.minutes <= 30 || f.over);
    const full = fitSession(slots, 120, 300);
    assert.equal(full.dropped.length + full.trimmed.length, 0, 'enough time → unchanged');
  });
});
