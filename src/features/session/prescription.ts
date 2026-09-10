/**
 * Adapter between the screens and prescribe(). It does not change a rule: it feeds
 * the engine real history and config, then snaps loads to the real equipment.
 */
import { listWeighIns } from '@/db/repositories/body';
import { listEquipment } from '@/db/repositories/equipment';
import { toExerciseConfig, type Exercise } from '@/db/repositories/exercises';
import { getActiveRoutine, plannedWeeklySets, type RoutineSlot } from '@/db/repositories/program';
import { getExerciseHistory, type Session } from '@/db/repositories/sessions';
import { weightTrend } from '@/engine/metabolic';
import { getSettings } from '@/db/repositories/settings';
import {
  buildWarmups,
  deloadPrescription,
  prescribe,
  VOLUME_LANDMARKS,
  working,
  type Prescription,
  type Readiness,
} from '@/engine/progression';
import { daysBetweenISO, todayISO } from '@/lib/date';
import { nearestLoadable, type EquipmentRow } from '@/lib/plates';

export interface Suggestion extends Prescription {
  /** Heaviest working weight last session, or null with no history. */
  lastTopWeight: number | null;
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

export function suggestFor(
  exercise: Exercise,
  slot: RoutineSlot | null,
  readiness: Readiness | undefined,
  ctx: SuggestionContext,
): Suggestion {
  const cfg = toExerciseConfig(exercise, slot);
  const history = getExerciseHistory(exercise.id);
  const muscle = exercise.primaryMuscles[0] ?? '';
  const mav = VOLUME_LANDMARKS[muscle]?.mav ?? 20;
  const p = prescribe(cfg, history, readiness, ctx.weekly[muscle] ?? 0, mav);

  const last = history[0];
  const lastWork = last ? working(last.sets) : [];
  const lastTopWeight = lastWork.length ? Math.max(...lastWork.map((s) => s.weight)) : null;

  if (p.verdict === 'CALIBRATE') return { ...p, lastTopWeight };

  const snap = (kg: number) => nearestLoadable(kg, exercise.loadType, ctx.equipment, exercise.loadStep);
  let weight = snap(p.weight);
  // prescribe() floors every load at one loadStep. For an unweighted bodyweight lift
  // that would quietly strap 2.5 kg on every session; stay unweighted until the rep
  // range is actually cleared (ADD_LOAD).
  if (exercise.loadType === 'bodyweight' && lastTopWeight === 0 && p.verdict !== 'ADD_LOAD') weight = 0;
  const warmups = weight === p.weight ? p.warmups : buildWarmups(weight, cfg).map((w) => ({ ...w, weight: snap(w.weight) }));
  if (!deloadActive()) return { ...p, weight, warmups, lastTopWeight };

  // He accepted a deload proposal in Review: the engine's own deload shape, for 7 days.
  const d = deloadPrescription({ ...p, weight });
  const dw = snap(d.weight);
  return { ...d, weight: dw, warmups: buildWarmups(dw, cfg).map((w) => ({ ...w, weight: snap(w.weight) })), lastTopWeight };
}

/** True for the 7 days after he accepts a deload in Review. Never set automatically. */
export function deloadActive(): boolean {
  const since = getSettings().lastDeloadDate;
  return since !== null && daysBetweenISO(since, todayISO()) < 7;
}

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
