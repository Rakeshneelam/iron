/** The exercise catalogue, plus the bridge from a DB row to the engine's ExerciseConfig. */
import { asc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import * as schema from '@/db/schema';
import { VOLUME_LANDMARKS, type ExerciseConfig, type LoadType } from '@/engine/progression';
import { nowISO } from '@/lib/date';
import { newId } from '@/lib/ids';

import type { RoutineSlot } from './program';
import { countConsecutiveResets } from './stats';

export type Exercise = typeof schema.exercise.$inferSelect;

export const LOAD_TYPES: readonly LoadType[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'];
/** Every muscle the volume landmarks know about — the only valid primary muscles. */
export const MUSCLES: readonly string[] = Object.keys(VOLUME_LANDMARKS);

export function getExercise(id: string): Exercise | undefined {
  return db.select().from(schema.exercise).where(eq(schema.exercise.id, id)).get();
}

export function listExercises(opts: { muscle?: string; includeArchived?: boolean; q?: string } = {}): Exercise[] {
  const rows = db.select().from(schema.exercise).orderBy(asc(schema.exercise.name)).all();
  const q = opts.q?.trim().toLowerCase() ?? '';
  return rows.filter((ex) => {
    if (!opts.includeArchived && ex.archivedAt !== null) return false;
    if (opts.muscle && !ex.primaryMuscles.includes(opts.muscle) && !(ex.secondaryMuscles ?? []).includes(opts.muscle)) return false;
    if (q && !ex.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

export interface NewExerciseInput {
  name: string;
  loadType: LoadType;
  loadStep: number;
  primaryMuscles: string[];
  secondaryMuscles?: string[] | null;
  isUnilateral?: boolean;
}

export function createCustomExercise(input: NewExerciseInput): Exercise {
  const row: Exercise = {
    id: `custom-${newId()}`,
    name: input.name.trim(),
    loadType: input.loadType,
    loadStep: input.loadStep,
    primaryMuscles: input.primaryMuscles,
    secondaryMuscles: input.secondaryMuscles ?? null,
    isUnilateral: input.isUnilateral ? 1 : 0,
    isCustom: 1,
    archivedAt: null,
  };
  db.insert(schema.exercise).values(row).run();
  return row;
}

/** In place, never delete+insert: renaming must never lose history (PRD screen 2). */
export function updateExercise(id: string, patch: Partial<Omit<Exercise, 'id'>>): void {
  db.update(schema.exercise).set(patch).where(eq(schema.exercise.id, id)).run();
}

export function archiveExercise(id: string): void {
  db.update(schema.exercise).set({ archivedAt: nowISO() }).where(eq(schema.exercise.id, id)).run();
}

/**
 * The bridge to the engine. The slot supplies rep range, sets and RIR; without one
 * (an ad-hoc exercise) a conservative hypertrophy default is used.
 */
export function toExerciseConfig(ex: Exercise, slot?: Pick<RoutineSlot, 'repLo' | 'repHi' | 'targetSets' | 'targetRir'> | null): ExerciseConfig {
  const repLo = slot?.repLo ?? 8;
  const repHi = slot?.repHi ?? 12;
  return {
    id: ex.id,
    name: ex.name,
    goal: repHi <= 6 ? 'strength' : repLo >= 15 ? 'endurance' : 'hypertrophy',
    repRange: [repLo, repHi],
    targetSets: slot?.targetSets ?? 3,
    targetRIR: slot?.targetRir ?? 2,
    loadType: ex.loadType,
    loadStep: ex.loadStep,
    primaryMuscles: ex.primaryMuscles,
    consecutiveResets: countConsecutiveResets(ex.id),
  };
}

/** Written on a variation swap so progression carries across instead of resetting. */
export function linkExercises(fromId: string, toId: string, ratio: number): void {
  if (fromId === toId) return;
  db.insert(schema.exerciseLink)
    .values({ id: newId(), fromExerciseId: fromId, toExerciseId: toId, ratio: ratio > 0 ? ratio : 1, createdAt: nowISO() })
    .run();
}

/**
 * Every exercise whose history flows into `exerciseId`, with the cumulative ratio.
 * Transitive (A -> B -> C gives C both), cycle-safe.
 */
export function getLinkedSources(exerciseId: string): { fromExerciseId: string; ratio: number }[] {
  const links = db.select().from(schema.exerciseLink).all();
  const out: { fromExerciseId: string; ratio: number }[] = [];
  const seen = new Set<string>([exerciseId]);
  const queue: { id: string; ratio: number }[] = [{ id: exerciseId, ratio: 1 }];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur) break;
    for (const l of links) {
      if (l.toExerciseId !== cur.id || seen.has(l.fromExerciseId)) continue;
      seen.add(l.fromExerciseId);
      const ratio = cur.ratio * l.ratio;
      out.push({ fromExerciseId: l.fromExerciseId, ratio });
      queue.push({ id: l.fromExerciseId, ratio });
    }
  }
  return out;
}
