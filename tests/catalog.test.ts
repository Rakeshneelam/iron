import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, CATALOG_BY_ID, CURATED } from '../src/data/catalog/index.ts';
import { DRILLS } from '../src/data/drills.ts';
import { PLAN_TEMPLATES } from '../src/data/templates.ts';
import { substitutes } from '../src/engine/substitute.ts';
import type { Accessory, Equipment } from '../src/data/catalog/types.ts';

const set = (...x: (Equipment | Accessory)[]) => new Set<Equipment | Accessory>(x);

describe('catalogue integrity', () => {
  test('ids are unique across exercises and drills', () => {
    const ids = [...CATALOG.map((e) => e.id), ...DRILLS.map((d) => d.id)];
    assert.equal(new Set(ids).size, ids.length);
  });

  test('every easier/harder/alt reference exists', () => {
    for (const e of CATALOG) for (const id of [...(e.easier ?? []), ...(e.harder ?? []), ...(e.alts ?? [])]) assert.ok(CATALOG_BY_ID.has(id), `${e.id} → ${id}`);
  });

  /**
   * Two tiers, two standards. Everything in the library has to be able to explain
   * itself — a set-up and the movement — because that is what the how-to renders.
   * Common mistakes are hand-written coaching and only the curated 95 have them:
   * the imported set has instructions but no corrections, and inventing them would
   * be worse than leaving the section out.
   */
  test('every entry has a setup and steps', () => {
    for (const e of CATALOG) assert.ok(e.setup && e.steps.length, e.id);
  });

  test('every curated entry also has common mistakes', () => {
    assert.ok(CURATED.length >= 90, 'the hand-written catalogue is still here');
    for (const e of CURATED) assert.ok(e.mistakes.length, e.id);
  });

  test('the imported tier never shadows a curated id', () => {
    for (const e of CURATED) assert.equal(CATALOG_BY_ID.get(e.id), e, `${e.id} was overwritten by an import`);
  });

  test('every template exercise exists and rep ranges are sane', () => {
    for (const t of PLAN_TEMPLATES) {
      for (const d of t.days) {
        for (const s of d.slots) {
          const e = CATALOG_BY_ID.get(s.exerciseId);
          assert.ok(e, `${t.id}: ${s.exerciseId}`);
          assert.ok(s.repLo <= s.repHi && s.targetSets >= 1 && s.restSeconds >= 30, `${t.id}: ${s.exerciseId}`);
          if (e?.measure === 'time') assert.ok(s.repLo >= 10, `${t.id}: ${s.exerciseId} time range is in seconds`);
        }
      }
    }
  });
});

describe('substitution', () => {
  const bench = CATALOG_BY_ID.get('bb-bench')!;
  const squat = CATALOG_BY_ID.get('bb-squat')!;

  test('dumbbell-only: bench press → dumbbell pressing first, nothing needing a machine', () => {
    const subs = substitutes(bench, CATALOG, { available: set('dumbbell', 'bench') });
    assert.equal(subs[0]?.id, 'db-bench');
    for (const s of subs) {
      const e = CATALOG_BY_ID.get(s.id)!;
      assert.ok(['dumbbell', 'bodyweight'].includes(e.equipment), s.id);
    }
    assert.ok(subs[0]!.reasons.length > 0);
  });

  test('no equipment: squat → bodyweight squat or split squat', () => {
    const subs = substitutes(squat, CATALOG, { available: set() }).map((s) => s.id);
    assert.ok(subs.includes('bw-squat') || subs.includes('split-squat'));
    assert.ok(subs.every((id) => CATALOG_BY_ID.get(id)!.equipment === 'bodyweight'));
  });

  test('flagged knees remove lunges; disliked exercises never appear', () => {
    const gym = set('barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'smith', 'band', 'bench', 'rack', 'box', 'pullup_bar');
    const subs = substitutes(squat, CATALOG, { available: gym, limitations: new Set(['knees']), disliked: new Set(['leg-press']) }).map((s) => s.id);
    assert.ok(!subs.includes('leg-press'));
    for (const id of subs) assert.ok(!(CATALOG_BY_ID.get(id)!.stress ?? []).includes('knees'), id);
  });

  test('timed exercises only swap for timed exercises', () => {
    const plank = CATALOG_BY_ID.get('plank')!;
    const subs = substitutes(plank, CATALOG, { available: set() });
    assert.ok(subs.every((s) => CATALOG_BY_ID.get(s.id)!.measure === 'time'));
  });
});
