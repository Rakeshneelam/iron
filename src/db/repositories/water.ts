/** Individual drink events, not a daily total — the reminder scheduler needs to know WHEN. */
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import * as schema from '@/db/schema';
import { lastNDays, nowISO, todayISO } from '@/lib/date';
import { newId } from '@/lib/ids';

export type WaterEntry = typeof schema.waterLog.$inferSelect;

export function logWater(ml: number, dateISO: string = todayISO()): void {
  const amount = Math.round(ml);
  if (!(amount > 0)) return;
  db.insert(schema.waterLog).values({ id: newId(), date: dateISO, ml: amount, loggedAt: nowISO() }).run();
}

export function getDayTotal(dateISO: string): number {
  const row = db
    .select({ total: sql<number>`coalesce(sum(${schema.waterLog.ml}), 0)` })
    .from(schema.waterLog)
    .where(eq(schema.waterLog.date, dateISO))
    .get();
  return Number(row?.total ?? 0);
}

export function getDayEntries(dateISO: string): WaterEntry[] {
  return db.select().from(schema.waterLog).where(eq(schema.waterLog.date, dateISO)).orderBy(desc(schema.waterLog.loggedAt)).all();
}

export function undoLast(dateISO: string): void {
  const last = db
    .select({ id: schema.waterLog.id })
    .from(schema.waterLog)
    .where(eq(schema.waterLog.date, dateISO))
    .orderBy(desc(schema.waterLog.loggedAt))
    .limit(1)
    .get();
  if (last) deleteEntry(last.id);
}

export function deleteEntry(id: string): void {
  db.delete(schema.waterLog).where(eq(schema.waterLog.id, id)).run();
}

/** Ascending, zero-filled — a missed day is 0 here, never a mark against him. */
export function historyMl(days: number): { date: string; ml: number }[] {
  const dates = lastNDays(days);
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return [];
  const rows = db
    .select({ date: schema.waterLog.date, ml: sql<number>`sum(${schema.waterLog.ml})` })
    .from(schema.waterLog)
    .where(and(gte(schema.waterLog.date, first), lte(schema.waterLog.date, last)))
    .groupBy(schema.waterLog.date)
    .all();
  const byDate = new Map(rows.map((r) => [r.date, Number(r.ml)]));
  return dates.map((date) => ({ date, ml: byDate.get(date) ?? 0 }));
}
