/** The program: routine -> day -> ordered slots. Exactly one routine is active. */
import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import * as schema from '@/db/schema';
import { nowISO } from '@/lib/date';
import { newId } from '@/lib/ids';

import { getExercise, linkExercises, type Exercise } from './exercises';

export type Routine = typeof schema.routine.$inferSelect;
export type RoutineDay = typeof schema.routineDay.$inferSelect;
export type RoutineSlot = typeof schema.routineSlot.$inferSelect;
export type SlotWithExercise = RoutineSlot & { exercise: Exercise };

export function getActiveRoutine(): Routine | undefined {
  return db.select().from(schema.routine).where(eq(schema.routine.active, 1)).limit(1).get();
}

export function getRoutine(id: string): Routine | undefined {
  return db.select().from(schema.routine).where(eq(schema.routine.id, id)).get();
}

export function listRoutines(): Routine[] {
  return db.select().from(schema.routine).orderBy(asc(schema.routine.createdAt)).all();
}

export function setActiveRoutine(id: string): void {
  db.transaction((tx) => {
    tx.update(schema.routine).set({ active: 0 }).run();
    tx.update(schema.routine).set({ active: 1 }).where(eq(schema.routine.id, id)).run();
  });
}

export function renameRoutine(id: string, name: string): void {
  db.update(schema.routine).set({ name }).where(eq(schema.routine.id, id)).run();
}

export function getDays(routineId: string): RoutineDay[] {
  return db.select().from(schema.routineDay).where(eq(schema.routineDay.routineId, routineId)).orderBy(asc(schema.routineDay.dayIndex)).all();
}

export function getDay(dayId: string): RoutineDay | undefined {
  return db.select().from(schema.routineDay).where(eq(schema.routineDay.id, dayId)).get();
}

export function getSlots(routineDayId: string): SlotWithExercise[] {
  return db
    .select({ slot: schema.routineSlot, exercise: schema.exercise })
    .from(schema.routineSlot)
    .innerJoin(schema.exercise, eq(schema.routineSlot.exerciseId, schema.exercise.id))
    .where(eq(schema.routineSlot.routineDayId, routineDayId))
    .orderBy(asc(schema.routineSlot.position))
    .all()
    .map((r) => ({ ...r.slot, exercise: r.exercise }));
}

export function getSlot(slotId: string): RoutineSlot | undefined {
  return db.select().from(schema.routineSlot).where(eq(schema.routineSlot.id, slotId)).get();
}

/**
 * Cycle position, NOT the calendar: the day after the last completed session's.
 * A missed Tuesday leaves him on the same day — it never skips him forward.
 */
export function resolveNextDay(routineId: string): RoutineDay | undefined {
  const days = getDays(routineId);
  if (days.length === 0) return undefined;
  const last = db
    .select({ dayId: schema.session.routineDayId })
    .from(schema.session)
    .innerJoin(schema.routineDay, eq(schema.session.routineDayId, schema.routineDay.id))
    .where(and(eq(schema.routineDay.routineId, routineId), isNotNull(schema.session.endedAt)))
    .orderBy(desc(schema.session.startedAt))
    .limit(1)
    .get();
  if (!last?.dayId) return days[0];
  const idx = days.findIndex((d) => d.id === last.dayId);
  return days[(idx + 1) % days.length] ?? days[0];
}

export function createRoutine(name: string, daysPerWeek: number): Routine {
  const row: Routine = { id: newId(), name: name.trim() || 'New routine', daysPerWeek, active: 0, createdAt: nowISO() };
  db.insert(schema.routine).values(row).run();
  return row;
}

export function deleteRoutine(id: string): void {
  db.transaction((tx) => {
    const dayIds = tx.select({ id: schema.routineDay.id }).from(schema.routineDay).where(eq(schema.routineDay.routineId, id)).all();
    // Sessions keep their data; they just stop pointing at a day that no longer exists.
    for (const d of dayIds) tx.update(schema.session).set({ routineDayId: null }).where(eq(schema.session.routineDayId, d.id)).run();
    tx.delete(schema.routine).where(eq(schema.routine.id, id)).run();
  });
}

export function addDay(routineId: string, label: string): RoutineDay {
  const max = db
    .select({ n: sql<number>`coalesce(max(${schema.routineDay.dayIndex}), -1)` })
    .from(schema.routineDay)
    .where(eq(schema.routineDay.routineId, routineId))
    .get();
  const row: RoutineDay = { id: newId(), routineId, dayIndex: Number(max?.n ?? -1) + 1, label: label.trim() || 'New day' };
  db.transaction((tx) => {
    tx.insert(schema.routineDay).values(row).run();
    tx.update(schema.routine).set({ daysPerWeek: row.dayIndex + 1 }).where(eq(schema.routine.id, routineId)).run();
  });
  return row;
}

export function renameDay(dayId: string, label: string): void {
  db.update(schema.routineDay).set({ label }).where(eq(schema.routineDay.id, dayId)).run();
}

export function removeDay(dayId: string): void {
  const day = getDay(dayId);
  if (!day) return;
  db.transaction((tx) => {
    tx.update(schema.session).set({ routineDayId: null }).where(eq(schema.session.routineDayId, dayId)).run();
    tx.delete(schema.routineDay).where(eq(schema.routineDay.id, dayId)).run();
    const rest = tx.select().from(schema.routineDay).where(eq(schema.routineDay.routineId, day.routineId)).orderBy(asc(schema.routineDay.dayIndex)).all();
    rest.forEach((d, i) => tx.update(schema.routineDay).set({ dayIndex: i }).where(eq(schema.routineDay.id, d.id)).run());
    tx.update(schema.routine).set({ daysPerWeek: Math.max(1, rest.length) }).where(eq(schema.routine.id, day.routineId)).run();
  });
}

export function addSlot(routineDayId: string, exerciseId: string, partial: Partial<RoutineSlot> = {}): RoutineSlot {
  const max = db
    .select({ n: sql<number>`coalesce(max(${schema.routineSlot.position}), -1)` })
    .from(schema.routineSlot)
    .where(eq(schema.routineSlot.routineDayId, routineDayId))
    .get();
  const row: RoutineSlot = {
    id: newId(),
    routineDayId,
    exerciseId,
    position: Number(max?.n ?? -1) + 1,
    targetSets: partial.targetSets ?? 3,
    repLo: partial.repLo ?? 8,
    repHi: partial.repHi ?? 12,
    targetRir: partial.targetRir ?? 1,
    restSeconds: partial.restSeconds ?? 120,
    supersetGroup: partial.supersetGroup ?? null,
    notes: partial.notes ?? null,
  };
  db.insert(schema.routineSlot).values(row).run();
  return row;
}

export function updateSlot(id: string, patch: Partial<Omit<RoutineSlot, 'id' | 'routineDayId'>>): void {
  const next = { ...patch };
  // Keep the rep range coherent whichever bound moved.
  if (next.repLo !== undefined || next.repHi !== undefined) {
    const cur = getSlot(id);
    if (cur) {
      const lo = next.repLo ?? cur.repLo;
      const hi = next.repHi ?? cur.repHi;
      if (lo > hi) {
        if (next.repLo !== undefined) next.repHi = lo;
        else next.repLo = hi;
      }
    }
  }
  db.update(schema.routineSlot).set(next).where(eq(schema.routineSlot.id, id)).run();
}

export function removeSlot(id: string): void {
  const slot = getSlot(id);
  if (!slot) return;
  db.transaction((tx) => {
    tx.delete(schema.routineSlot).where(eq(schema.routineSlot.id, id)).run();
    const rest = tx.select({ id: schema.routineSlot.id }).from(schema.routineSlot).where(eq(schema.routineSlot.routineDayId, slot.routineDayId)).orderBy(asc(schema.routineSlot.position)).all();
    rest.forEach((s, i) => tx.update(schema.routineSlot).set({ position: i }).where(eq(schema.routineSlot.id, s.id)).run());
  });
}

export function reorderSlots(routineDayId: string, orderedIds: string[]): void {
  db.transaction((tx) => {
    orderedIds.forEach((id, i) =>
      tx.update(schema.routineSlot).set({ position: i }).where(and(eq(schema.routineSlot.id, id), eq(schema.routineSlot.routineDayId, routineDayId))).run(),
    );
  });
}

/** Up/down reorder — more reliable one-handed than drag. */
export function moveSlot(slotId: string, delta: -1 | 1): void {
  const slot = getSlot(slotId);
  if (!slot) return;
  const ids = getSlots(slot.routineDayId).map((s) => s.id);
  const i = ids.indexOf(slotId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return;
  const a = ids[i];
  const b = ids[j];
  if (a === undefined || b === undefined) return;
  ids[i] = b;
  ids[j] = a;
  reorderSlots(slot.routineDayId, ids);
}

/** carryHistory writes an exercise_link, so progression survives the swap. */
export function swapSlotExercise(slotId: string, newExerciseId: string, opts: { carryHistory: boolean; ratio?: number }): void {
  const slot = getSlot(slotId);
  if (!slot || slot.exerciseId === newExerciseId || !getExercise(newExerciseId)) return;
  if (opts.carryHistory) linkExercises(slot.exerciseId, newExerciseId, opts.ratio ?? 1);
  db.update(schema.routineSlot).set({ exerciseId: newExerciseId }).where(eq(schema.routineSlot.id, slotId)).run();
}

/** Planned weekly hard sets per primary muscle for a routine. */
export function plannedWeeklySets(routineId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const day of getDays(routineId)) {
    for (const s of getSlots(day.id)) {
      for (const m of s.exercise.primaryMuscles) out[m] = (out[m] ?? 0) + s.targetSets;
    }
  }
  return out;
}
