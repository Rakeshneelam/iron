/** Bodyweight and circumferences. Trend smoothing happens in the engine, never here. */
import { asc, desc, eq, gte, isNotNull } from 'drizzle-orm';

import { db } from '@/db/client';
import * as schema from '@/db/schema';
import type { WeighIn } from '@/engine/metabolic';
import { newId } from '@/lib/ids';

export type Measurement = typeof schema.measurement.$inferSelect;
export type CheckIn = typeof schema.checkIn.$inferSelect;

export function getCheckIn(dateISO: string): CheckIn | undefined {
  return db.select().from(schema.checkIn).where(eq(schema.checkIn.date, dateISO)).get();
}

/** One check-in per day: checking in again replaces that day's answers. */
export function saveCheckIn(row: CheckIn): void {
  const { date: _date, ...answers } = row;
  db.insert(schema.checkIn).values(row).onConflictDoUpdate({ target: schema.checkIn.date, set: answers }).run();
}

export function deleteCheckIn(dateISO: string): void {
  db.delete(schema.checkIn).where(eq(schema.checkIn.date, dateISO)).run();
}

/** Ascending, from `fromISO` on. */
export function listCheckIns(fromISO: string): CheckIn[] {
  return db.select().from(schema.checkIn).where(gte(schema.checkIn.date, fromISO)).orderBy(asc(schema.checkIn.date)).all();
}

/** One weigh-in per day: re-logging the same morning replaces it. */
export function upsertWeighIn(dateISO: string, kg: number, note?: string): void {
  const value = Math.round(kg * 10) / 10;
  db.insert(schema.weighIn)
    .values({ date: dateISO, kg: value, note: note ?? null })
    .onConflictDoUpdate({ target: schema.weighIn.date, set: { kg: value, note: note ?? null } })
    .run();
}

export function deleteWeighIn(dateISO: string): void {
  db.delete(schema.weighIn).where(eq(schema.weighIn.date, dateISO)).run();
}

/** Engine shape, ascending — hand straight to weightTrend(). `limit` keeps the latest N. */
export function listWeighIns(limit = 100_000): WeighIn[] {
  return db
    .select({ date: schema.weighIn.date, kg: schema.weighIn.kg })
    .from(schema.weighIn)
    .orderBy(desc(schema.weighIn.date))
    .limit(limit)
    .all()
    .reverse();
}

export function getWeighIn(dateISO: string): WeighIn | undefined {
  return db
    .select({ date: schema.weighIn.date, kg: schema.weighIn.kg })
    .from(schema.weighIn)
    .where(eq(schema.weighIn.date, dateISO))
    .get();
}

/** Latest known bodyweight: last weigh-in, else the last session's morning weight. */
export function getLatestWeight(): number | undefined {
  const w = db.select({ kg: schema.weighIn.kg }).from(schema.weighIn).orderBy(desc(schema.weighIn.date)).limit(1).get();
  if (w) return w.kg;
  const s = db
    .select({ kg: schema.session.bodyweightKg })
    .from(schema.session)
    .where(isNotNull(schema.session.bodyweightKg))
    .orderBy(desc(schema.session.startedAt))
    .limit(1)
    .get();
  return s?.kg ?? undefined;
}

export function addMeasurement(date: string, site: string, cm: number): Measurement {
  const row: Measurement = { id: newId(), date, site, cm: Math.round(cm * 10) / 10 };
  db.insert(schema.measurement).values(row).run();
  return row;
}

export function updateMeasurement(id: string, patch: Partial<Pick<Measurement, 'date' | 'cm'>>): void {
  db.update(schema.measurement).set(patch).where(eq(schema.measurement.id, id)).run();
}

/** Undo for a delete: the exact row back. */
export function restoreMeasurement(row: Measurement): void {
  db.insert(schema.measurement).values(row).onConflictDoNothing().run();
}

/** Moves a weigh-in to another day (a wrong date is a common slip). Replaces any reading there. */
export function moveWeighIn(fromISO: string, toISO: string, kg: number): void {
  db.transaction(() => {
    if (fromISO !== toISO) deleteWeighIn(fromISO);
    upsertWeighIn(toISO, kg);
  });
}

export function deleteMeasurement(id: string): void {
  db.delete(schema.measurement).where(eq(schema.measurement.id, id)).run();
}

export function listMeasurements(site?: string): Measurement[] {
  const q = db.select().from(schema.measurement);
  const rows = site ? q.where(eq(schema.measurement.site, site)).orderBy(desc(schema.measurement.date)).all()
    : q.orderBy(desc(schema.measurement.date)).all();
  return rows;
}
