/**
 * progression-engine.ts
 * ---------------------------------------------------------------------------
 * Pure, dependency-free progressive-overload engine.
 * No I/O, no dates library, no React. Feed it rows from SQLite, get back a
 * prescription for the next session. Everything here is unit-testable.
 *
 * Model: RIR-based double progression (reps first, then load) with
 * e1RM trend tracking, stall handling, and a plan-level deload trigger.
 * ---------------------------------------------------------------------------
 */

/* ============================== Types ==================================== */

export type LoadType = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'band' | 'smith';
export type Goal = 'strength' | 'hypertrophy' | 'endurance';

export interface SetLog {
  weight: number;          // kg on the bar / per dumbbell (be consistent, see loadType)
  reps: number;
  rir: number;             // reps in reserve. 0 = failure. Log honestly or this whole thing lies to you.
  isWarmup?: boolean;
  painFlag?: boolean;      // joint pain / form breakdown on this set
}

export interface SessionLog {
  sessionId: string;
  date: string;            // ISO yyyy-mm-dd
  exerciseId: string;
  sets: SetLog[];
}

export interface ExerciseConfig {
  id: string;
  name: string;
  goal: Goal;
  repRange: [number, number];   // e.g. [6,10] hypertrophy, [3,5] strength
  targetSets: number;
  targetRIR: number;            // 1-2 hypertrophy, 2-3 strength, 0-1 last set only
  loadType: LoadType;
  loadStep: number;             // smallest jump YOUR gym can actually make (kg)
  primaryMuscles: string[];
  maxSets?: number;             // ceiling before we stop adding volume (default targetSets + 2)
  consecutiveResets?: number;   // persisted; 2+ means the exercise itself is the problem
}

export interface Readiness {
  sleepHours?: number;          // 0-12
  soreness?: number;            // 1 = fresh ... 5 = wrecked
  stress?: number;              // 1 = calm ... 5 = fried
  bodyweightDeltaPct?: number;  // today vs 7-day trend, e.g. -1.8
}

export type Verdict =
  | 'CALIBRATE'   // no history — establish a starting load
  | 'ADD_LOAD'    // top of rep range cleared at target effort
  | 'ADD_REPS'    // same load, chase one more rep
  | 'ADD_SET'     // stalled but volume is below MAV — buy progress with a set
  | 'HOLD'        // repeat exactly; consolidate
  | 'BACKOFF'     // load is too heavy right now
  | 'RESET'       // -10%, rebuild through the range
  | 'SWAP'        // exercise has stopped responding twice; change the variation
  | 'DELOAD';     // plan-level, injected by shouldDeload()

export interface Prescription {
  exerciseId: string;
  verdict: Verdict;
  sets: number;
  weight: number;                // kg, already rounded to a loadable value
  repTarget: [number, number];
  targetRIR: number;
  warmups: { weight: number; reps: number }[];
  confidence: number;            // 0..1 — how much history backs this call
  reason: string;                // one line, shown under the input in the UI
}

/* ============================ Small helpers ============================== */

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Round to something you can actually load. Never suggest 23.75 kg. */
export function roundToStep(kg: number, step: number): number {
  if (step <= 0) return Math.round(kg * 10) / 10;
  return Math.round(kg / step) * step;
}

/**
 * Estimated 1RM, RIR-adjusted. Blends Epley (kind at high reps) and
 * Brzycki (kind at low reps); the average is more stable than either.
 * Effective reps are clamped at 15 — past that the estimate is fiction.
 */
export function e1RM(weight: number, reps: number, rir = 0): number {
  const eff = clamp(reps + rir, 1, 15);
  const epley = weight * (1 + eff / 30);
  const brzycki = (weight * 36) / (37 - eff);
  return (epley + brzycki) / 2;
}

/** How much to trust a set as a strength signal. High-rep sets are noisy. */
export function setConfidence(s: SetLog): number {
  const eff = s.reps + s.rir;
  if (eff <= 8) return 1;
  if (eff <= 12) return 0.8;
  return 0.5;
}

export const working = (sets: SetLog[]) => sets.filter((s) => !s.isWarmup);

export function bestE1RM(sets: SetLog[]): number {
  const w = working(sets);
  if (!w.length) return 0;
  return Math.max(...w.map((s) => e1RM(s.weight, s.reps, s.rir)));
}

export function tonnage(sets: SetLog[]): number {
  return working(sets).reduce((t, s) => t + s.weight * s.reps, 0);
}

/** Least-squares slope over an ordered series. Positive = improving. */
export function slope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, i) => {
    num += (i - mx) * (y - my);
    den += (i - mx) ** 2;
  });
  return den === 0 ? 0 : num / den;
}

/**
 * Readiness only ever scales load DOWN. It is an insurance policy, not a
 * licence to add weight because you slept well — that decision belongs to
 * the progression rules, which are based on what you actually lifted.
 */
export function readinessModifier(r?: Readiness): number {
  if (!r) return 1;
  let score = 0;
  if (r.sleepHours != null) score += r.sleepHours >= 7 ? 1 : r.sleepHours >= 6 ? 0 : -1;
  if (r.soreness != null) score += r.soreness <= 2 ? 1 : r.soreness === 3 ? 0 : -1;
  if (r.stress != null) score += r.stress <= 2 ? 1 : r.stress === 3 ? 0 : -1;
  if (r.bodyweightDeltaPct != null && r.bodyweightDeltaPct < -1.5) score -= 1;

  if (score >= 2) return 1.0;
  if (score >= 0) return 0.98;
  if (score >= -2) return 0.95;
  return 0.9;
}

/** Ramp to the working weight. Compounds get more steps than isolation. */
export function buildWarmups(
  workWeight: number,
  cfg: ExerciseConfig
): { weight: number; reps: number }[] {
  if (cfg.loadType === 'bodyweight' || cfg.loadType === 'band' || workWeight <= 20) return [];
  const heavy = cfg.primaryMuscles.length > 1 || cfg.loadType === 'barbell';
  const ramp: [number, number][] = heavy
    ? [[0.4, 8], [0.6, 5], [0.8, 3], [0.9, 1]]
    : [[0.5, 8], [0.75, 4]];
  return ramp.map(([pct, reps]) => ({
    weight: roundToStep(workWeight * pct, cfg.loadStep),
    reps,
  }));
}

/* ========================= The progression call =========================== */

/**
 * @param history newest-first list of past sessions for THIS exercise only.
 * @param weeklySetsForMuscle hard sets this muscle already gets per week.
 * @param mav maximum adaptive volume for that muscle (see volume-landmarks).
 */
export function prescribe(
  cfg: ExerciseConfig,
  history: SessionLog[],
  readiness?: Readiness,
  weeklySetsForMuscle = 0,
  mav = 20
): Prescription {
  const [lo, hi] = cfg.repRange;
  const mod = readinessModifier(readiness);
  const maxSets = cfg.maxSets ?? cfg.targetSets + 2;

  const base = {
    exerciseId: cfg.id,
    sets: cfg.targetSets,
    repTarget: cfg.repRange,
    targetRIR: cfg.targetRIR,
  };

  /* --- 0. No history: calibrate ---------------------------------------- */
  const last = history[0];
  const lastWork = last ? working(last.sets) : [];
  if (!last || lastWork.length === 0) {
    return {
      ...base,
      verdict: 'CALIBRATE',
      weight: 0,
      warmups: [],
      confidence: 0,
      reason: `First time logging ${cfg.name}. Pick a weight you could do for ${hi + 3} reps, stop at ${hi}, and log your RIR honestly.`,
    };
  }

  /* --- 1. Read the last session ----------------------------------------- */
  const topWeight = Math.max(...lastWork.map((s) => s.weight));
  const topSets = lastWork.filter((s) => s.weight >= topWeight - 1e-6);
  const minReps = Math.min(...topSets.map((s) => s.reps));
  const minRIR = Math.min(...topSets.map((s) => s.rir));
  const hadPain = lastWork.some((s) => s.painFlag);

  const e1rmSeries = history.slice(0, 5).map((h) => bestE1RM(h.sets)).reverse();
  const trend = slope(e1rmSeries);
  const stalled = e1rmSeries.length >= 3 && trend <= 0;

  const confidence = clamp(
    (Math.min(history.length, 5) / 5) *
      (topSets.reduce((a, s) => a + setConfidence(s), 0) / topSets.length),
    0.1,
    1
  );

  const done = (verdict: Verdict, weight: number, reason: string, sets = cfg.targetSets, repTarget = cfg.repRange): Prescription => {
    // A bad-readiness day shaves load, but on a lift that is still progressing
    // it must never drop you more than one equipment step below last session.
    const softFloor = ['ADD_LOAD', 'ADD_REPS', 'HOLD', 'ADD_SET'].includes(verdict)
      ? topWeight - cfg.loadStep
      : 0;
    const w = roundToStep(Math.max(weight, softFloor, cfg.loadStep), cfg.loadStep);
    return { ...base, verdict, sets, repTarget, weight: w, warmups: buildWarmups(w, cfg), confidence, reason };
  };

  /* --- 2. Pain always wins --------------------------------------------- */
  if (hadPain) {
    return done('BACKOFF', topWeight * 0.85 * mod,
      `You flagged pain last session. Dropping 15% — if it still hurts, swap the movement, don't push through it.`);
  }

  /* --- 3. Load was too heavy -------------------------------------------- */
  if (minReps < lo) {
    const gap = lo - minReps;
    if (gap >= 2) {
      return done('BACKOFF', topWeight * 0.95 * mod,
        `Last time you fell to ${minReps} reps, below your ${lo}-rep floor. Back down 5% and rebuild.`);
    }
    return done('HOLD', topWeight * mod,
      `You were one rep short of the range. Same weight — get all sets to ${lo} before adding anything.`);
  }

  /* --- 4. Top of range cleared ------------------------------------------ */
  if (minReps >= hi) {
    if (minRIR >= cfg.targetRIR) {
      // 2.5% for heavy lifts, one equipment step for light ones — whichever is bigger.
      const inc = Math.max(cfg.loadStep, roundToStep(topWeight * 0.025, cfg.loadStep));
      return done('ADD_LOAD', (topWeight + inc) * mod,
        `All sets hit ${hi}+ reps at RIR ${minRIR}. Up ${inc} kg — expect reps to drop back toward ${lo}.`);
    }
    return done('HOLD', topWeight * mod,
      `You hit ${hi} reps but at RIR ${minRIR}, harder than the ${cfg.targetRIR} you were aiming for. Repeat it once cleaner, then add load.`);
  }

  /* --- 5. Mid-range: stalled or still climbing -------------------------- */
  if (stalled) {
    if (cfg.targetSets < maxSets && weeklySetsForMuscle < mav) {
      return done('ADD_SET', topWeight * mod,
        `e1RM flat for ${e1rmSeries.length} sessions. Same weight, one more set — buying progress with volume before cutting load.`,
        cfg.targetSets + 1);
    }
    if ((cfg.consecutiveResets ?? 0) >= 2) {
      return done('SWAP', topWeight * 0.9 * mod,
        `Two resets and still flat. This variation has stopped paying. Swap to another ${cfg.primaryMuscles[0]} movement and carry the load estimate over.`);
    }
    return done('RESET', topWeight * 0.9 * mod,
      `Stalled at ${topWeight} kg with volume already high. Drop 10% and run the range back up — you'll pass the old number in 3-4 sessions.`);
  }

  /* --- 6. Normal case: chase one more rep ------------------------------- */
  const nextRep = Math.min(minReps + 1, hi);
  return done('ADD_REPS', topWeight * mod,
    `Same ${topWeight} kg. Target ${nextRep} reps on every set — load only moves once all sets reach ${hi}.`,
    cfg.targetSets, [nextRep, hi]);
}

/* ======================= Plan-level fatigue / deload ====================== */

export interface DeloadInput {
  /** e1RM trend per tracked exercise over its last 3+ sessions */
  exerciseTrends: number[];
  /** daily total tonnage, oldest → newest, at least 28 entries ideally */
  dailyTonnage: number[];
  /** average RIR reported across working sets in the last 7 days */
  avgRIR7d: number;
  /** average readiness score-ish inputs over last 7 days */
  poorReadinessDays: number;
  /** weeks since last deload */
  weeksSinceDeload: number;
}

/** Acute:chronic workload ratio. >1.5 means you ramped faster than you adapted. */
export function acwr(dailyTonnage: number[]): number {
  if (dailyTonnage.length < 14) return 1;
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
  const acute = avg(dailyTonnage.slice(-7));
  const chronic = avg(dailyTonnage.slice(-28));
  return chronic === 0 ? 1 : acute / chronic;
}

export function shouldDeload(input: DeloadInput): { deload: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const flat = input.exerciseTrends.filter((t) => t <= 0).length;

  if (input.exerciseTrends.length && flat / input.exerciseTrends.length >= 0.5)
    reasons.push(`${flat} of ${input.exerciseTrends.length} lifts have gone flat or backwards`);
  if (acwr(input.dailyTonnage) > 1.5)
    reasons.push('weekly volume has spiked well above your 4-week baseline');
  if (input.avgRIR7d < 1)
    reasons.push('almost every set last week was taken to failure');
  if (input.poorReadinessDays >= 4)
    reasons.push('4+ low-readiness days this week');
  if (input.weeksSinceDeload >= 8)
    reasons.push('8 weeks of accumulated training without a break');

  return { deload: reasons.length >= 2, reasons };
}

/** What a deload week actually looks like. */
export function deloadPrescription(p: Prescription): Prescription {
  return {
    ...p,
    verdict: 'DELOAD',
    sets: Math.max(2, Math.round(p.sets * 0.5)),
    weight: roundToStep(p.weight * 0.9, 1),
    targetRIR: p.targetRIR + 2,
    reason: 'Deload week: half the sets, 10% lighter, stop well short of failure. You will come back stronger, not weaker.',
  };
}

/* ========================= Volume landmarks ============================== */

/** Weekly hard-set landmarks (Israetel-style). Tune to your own response. */
export const VOLUME_LANDMARKS: Record<string, { mev: number; mav: number; mrv: number }> = {
  chest: { mev: 8, mav: 16, mrv: 22 },
  back: { mev: 10, mav: 20, mrv: 25 },
  quads: { mev: 8, mav: 16, mrv: 20 },
  hamstrings: { mev: 6, mav: 14, mrv: 18 },
  glutes: { mev: 4, mav: 12, mrv: 16 },
  shoulders: { mev: 8, mav: 18, mrv: 24 },
  biceps: { mev: 6, mav: 16, mrv: 22 },
  triceps: { mev: 6, mav: 14, mrv: 20 },
  traps: { mev: 4, mav: 12, mrv: 18 },
  calves: { mev: 6, mav: 14, mrv: 20 },
  abs: { mev: 4, mav: 12, mrv: 18 },
};

export function volumeStatus(muscle: string, weeklySets: number): 'under' | 'optimal' | 'high' | 'over' {
  const l = VOLUME_LANDMARKS[muscle];
  if (!l) return 'optimal';
  if (weeklySets < l.mev) return 'under';
  if (weeklySets <= l.mav) return 'optimal';
  if (weeklySets <= l.mrv) return 'high';
  return 'over';
}
