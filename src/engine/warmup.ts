/**
 * Session preparation. PURE — plain objects in, plain objects out.
 *
 * One warm-up for the whole workout (not one per lift), built from what is actually
 * on today's list, then warm-up ("ramp-up") sets per lift from its working weight.
 *
 * Evidence behind the shape:
 *  - Dynamic mobility before training; static holds ≥60 s per muscle right before
 *    lifting reduce strength (Behm 2016), so they live in the cooldown instead.
 *  - A specific warm-up — the lift itself at light-to-moderate loads — is what most
 *    reliably helps the working sets; extra heavy warm-up singles add nothing and
 *    cost energy (resistance-training warm-up studies, e.g. Ribeiro 2014; high- vs
 *    low-load warm-up comparisons 2024). So ramps are few, low-rep, and stop well
 *    short of the working weight.
 *  - Time-aware by PRIORITY, not truncation: the quick version keeps the pieces that
 *    matter most (prep for the first big lift, the tightest regions), not the first
 *    three minutes of the long version.
 */
import { DRILL_BY_ID, DRILLS, drillSeconds, type Drill, type Region } from '../data/drills.ts';

export type WarmupMode = 'quick' | 'standard' | 'full';
export type Phase = 'general' | 'mobility' | 'activation' | 'prep' | 'stretch' | 'breathing';

export interface RoutineItem {
  drill: Drill;
  phase: Phase;
  dose: Drill['dose'];
  seconds: number;
  /** Why it is in today's list, in a few words. */
  why: string;
}

export interface Routine {
  items: RoutineItem[];
  seconds: number;
}

/** Budgets aim at roughly 3–5, 5–10 and 10–15 minutes. */
export const WARMUP_BUDGET_S: Record<WarmupMode, number> = { quick: 270, standard: 510, full: 810 };

export interface SessionLift {
  name: string;
  /** Catalogue movement pattern ('squat', 'horizontal_push', …). */
  pattern: string;
  equipment: string;
  compound: boolean;
  primary: readonly string[];
  /** Top of the planned rep range — ≤ 6 marks a heavy lift. */
  repHi: number;
}

export interface PrepContext {
  level: 'beginner' | 'intermediate' | 'advanced';
  /** Drill equipment on hand: 'band', 'cardio_machine', 'pullup_bar' ('none' is implied). */
  available: ReadonlySet<string>;
  avoidImpact?: boolean;
}

type Demand = Partial<Record<Region, number>>;

/** How much each movement pattern asks of each region. */
const PATTERN_REGIONS: Record<string, Demand> = {
  squat: { hips: 3, ankles: 3, quads: 2, adductors: 1, glutes: 1, thoracic: 1 },
  lunge: { hips: 3, ankles: 2, quads: 2, glutes: 1, adductors: 1 },
  hinge: { hamstrings: 3, hips: 2, lowerBack: 1, glutes: 1 },
  hip_extension: { glutes: 2, hips: 2, hamstrings: 1 },
  horizontal_push: { shoulders: 3, chest: 2, thoracic: 1, wrists: 1 },
  vertical_push: { shoulders: 3, thoracic: 2, lats: 1, wrists: 1 },
  horizontal_pull: { shoulders: 2, thoracic: 2, lats: 1 },
  vertical_pull: { shoulders: 2, lats: 2, thoracic: 1 },
  fly: { chest: 1, shoulders: 1 },
  shoulder_isolation: { shoulders: 1 },
  shrug: { shoulders: 0.5 },
  elbow_flexion: { arms: 1, wrists: 0.5 },
  elbow_extension: { arms: 1, wrists: 0.5 },
  wrist: { wrists: 1 },
  knee_extension: { quads: 1 },
  knee_flexion: { hamstrings: 1 },
  hip_abduction: { hips: 1, glutes: 0.5 },
  hip_adduction: { adductors: 1 },
  calf: { ankles: 1, calves: 1 },
  core_flexion: { core: 1 },
  core_stability: { core: 1 },
  carry: { wholeBody: 1 },
  conditioning: { wholeBody: 1 },
};

export const REGION_WORD: Record<Region, string> = {
  hips: 'Hips', ankles: 'Ankles', thoracic: 'Upper back', shoulders: 'Shoulders', hamstrings: 'Hamstrings', quads: 'Quads',
  glutes: 'Glutes', calves: 'Calves', chest: 'Chest', lats: 'Lats', lowerBack: 'Lower back', adductors: 'Inner thighs',
  wrists: 'Wrists', arms: 'Arms', core: 'Core', wholeBody: 'Whole body',
};

const PREP_FOR: Record<string, readonly string[]> = {
  squat: ['p-bw-squat'],
  lunge: ['p-split-squat'],
  hinge: ['p-hip-hinge'],
  hip_extension: ['p-hip-hinge'],
  horizontal_push: ['p-incline-pushup'],
  horizontal_pull: ['p-band-row'],
  vertical_pull: ['a-scap-pull', 'p-band-row'],
};

const LOWER = new Set(['squat', 'lunge', 'hinge', 'hip_extension']);
const PUSH = new Set(['horizontal_push', 'vertical_push']);

const ACTIVATION: { when: (p: ReadonlySet<string>) => boolean; ids: readonly string[]; why: string }[] = [
  { when: (p) => [...p].some((x) => LOWER.has(x)), ids: ['a-glute-bridge', 'a-band-walk'], why: 'Wakes up the glutes before leg work' },
  { when: (p) => [...p].some((x) => PUSH.has(x)), ids: ['a-pull-apart', 'a-scap-pushup'], why: 'Sets the shoulder blades for pressing' },
  { when: (p) => p.has('vertical_push') || p.has('vertical_pull'), ids: ['a-ext-rot'], why: 'Primes the rotator cuff for overhead work' },
];

export function makeItem(drill: Drill, phase: Phase, why: string, dose: Drill['dose'] = drill.dose): RoutineItem {
  return { drill, phase, dose, seconds: drillSeconds(drill, dose), why };
}

export const PHASE_ORDER: Record<Phase, number> = { general: 0, mobility: 1, activation: 2, prep: 3, stretch: 4, breathing: 5 };

function usableIn(ctx: PrepContext) {
  return (d: Drill | undefined): d is Drill =>
    !!d &&
    (d.equipment === 'none' || ctx.available.has(d.equipment)) &&
    !(d.level === 'intermediate' && ctx.level === 'beginner') &&
    !(ctx.avoidImpact && d.id === 'g-jacks');
}

/** One warm-up for the session. Every drill appears at most once. */
export function sessionWarmup(lifts: readonly SessionLift[], mode: WarmupMode, ctx: PrepContext): Routine {
  if (lifts.length === 0) return { items: [], seconds: 0 };
  const usable = usableIn(ctx);

  // Demand per region: compounds and early lifts count most.
  const demand = new Map<Region, number>();
  const firstNeed = new Map<Region, string>();
  lifts.forEach((l, i) => {
    const w = (l.compound ? 3 : 1) / (1 + 0.35 * i);
    for (const [r, v] of Object.entries(PATTERN_REGIONS[l.pattern] ?? {}) as [Region, number][]) {
      demand.set(r, (demand.get(r) ?? 0) + v * w);
      if (v >= 2 && !firstNeed.has(r)) firstNeed.set(r, l.name);
    }
  });
  const patterns = new Set(lifts.map((l) => l.pattern));

  // Movement prep: the first time each loaded compound pattern appears.
  const prep: RoutineItem[] = [];
  const seenPattern = new Set<string>();
  for (const l of lifts) {
    if (!l.compound || seenPattern.has(l.pattern) || l.equipment === 'bodyweight' || l.equipment === 'band') continue;
    seenPattern.add(l.pattern);
    const d = (PREP_FOR[l.pattern] ?? []).map((id) => DRILL_BY_ID.get(id)).find(usable);
    if (d && !prep.some((p) => p.drill.id === d.id)) prep.push(makeItem(d, 'prep', `Rehearses ${l.name} unloaded`));
  }

  // Mobility: greedy cover of the most-demanded regions, dynamic drills only.
  const covered = new Map<Region, number>();
  for (const p of prep) for (const r of p.drill.regions) covered.set(r, Math.max(covered.get(r) ?? 0, 0.4));
  const mobility: RoutineItem[] = [];
  const pool = DRILLS.filter((d) => d.kind === 'mobility' && usable(d));
  const maxMobility = mode === 'quick' ? 2 : mode === 'standard' ? 3 : 5;
  while (mobility.length < maxMobility) {
    let best: Drill | undefined;
    let bestGain = 0;
    for (const d of pool) {
      if (mobility.some((m) => m.drill.id === d.id)) continue;
      const gain = d.regions.reduce((g, r) => g + (demand.get(r) ?? 0) * (1 - (covered.get(r) ?? 0)), 0) / Math.sqrt(drillSeconds(d) / 45);
      if (gain > bestGain) {
        best = d;
        bestGain = gain;
      }
    }
    if (!best || bestGain < 1) break;
    const top = [...best.regions].sort((a, b) => (demand.get(b) ?? 0) - (demand.get(a) ?? 0))[0] ?? 'wholeBody';
    const need = firstNeed.get(top);
    mobility.push(makeItem(best, 'mobility', need ? `${REGION_WORD[top]} for ${need}` : REGION_WORD[top]));
    for (const r of best.regions) covered.set(r, Math.min(1, (covered.get(r) ?? 0) + 0.7));
  }

  const activation: RoutineItem[] = [];
  for (const a of ACTIVATION) {
    if (!a.when(patterns)) continue;
    const d = a.ids.map((id) => DRILL_BY_ID.get(id)).find(usable);
    if (d && !activation.some((x) => x.drill.id === d.id)) activation.push(makeItem(d, 'activation', a.why));
  }

  const lowerDay = [...patterns].some((p) => LOWER.has(p));
  const generalIds = [...(lowerDay ? ['g-bike', 'g-walk', 'g-rower'] : ['g-rower', 'g-bike', 'g-walk']), 'g-march', 'g-jacks'];
  const generalDrill = generalIds.map((id) => DRILL_BY_ID.get(id)).find(usable);
  const general =
    mode !== 'quick' && generalDrill ? makeItem(generalDrill, 'general', 'Raises body temperature', { seconds: mode === 'full' ? 300 : 180 }) : undefined;

  // Priority order — this, not the display order, decides what survives a short budget.
  const byPriority = [
    prep[0], mobility[0], mobility[1], general, activation[0], prep[1], mobility[2], activation[1], mobility[3], prep[2], mobility[4], activation[2], prep[3],
  ].filter((x): x is RoutineItem => x !== undefined);

  const budget = WARMUP_BUDGET_S[mode];
  const chosen: RoutineItem[] = [];
  let total = 0;
  for (const it of byPriority) {
    if (chosen.length === 0 || total + it.seconds <= budget) {
      chosen.push(it);
      total += it.seconds;
    } else if (it.phase === 'general' && budget - total >= 70) {
      const shortened = makeItem(it.drill, 'general', it.why, { seconds: budget - total - 10 });
      chosen.push(shortened);
      total += shortened.seconds;
    }
  }
  chosen.sort((a, b) => PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase]);
  return { items: chosen, seconds: total };
}

/* ============================= warm-up sets ============================== */

/** What earlier lifts in the session already warmed up. */
export type Warmed = 'none' | 'muscle' | 'pattern';

export function warmedStates(lifts: readonly Pick<SessionLift, 'pattern' | 'compound' | 'primary'>[]): Warmed[] {
  return lifts.map((l, i) => {
    const before = lifts.slice(0, i);
    if (before.some((b) => b.compound && b.pattern === l.pattern)) return 'pattern';
    if (before.some((b) => b.primary.some((m) => l.primary.includes(m)))) return 'muscle';
    return 'none';
  });
}

export interface RampInput {
  workKg: number;
  equipment: string;
  loadStep: number;
  /** Empty-bar weight for barbell lifts (default 20). */
  barKg?: number;
  repHi: number;
  compound: boolean;
  warmed: Warmed;
  /** False when the user skipped the session warm-up — the first big lift gets one extra light set. */
  generalDone: boolean;
}

export interface RampSet {
  kg: number;
  reps: number;
  /** Rounded percentage of the working weight. */
  pct: number;
}

/**
 * Warm-up sets for one lift. Few, low-rep, never at or above the working weight,
 * and fewer when the pattern or muscle is already warm from an earlier lift.
 */
export function rampSets(i: RampInput): RampSet[] {
  if (!(i.workKg > 0) || i.equipment === 'bodyweight' || i.equipment === 'band') return [];
  const step = i.loadStep > 0 ? i.loadStep : 2.5;
  const bar = i.equipment === 'barbell' ? (i.barKg ?? 20) : 0;
  const heavy = i.repHi <= 6;

  let steps: [number, number][];
  if (!i.compound) {
    if (i.warmed !== 'none') return [];
    steps = [[0.5, 10]];
  } else if (i.warmed === 'pattern') {
    steps = heavy ? [[0.6, 4], [0.8, 2]] : [[0.6, 5]];
  } else {
    steps = heavy ? [[0.4, 8], [0.6, 5], [0.75, 3], [0.875, 1]] : [[0.5, 8], [0.7, 5], [0.85, 2]];
    if (i.warmed === 'muscle') steps = steps.slice(1);
    if (!heavy && i.workKg < 60) steps = steps.filter(([p]) => p < 0.8);
    if (!i.generalDone) steps = [[0.3, 10], ...steps];
  }

  const out: RampSet[] = [];
  if (bar > 0 && i.compound && i.warmed !== 'pattern' && i.workKg >= bar * 2) {
    out.push({ kg: bar, reps: 10, pct: Math.round((bar / i.workKg) * 100) });
  }
  for (const [pct, reps] of steps) {
    const kg = Math.max(bar, Math.round((i.workKg * pct) / step) * step);
    const prev = out[out.length - 1];
    if (kg <= 0 || kg <= (prev?.kg ?? 0) || kg > i.workKg - step / 2) continue;
    out.push({ kg, reps, pct: Math.round((kg / i.workKg) * 100) });
  }

  // Light working weights don't need a ladder.
  const cap = i.workKg < 30 ? 1 : i.workKg < 50 ? 2 : 5;
  if (out.length <= cap) return out;
  if (cap === 1) {
    const mid = [...out].sort((a, b) => Math.abs(a.pct - 55) - Math.abs(b.pct - 55))[0];
    return mid ? [mid] : [];
  }
  const first = out[0];
  const last = out[out.length - 1];
  return first && last ? [first, last] : out.slice(0, cap);
}
