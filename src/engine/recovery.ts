/**
 * After training and on rest days. PURE.
 *
 * Static stretching belongs here rather than before lifting (Behm 2016). It is
 * optional: the cooldown is short by default and every item can be skipped or
 * swapped. Rest-day mobility is gentle — soreness does not call for hard stretching.
 */
import { DRILL_BY_ID, DRILLS, drillSeconds, type Drill, type Region } from '../data/drills.ts';
import { makeItem, REGION_WORD, type Routine, type RoutineItem } from './warmup.ts';

/** Muscles (catalogue keys) → the regions a stretch for them covers. */
export const MUSCLE_REGIONS: Record<string, readonly Region[]> = {
  chest: ['chest'],
  back: ['lats'],
  shoulders: ['shoulders'],
  traps: ['shoulders'],
  biceps: ['arms'],
  triceps: ['arms'],
  forearms: ['wrists', 'arms'],
  abs: ['lowerBack'],
  obliques: ['lowerBack'],
  lowerBack: ['lowerBack'],
  quads: ['quads', 'hips'],
  hamstrings: ['hamstrings'],
  glutes: ['glutes', 'hips'],
  adductors: ['adductors'],
  calves: ['calves'],
};

export type CooldownLength = 'short' | 'standard';

function usable(available: ReadonlySet<string>) {
  return (d: Drill | undefined): d is Drill => !!d && (d.equipment === 'none' || available.has(d.equipment));
}

function regionDemand(trained: readonly { primary: readonly string[]; sets: number }[]): Map<Region, number> {
  const demand = new Map<Region, number>();
  for (const t of trained) {
    for (const m of t.primary) for (const r of MUSCLE_REGIONS[m] ?? []) demand.set(r, (demand.get(r) ?? 0) + t.sets);
  }
  return demand;
}

/** Greedy: stretches that cover the most-worked regions, each region once. */
function pickStretches(demand: Map<Region, number>, count: number, ok: (d: Drill | undefined) => d is Drill, why: (r: Region) => string): RoutineItem[] {
  const out: RoutineItem[] = [];
  const covered = new Set<Region>();
  const pool = DRILLS.filter((d) => d.kind === 'stretch' && ok(d));
  while (out.length < count) {
    let best: Drill | undefined;
    let bestGain = 0;
    for (const d of pool) {
      if (out.some((o) => o.drill.id === d.id)) continue;
      const gain = d.regions.reduce((g, r) => g + (covered.has(r) ? 0 : (demand.get(r) ?? 0)), 0);
      if (gain > bestGain) {
        best = d;
        bestGain = gain;
      }
    }
    if (!best) break;
    const top = [...best.regions].sort((a, b) => (demand.get(b) ?? 0) - (demand.get(a) ?? 0))[0] ?? 'wholeBody';
    out.push(makeItem(best, 'stretch', why(top)));
    for (const r of best.regions) covered.add(r);
  }
  return out;
}

/** Optional cooldown from what was actually trained today. */
export function cooldown(
  trained: readonly { primary: readonly string[]; sets: number }[],
  length: CooldownLength,
  available: ReadonlySet<string>,
): Routine {
  const ok = usable(available);
  const demand = regionDemand(trained);
  if (demand.size === 0) return { items: [], seconds: 0 };
  const items: RoutineItem[] = [];
  if (length === 'standard') {
    const easy = ['g-walk', 'g-bike', 'g-march'].map((id) => DRILL_BY_ID.get(id)).find(ok);
    if (easy) items.push(makeItem(easy, 'general', 'Brings the heart rate down', { seconds: 120 }));
  }
  items.push(...pickStretches(demand, length === 'short' ? 2 : 4, ok, (r) => `${REGION_WORD[r]} — worked today`));
  const breath = DRILL_BY_ID.get('b-box');
  if (breath) items.push(makeItem(breath, 'breathing', 'Switches off training mode'));
  return { items, seconds: items.reduce((t, i) => t + i.seconds, 0) };
}

/** Gentle rest-day session, nudged toward what was trained in the last couple of days. */
export function recoverySession(recentMuscles: readonly string[], available: ReadonlySet<string>): Routine {
  const ok = usable(available);
  const items: RoutineItem[] = [];
  const add = (id: string, phase: RoutineItem['phase'], why: string) => {
    const d = DRILL_BY_ID.get(id);
    if (ok(d) && !items.some((i) => i.drill.id === id)) items.push(makeItem(d, phase, why));
  };
  add('b-legs-up', 'breathing', 'Settle in');
  add('m-cat-cow', 'mobility', 'Easy spine movement');
  add('m-thoracic-rotation', 'mobility', 'Upper-back rotation');
  add('m-hip-circles', 'mobility', 'Loosens the hips');
  add('m-ankle-rock', 'mobility', 'Ankle range for squats and lunges');
  add('m-arm-circles', 'mobility', 'Shoulder circulation');
  const demand = regionDemand(recentMuscles.map((m) => ({ primary: [m], sets: 1 })));
  if (demand.size === 0) for (const r of ['hips', 'hamstrings', 'chest'] as Region[]) demand.set(r, 1);
  items.push(...pickStretches(demand, 2, ok, (r) => `${REGION_WORD[r]} — trained recently`));
  add('b-box', 'breathing', 'Finish calm');
  return { items, seconds: items.reduce((t, i) => t + i.seconds, 0) };
}

/** Same-kind drills covering overlapping regions — for "replace this one". */
export function alternativesFor(item: RoutineItem, exclude: ReadonlySet<string>, available: ReadonlySet<string>, limit = 4): Drill[] {
  const ok = usable(available);
  return DRILLS.filter((d) => d.kind === item.drill.kind && d.id !== item.drill.id && !exclude.has(d.id) && ok(d))
    .map((d) => ({ d, overlap: d.regions.filter((r) => item.drill.regions.includes(r)).length }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || drillSeconds(a.d) - drillSeconds(b.d))
    .slice(0, limit)
    .map((x) => x.d);
}
