/**
 * Plans: routine -> day -> ordered slots. Any number of plans; at most one active.
 * Archived plans are hidden but keep their days, so history still has day names.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import * as schema from '@/db/schema';
import { nowISO } from '@/lib/date';
import { newId } from '@/lib/ids';

import { getExercise, linkExercises, type Exercise } from './exercises';

export type Routine = typeof schema.routine.$inferSelect;
export type RoutineDay = typeof schema.routineDay.$inferSelect;
export type RoutineSlot = typeof schema.routineSlot.$inferSelect;
export type SlotWithExercise = RoutineSlot & { exercise: Exercise };
/** What a workout needs from a slot. Session snapshots carry the same shape. */
export type Targets = Pick<RoutineSlot, 'targetSets' | 'repLo' | 'repHi' | 'targetRir' | 'restSeconds' | 'supersetGroup' | 'startWeight'>;

export function getActiveRoutine(): Routine | undefined {
  return db.select().from(schema.routine).where(eq(schema.routine.active, 1)).limit(1).get();
}

export function getRoutine(id: string): Routine | undefined {
  return db.select().from(schema.routine).where(eq(schema.routine.id, id)).get();
}

/** Active first, then oldest. Archived plans only when asked for. */
export function listRoutines(opts: { archived?: boolean } = {}): Routine[] {
  return db
    .select()
    .from(schema.routine)
    .where(opts.archived ? isNotNull(schema.routine.archivedAt) : isNull(schema.routine.archivedAt))
    .orderBy(desc(schema.routine.active), asc(schema.routine.createdAt))
    .all();
}

export function setActiveRoutine(id: string): void {
  db.transaction(() => {
    db.update(schema.routine).set({ active: 0 }).run();
    db.update(schema.routine).set({ active: 1, archivedAt: null }).where(eq(schema.routine.id, id)).run();
  });
}

export function renameRoutine(id: string, name: string): void {
  if (!name.trim()) return;
  db.update(schema.routine).set({ name: name.trim() }).where(eq(schema.routine.id, id)).run();
}

export function setDaysPerWeek(id: string, daysPerWeek: number): void {
  db.update(schema.routine).set({ daysPerWeek: Math.max(1, Math.min(7, Math.round(daysPerWeek))) }).where(eq(schema.routine.id, id)).run();
}

/** Archiving the active plan leaves no plan active — Today then asks to pick one. */
export function archiveRoutine(id: string, archived: boolean): void {
  db.update(schema.routine)
    .set(archived ? { archivedAt: nowISO(), active: 0 } : { archivedAt: null })
    .where(eq(schema.routine.id, id))
    .run();
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
 * Cycle position, NOT the calendar: the day after the last finished or skipped one.
 * A missed Tuesday leaves you on the same day. Cancelled workouts don't count.
 */
export function resolveNextDay(routineId: string): RoutineDay | undefined {
  const days = getDays(routineId);
  if (days.length === 0) return undefined;
  const last = db
    .select({ dayId: schema.session.routineDayId })
    .from(schema.session)
    .innerJoin(schema.routineDay, eq(schema.session.routineDayId, schema.routineDay.id))
    .where(
      and(
        eq(schema.routineDay.routineId, routineId),
        isNotNull(schema.session.endedAt),
        // Mirrors DAY_DONE in ./sessions (not imported: sessions imports this module).
        inArray(schema.session.status, ['completed', 'partial', 'skipped']),
      ),
    )
    .orderBy(desc(schema.session.startedAt))
    .limit(1)
    .get();
  if (!last?.dayId) return days[0];
  const idx = days.findIndex((d) => d.id === last.dayId);
  return days[(idx + 1) % days.length] ?? days[0];
}

export function createRoutine(name: string, daysPerWeek: number): Routine {
  const row: Routine = { id: newId(), name: name.trim() || 'New plan', daysPerWeek, active: 0, createdAt: nowISO(), archivedAt: null };
  db.insert(schema.routine).values(row).run();
  return row;
}

export type SlotDraft = { exerciseId: string } & Partial<Omit<RoutineSlot, 'id' | 'routineDayId' | 'position' | 'exerciseId'>>;
export interface PlanDraft {
  name: string;
  daysPerWeek: number;
  days: { label: string; slots: SlotDraft[] }[];
}

/** Writes a whole plan in one transaction — used by templates and Duplicate. */
export function createPlan(draft: PlanDraft, opts: { activate?: boolean } = {}): Routine {
  const routine = createRoutineRow(draft);
  db.transaction(() => {
    db.insert(schema.routine).values(routine).run();
    draft.days.forEach((d, dayIndex) => {
      const dayId = newId();
      db.insert(schema.routineDay).values({ id: dayId, routineId: routine.id, dayIndex, label: d.label }).run();
      d.slots
        .filter((s) => getExercise(s.exerciseId))
        .forEach((s, position) => {
          db.insert(schema.routineSlot)
            .values({
              id: newId(),
              routineDayId: dayId,
              exerciseId: s.exerciseId,
              position,
              targetSets: s.targetSets ?? 3,
              repLo: s.repLo ?? 8,
              repHi: s.repHi ?? 12,
              targetRir: s.targetRir ?? 1,
              restSeconds: s.restSeconds ?? 120,
              supersetGroup: s.supersetGroup ?? null,
              notes: s.notes ?? null,
              startWeight: s.startWeight ?? null,
            })
            .run();
        });
    });
  });
  if (opts.activate) setActiveRoutine(routine.id);
  return routine;
}

function createRoutineRow(draft: PlanDraft): Routine {
  return { id: newId(), name: draft.name.trim() || 'New plan', daysPerWeek: Math.max(1, draft.daysPerWeek), active: 0, createdAt: nowISO(), archivedAt: null };
}

export function duplicateRoutine(id: string): Routine | undefined {
  const r = getRoutine(id);
  if (!r) return undefined;
  return createPlan({
    name: `${r.name} (copy)`,
    daysPerWeek: r.daysPerWeek,
    days: getDays(id).map((d) => ({
      label: d.label,
      slots: getSlots(d.id).map((s) => ({
        exerciseId: s.exerciseId,
        targetSets: s.targetSets,
        repLo: s.repLo,
        repHi: s.repHi,
        targetRir: s.targetRir,
        restSeconds: s.restSeconds,
        supersetGroup: s.supersetGroup,
        notes: s.notes,
        startWeight: s.startWeight,
      })),
    })),
  });
}

export function deleteRoutine(id: string): void {
  db.transaction(() => {
    const dayIds = db.select({ id: schema.routineDay.id }).from(schema.routineDay).where(eq(schema.routineDay.routineId, id)).all();
    // Sessions keep their data; they just stop pointing at a day that no longer exists.
    for (const d of dayIds) db.update(schema.session).set({ routineDayId: null }).where(eq(schema.session.routineDayId, d.id)).run();
    db.delete(schema.routine).where(eq(schema.routine.id, id)).run();
  });
}

export function addDay(routineId: string, label: string): RoutineDay {
  const max = db
    .select({ n: sql<number>`coalesce(max(${schema.routineDay.dayIndex}), -1)` })
    .from(schema.routineDay)
    .where(eq(schema.routineDay.routineId, routineId))
    .get();
  const row: RoutineDay = { id: newId(), routineId, dayIndex: Number(max?.n ?? -1) + 1, label: label.trim() || 'New day' };
  db.insert(schema.routineDay).values(row).run();
  return row;
}

export function renameDay(dayId: string, label: string): void {
  db.update(schema.routineDay).set({ label }).where(eq(schema.routineDay.id, dayId)).run();
}

/** Up/down reorder of plan days. The cycle follows the new order. */
export function moveDay(dayId: string, delta: -1 | 1): void {
  const day = getDay(dayId);
  if (!day) return;
  const days = getDays(day.routineId);
  const i = days.findIndex((d) => d.id === dayId);
  const a = days[i];
  const b = days[i + delta];
  if (!a || !b) return;
  db.transaction(() => {
    db.update(schema.routineDay).set({ dayIndex: b.dayIndex }).where(eq(schema.routineDay.id, a.id)).run();
    db.update(schema.routineDay).set({ dayIndex: a.dayIndex }).where(eq(schema.routineDay.id, b.id)).run();
  });
}

export function removeDay(dayId: string): void {
  const day = getDay(dayId);
  if (!day) return;
  db.transaction(() => {
    db.update(schema.session).set({ routineDayId: null }).where(eq(schema.session.routineDayId, dayId)).run();
    db.delete(schema.routineDay).where(eq(schema.routineDay.id, dayId)).run();
    const rest = db.select().from(schema.routineDay).where(eq(schema.routineDay.routineId, day.routineId)).orderBy(asc(schema.routineDay.dayIndex)).all();
    rest.forEach((d, i) => db.update(schema.routineDay).set({ dayIndex: i }).where(eq(schema.routineDay.id, d.id)).run());
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
    startWeight: partial.startWeight ?? null,
  };
  db.insert(schema.routineSlot).values(row).run();
  return row;
}

/** Undo for removeSlot: the exact row back, at its old position. */
export function restoreSlot(row: RoutineSlot): void {
  db.transaction(() => {
    db.update(schema.routineSlot)
      .set({ position: sql`${schema.routineSlot.position} + 1` })
      .where(and(eq(schema.routineSlot.routineDayId, row.routineDayId), sql`${schema.routineSlot.position} >= ${row.position}`))
      .run();
    db.insert(schema.routineSlot).values(row).onConflictDoNothing().run();
  });
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

export function removeSlot(id: string): RoutineSlot | undefined {
  const slot = getSlot(id);
  if (!slot) return undefined;
  db.transaction(() => {
    db.delete(schema.routineSlot).where(eq(schema.routineSlot.id, id)).run();
    const rest = db.select({ id: schema.routineSlot.id }).from(schema.routineSlot).where(eq(schema.routineSlot.routineDayId, slot.routineDayId)).orderBy(asc(schema.routineSlot.position)).all();
    rest.forEach((s, i) => db.update(schema.routineSlot).set({ position: i }).where(eq(schema.routineSlot.id, s.id)).run());
  });
  return slot;
}

export function reorderSlots(routineDayId: string, orderedIds: string[]): void {
  db.transaction(() => {
    orderedIds.forEach((id, i) =>
      db.update(schema.routineSlot).set({ position: i }).where(and(eq(schema.routineSlot.id, id), eq(schema.routineSlot.routineDayId, routineDayId))).run(),
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
