/**
 * The lifetime counts behind XP, levels and badges (engine/level). Read-only and
 * derived every time from what was logged: nothing about a level is stored, so
 * nothing about it can drift, be lost, or need a migration.
 */
import { and, asc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import * as schema from '@/db/schema';
import type { LifetimeStats } from '@/engine/level';
import { weeklyTarget } from '@/features/program/schedule';
import { weekStartISO } from '@/lib/date';

import { getActiveRoutine } from './program';
import { getSettings } from './settings';

const FINISHED = ['completed', 'partial'] as const;
/** How far an estimated 1RM has to clear the old best to count as a new one, in kg. */
const BEST_MARGIN = 0.5;

/** The weekly workout goal, by the same rule every screen displays (features/program/schedule). */
export function weeklyGoal(): number {
  return weeklyTarget({ scheduledDays: getSettings().trainingDays.length, rotation: getActiveRoutine()?.daysPerWeek ?? 0 });
}

/**
 * Lifetime counts. `exclude` leaves one workout out, so the stats from before a
 * just-finished workout can be set against the stats after it. Water days are
 * measured against the target in force now; no older target was ever stored.
 */
export function lifetimeStats({ waterTargetMl, exclude }: { waterTargetMl: number; exclude?: string }): LifetimeStats {
  const finished = and(inArray(schema.session.status, [...FINISHED]), isNotNull(schema.session.endedAt), exclude ? ne(schema.session.id, exclude) : undefined);

  const sessions = db.select({ date: schema.session.date, endedAt: schema.session.endedAt }).from(schema.session).where(finished).all();

  const work = db
    .select({ n: sql<number>`count(*)`, kg: sql<number>`coalesce(sum(${schema.setLog.weight} * ${schema.setLog.reps}), 0)` })
    .from(schema.setLog)
    .innerJoin(schema.session, eq(schema.setLog.sessionId, schema.session.id))
    .where(and(finished, eq(schema.setLog.isWarmup, 0)))
    .get();

  // A best: a session in which a lift's estimated 1RM beat every earlier session of
  // it. The first session of a lift sets the bar; it is not a best by itself.
  const rows = db
    .select({ exerciseId: schema.exerciseSessionStat.exerciseId, e1rm: schema.exerciseSessionStat.bestE1rm })
    .from(schema.exerciseSessionStat)
    .innerJoin(schema.session, eq(schema.exerciseSessionStat.sessionId, schema.session.id))
    .where(finished)
    .orderBy(asc(schema.session.startedAt))
    .all();
  const top = new Map<string, number>();
  let bests = 0;
  for (const r of rows) {
    const prev = top.get(r.exerciseId);
    if (prev !== undefined && prev > 0 && r.e1rm > prev + BEST_MARGIN) bests += 1;
    if (prev === undefined || r.e1rm > prev) top.set(r.exerciseId, r.e1rm);
  }

  const goal = weeklyGoal();
  const perWeek = new Map<string, number>();
  for (const s of sessions) {
    const week = weekStartISO(s.date);
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  }

  const hours = sessions.map((s) => (s.endedAt ? new Date(s.endedAt).getHours() : NaN)).filter((h) => Number.isFinite(h));
  const water = db.select({ ml: sql<number>`sum(${schema.waterLog.ml})` }).from(schema.waterLog).groupBy(schema.waterLog.date).all();
  const foodDays = db.select({ n: sql<number>`count(distinct ${schema.mealLog.date})` }).from(schema.mealLog).get();
  const weighIns = db.select({ n: sql<number>`count(*)` }).from(schema.weighIn).get();

  return {
    workouts: sessions.length,
    sets: Number(work?.n ?? 0),
    tonnage: Number(work?.kg ?? 0),
    bests,
    goalWeeks: goal > 0 ? [...perWeek.values()].filter((n) => n >= goal).length : 0,
    waterDays: water.filter((d) => Number(d.ml) >= waterTargetMl).length,
    foodDays: Number(foodDays?.n ?? 0),
    weighIns: Number(weighIns?.n ?? 0),
    earlyWorkouts: hours.filter((h) => h < 8).length,
    lateWorkouts: hours.filter((h) => h >= 21).length,
  };
}

/** A lift's best estimated 1RM from any other workout — what a set has to beat to be a new best. */
export function bestBefore(exerciseId: string, sessionId: string): number {
  const row = db
    .select({ best: sql<number>`max(${schema.exerciseSessionStat.bestE1rm})` })
    .from(schema.exerciseSessionStat)
    .where(and(eq(schema.exerciseSessionStat.exerciseId, exerciseId), ne(schema.exerciseSessionStat.sessionId, sessionId)))
    .get();
  return Number(row?.best ?? 0);
}
