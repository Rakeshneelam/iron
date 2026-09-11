/**
 * Adapter between the screens and the engine. It does not change a rule: it feeds
 * prescribe() real history and config, snaps loads to the real equipment, then
 * applies the real-life adjustments (time off, timed sets, bands) and builds
 * warm-up sets from the working weight.
 */
import type { PillTone } from '@/components/Pill';
import { CATALOG_BY_ID, type Pattern } from '@/data/catalog';
import { listWeighIns } from '@/db/repositories/body';
import { listEquipment } from '@/db/repositories/equipment';
import { toExerciseConfig, type Exercise } from '@/db/repositories/exercises';
import { getActiveRoutine, plannedWeeklySets, type Targets } from '@/db/repositories/program';
import { getExerciseHistory, type Session } from '@/db/repositories/sessions';
import { getSettings } from '@/db/repositories/settings';
import { adaptForBand, adaptForTime, adjustForGap, type Adjusted } from '@/engine/adjust';
import { weightTrend } from '@/engine/metabolic';
import { deloadPrescription, prescribe, VOLUME_LANDMARKS, working, type Prescription, type Readiness } from '@/engine/progression';
import { rampSets, warmedStates, type RampSet, type SessionLift } from '@/engine/warmup';
import { daysBetweenISO, todayISO } from '@/lib/date';
import { nearestLoadable, type EquipmentRow } from '@/lib/plates';

export interface Suggestion extends Adjusted {
  /** Heaviest working weight last session, or null with no history. */
  lastTopWeight: number | null;
  /** Days since this exercise was last trained, or null. */
  daysSinceLast: number | null;
  measure: 'reps' | 'time';
}

export interface SuggestionContext {
  equipment: EquipmentRow[];
  /** Planned weekly hard sets per muscle — what prescribe() compares against MAV. */
  weekly: Record<string, number>;
}

export function suggestionContext(): SuggestionContext {
  const routine = getActiveRoutine();
  return { equipment: listEquipment(), weekly: routine ? plannedWeeklySets(routine.id) : {} };
}

/** Readiness inputs from the session row; bodyweight compared against the 7-day-ish trend. */
export function readinessFrom(session: Session | undefined | null): Readiness | undefined {
  if (!session) return undefined;
  const r: Readiness = {};
  if (session.sleepHours !== null) r.sleepHours = session.sleepHours;
  if (session.soreness !== null) r.soreness = session.soreness;
  if (session.stress !== null) r.stress = session.stress;
  if (session.bodyweightKg !== null) {
    const trend = weightTrend(listWeighIns(30).filter((w) => w.date < session.date));
    const last = trend[trend.length - 1];
    if (last && last.trend > 0) r.bodyweightDeltaPct = ((session.bodyweightKg - last.trend) / last.trend) * 100;
  }
  return Object.keys(r).length ? r : undefined;
}

export function suggestFor(exercise: Exercise, slot: Targets | null, readiness: Readiness | undefined, ctx: SuggestionContext): Suggestion {
  const cfg = toExerciseConfig(exercise, slot);
  const history = getExerciseHistory(exercise.id);
  const muscle = exercise.primaryMuscles[0] ?? '';
  const mav = VOLUME_LANDMARKS[muscle]?.mav ?? 20;
  const p = prescribe(cfg, history, readiness, ctx.weekly[muscle] ?? 0, mav);

  const last = history[0];
  const lastWork = last ? working(last.sets) : [];
  const lastTopWeight = lastWork.length ? Math.max(...lastWork.map((s) => s.weight)) : null;
  const daysSinceLast = last ? daysBetweenISO(last.date, todayISO()) : null;
  const entry = CATALOG_BY_ID.get(exercise.id);
  const measure = entry?.measure ?? 'reps';
  const extra = { lastTopWeight, daysSinceLast, measure };
  if (p.verdict === 'CALIBRATE') return { ...p, ...extra };

  const snap = (kg: number) => nearestLoadable(kg, exercise.loadType, ctx.equipment, exercise.loadStep);
  let out: Adjusted = { ...p, weight: snap(p.weight) };
  // prescribe() floors every load at one loadStep. An unweighted bodyweight or band
  // lift stays unweighted until the rep range is actually cleared.
  if ((exercise.loadType === 'bodyweight' || exercise.loadType === 'band') && lastTopWeight === 0 && p.verdict !== 'ADD_LOAD') out = { ...out, weight: 0 };
  if (deloadActive()) {
    // A deload proposal accepted in Progress: the engine's own deload shape, for 7 days.
    const d = deloadPrescription(out);
    out = { ...d, weight: snap(d.weight) };
  }
  const gap = adjustForGap(out, daysSinceLast, lastTopWeight, exercise.loadStep);
  if (gap !== out) out = { ...gap, weight: snap(gap.weight) };
  if (measure === 'time') {
    const harder = entry?.harder?.[0];
    out = adaptForTime(out, lastTopWeight, harder ? CATALOG_BY_ID.get(harder)?.name : undefined);
  } else if (exercise.loadType === 'band') {
    out = adaptForBand(out, lastTopWeight);
  }
  return { ...out, ...extra };
}

/** True for the 7 days after a deload is accepted. Never set automatically. */
export function deloadActive(): boolean {
  const since = getSettings().lastDeloadDate;
  return since !== null && daysBetweenISO(since, todayISO()) < 7;
}

/* ============================ warm-up sets =============================== */

/** Custom exercises have no catalogue entry — infer a pattern from the main muscle. */
const PATTERN_FROM_MUSCLE: Record<string, Pattern> = {
  chest: 'horizontal_push', back: 'horizontal_pull', shoulders: 'vertical_push', quads: 'squat', hamstrings: 'hinge', glutes: 'hip_extension',
  biceps: 'elbow_flexion', triceps: 'elbow_extension', calves: 'calf', abs: 'core_flexion', obliques: 'core_stability', traps: 'shrug',
  forearms: 'wrist', lowerBack: 'hip_extension', adductors: 'hip_adduction',
};

export function liftOf(e: Exercise, slot: Pick<Targets, 'repHi'> | null): SessionLift {
  const c = CATALOG_BY_ID.get(e.id);
  return {
    name: e.name,
    pattern: c?.pattern ?? PATTERN_FROM_MUSCLE[e.primaryMuscles[0] ?? ''] ?? 'core_stability',
    equipment: e.loadType,
    compound: c?.compound ?? e.primaryMuscles.length > 1,
    primary: e.primaryMuscles,
    repHi: slot?.repHi ?? 12,
  };
}

/** Warm-up sets for lift `index` of a session, aware of what came before it. */
export function rampFor(lifts: readonly SessionLift[], index: number, workKg: number, loadStep: number, generalDone: boolean): RampSet[] {
  const lift = lifts[index];
  if (!lift) return [];
  return rampSets({
    workKg,
    equipment: lift.equipment,
    loadStep,
    repHi: lift.repHi,
    compound: lift.compound,
    warmed: warmedStates(lifts)[index] ?? 'none',
    generalDone,
  });
}

/* ================================ labels ================================= */

/** Colour by meaning: going up is positive, easing off is a warning, first time is neutral. */
export const VERDICT_TONE: Record<Prescription['verdict'], PillTone> = {
  CALIBRATE: 'accent',
  ADD_LOAD: 'positive',
  ADD_REPS: 'positive',
  ADD_SET: 'positive',
  HOLD: 'muted',
  BACKOFF: 'warning',
  RESET: 'warning',
  SWAP: 'warning',
  DELOAD: 'muted',
};

export const VERDICT_LABEL: Record<Prescription['verdict'], string> = {
  CALIBRATE: 'First time',
  ADD_LOAD: 'Add load',
  ADD_REPS: 'Add a rep',
  ADD_SET: 'Add a set',
  HOLD: 'Hold',
  BACKOFF: 'Back off',
  RESET: 'Reset',
  SWAP: 'Consider a swap',
  DELOAD: 'Deload',
};

/** Label for a suggestion, including the real-life adjustments. */
export function verdictLabel(s: Pick<Suggestion, 'verdict' | 'adjustment'>): string {
  if (s.adjustment === 'return') return 'Ease back in';
  if (s.adjustment === 'hold-gap') return 'Repeat first';
  return VERDICT_LABEL[s.verdict];
}

/** "60 × 8", "45 s", "12 min" — a logged or target set in its own unit. */
export function fmtSet(measure: 'reps' | 'time', weight: number, reps: number, loadType?: string): string {
  if (measure === 'time') {
    const t = reps >= 180 ? `${Math.round(reps / 60)} min` : `${reps} s`;
    return weight > 0 ? `${weight}×${t}` : t;
  }
  if (loadType === 'band') return weight > 0 ? `L${weight}×${reps}` : `${reps} reps`;
  if (loadType === 'bodyweight' && weight === 0) return `${reps} reps`;
  return `${weight}×${reps}`;
}
