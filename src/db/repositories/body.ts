/** Bodyweight and circumferences. Trend smoothing happens in the engine, never here. */
import { desc, eq, isNotNull } from 'drizzle-orm';

import { db } from '@/db/client';
import * as schema from '@/db/schema';
import type { WeighIn } from '@/engine/metabolic';
import { newId } from '@/lib/ids';

export type Measurement = typeof schema.measurement.$inferSelect;
export const MEASUREMENT_SITES = ['waist', 'arm', 'chest', 'thigh'] as const;

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

export function addMeasurement(date: string, site: string, cm: number): void {
  db.insert(schema.measurement).values({ id: newId(), date, site, cm }).run();
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
