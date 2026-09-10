/**
 * Aggregates for Review and the deload proposal. This module CALLS the engine —
 * it never reimplements a rule (docs/04). It reads the precomputed
 * exercise_session_stat wherever it can so nothing aggregates raw set_log at render.
 */
import { and, asc, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import * as schema from '@/db/schema';
import { phaseCheck, weeklyRateKg, weightTrend } from '@/engine/metabolic';
import {
  bestE1RM,
  readinessModifier,
  shouldDeload,
  slope,
  tonnage,
  VOLUME_LANDMARKS,
  volumeStatus,
  working,
  type DeloadInput,
} from '@/engine/progression';
import { addDays, daysBetweenISO, lastNDays, todayISO, weekStartISO } from '@/lib/date';

import { listWeighIns } from './body';
import { intakeBetween } from './food';
import { groupBy, toEngineSet } from './mappers';
import { getSettings } from './settings';

type Stat = typeof schema.exerciseSessionStat.$inferSelect;

/* ======================= written at session close ======================= */

/** Recompute this session's per-exercise stats. Runs inside the caller's transaction. */
export function writeSessionStats(sessionId: string): void {
  const s = db.select().from(schema.session).where(eq(schema.session.id, sessionId)).get();
  if (!s) return;
  const rows = db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, sessionId)).all();
  db.delete(schema.exerciseSessionStat).where(eq(schema.exerciseSessionStat.sessionId, sessionId)).run();
  for (const [exerciseId, sets] of groupBy(rows, (r) => r.exerciseId)) {
    const eng = sets.map((r) => toEngineSet(r));
    const w = working(eng);
    if (w.length === 0) continue;
    db.insert(schema.exerciseSessionStat)
      .values({
        sessionId,
        exerciseId,
        bestE1rm: bestE1RM(eng),
        tonnage: tonnage(eng),
        hardSets: w.length,
        topWeight: Math.max(...w.map((x) => x.weight)),
        date: s.date,
      })
      .run();
  }
}

/** docs/03 rebuild rule: exercise_session_stat is derived and can be regenerated. */
export function rebuildAllStats(): void {
  db.transaction((tx) => {
    tx.delete(schema.exerciseSessionStat).run();
    const ended = tx.select({ id: schema.session.id }).from(schema.session).where(isNotNull(schema.session.endedAt)).all();
    for (const s of ended) writeSessionStats(s.id);
  });
}

/* =============================== series ================================= */

function weekEnd(weekStart: string): string {
  return addDays(weekStart, 6);
}

/** Hard (non-warm-up) sets per primary muscle in the week starting `weekStart`. */
export function weeklySetsPerMuscle(weekStart: string = weekStartISO(todayISO())): Record<string, number> {
  const rows = db
    .select({ exerciseId: schema.exerciseSessionStat.exerciseId, sets: sql<number>`sum(${schema.exerciseSessionStat.hardSets})` })
    .from(schema.exerciseSessionStat)
    .where(and(gte(schema.exerciseSessionStat.date, weekStart), lte(schema.exerciseSessionStat.date, weekEnd(weekStart))))
    .groupBy(schema.exerciseSessionStat.exerciseId)
    .all();
  const muscles = new Map(
    db.select({ id: schema.exercise.id, m: schema.exercise.primaryMuscles }).from(schema.exercise).all().map((e) => [e.id, e.m]),
  );
  const out: Record<string, number> = {};
  for (const r of rows) {
    for (const m of muscles.get(r.exerciseId) ?? []) out[m] = (out[m] ?? 0) + Number(r.sets);
  }
  return out;
}

export function e1rmSeries(exerciseId: string, limit = 60): { date: string; e1rm: number }[] {
  return db
    .select({ date: schema.exerciseSessionStat.date, e1rm: schema.exerciseSessionStat.bestE1rm })
    .from(schema.exerciseSessionStat)
    .where(eq(schema.exerciseSessionStat.exerciseId, exerciseId))
    .orderBy(desc(schema.exerciseSessionStat.date))
    .limit(limit)
    .all()
    .reverse();
}

/** Ascending, zero-filled daily tonnage for ACWR. */
export function dailyTonnage(days = 28): number[] {
  const dates = lastNDays(days);
  const first = dates[0];
  if (!first) return [];
  const rows = db
    .select({ date: schema.exerciseSessionStat.date, t: sql<number>`sum(${schema.exerciseSessionStat.tonnage})` })
    .from(schema.exerciseSessionStat)
    .where(gte(schema.exerciseSessionStat.date, first))
    .groupBy(schema.exerciseSessionStat.date)
    .all();
  const byDate = new Map(rows.map((r) => [r.date, Number(r.t)]));
  return dates.map((d) => byDate.get(d) ?? 0);
}

/** Average working-set RIR over 7 days. With no data it reports a neutral 2, not a false alarm. */
export function avgRIRLast7d(): number {
  const since = addDays(todayISO(), -6);
  const row = db
    .select({ avg: sql<number | null>`avg(${schema.setLog.rir})`, n: sql<number>`count(*)` })
    .from(schema.setLog)
    .innerJoin(schema.session, eq(schema.setLog.sessionId, schema.session.id))
    .where(and(gte(schema.session.date, since), eq(schema.setLog.isWarmup, 0)))
    .get();
  return row && Number(row.n) > 0 && row.avg !== null ? Number(row.avg) : 2;
}

/** Sessions in the last 7 days whose readiness would have shaved load (modifier <= 0.95). */
export function poorReadinessDays(): number {
  const since = addDays(todayISO(), -6);
  const rows = db.select().from(schema.session).where(gte(schema.session.date, since)).all();
  return rows.filter(
    (s) =>
      readinessModifier({
        sleepHours: s.sleepHours ?? undefined,
        soreness: s.soreness ?? undefined,
        stress: s.stress ?? undefined,
      }) <= 0.95,
  ).length;
}

export function weeksSinceDeload(): number {
  const last = getSettings().lastDeloadDate;
  if (last) return Math.floor(daysBetweenISO(last, todayISO()) / 7);
  const first = db.select({ date: schema.session.date }).from(schema.session).orderBy(asc(schema.session.date)).limit(1).get();
  return first ? Math.floor(daysBetweenISO(first.date, todayISO()) / 7) : 0;
}

/** e1RM slopes for every lift trained in the last 6 weeks with at least 3 sessions. */
function recentTrends(): { exerciseId: string; trend: number; e1rm: number; n: number }[] {
  const since = addDays(todayISO(), -42);
  const rows = db
    .select()
    .from(schema.exerciseSessionStat)
    .where(gte(schema.exerciseSessionStat.date, since))
    .orderBy(asc(schema.exerciseSessionStat.date))
    .all();
  const out: { exerciseId: string; trend: number; e1rm: number; n: number }[] = [];
  for (const [exerciseId, stats] of groupBy(rows, (r) => r.exerciseId)) {
    const series = stats.slice(-5).map((s) => s.bestE1rm);
    const last = series[series.length - 1];
    if (last === undefined) continue;
    out.push({ exerciseId, trend: slope(series), e1rm: last, n: series.length });
  }
  return out;
}

export function buildDeloadInput(): DeloadInput {
  return {
    exerciseTrends: recentTrends().filter((t) => t.n >= 3).map((t) => t.trend),
    dailyTonnage: dailyTonnage(28),
    avgRIR7d: avgRIRLast7d(),
    poorReadinessDays: poorReadinessDays(),
    weeksSinceDeload: weeksSinceDeload(),
  };
}

/**
 * Resets since the last e1RM high: session-over-session top-weight drops of >= 8%
 * that were not followed by a new best. Feeds prescribe()'s SWAP branch.
 */
export function countConsecutiveResets(exerciseId: string): number {
  const rows: Stat[] = db
    .select()
    .from(schema.exerciseSessionStat)
    .where(eq(schema.exerciseSessionStat.exerciseId, exerciseId))
    .orderBy(asc(schema.exerciseSessionStat.date))
    .all();
  let best = 0;
  let resets = 0;
  let prevTop: number | null = null;
  for (const r of rows) {
    if (r.bestE1rm > best + 0.05) {
      best = r.bestE1rm;
      resets = 0;
    } else if (prevTop !== null && r.topWeight <= prevTop * 0.92) {
      resets += 1;
    }
    prevTop = r.topWeight;
  }
  return resets;
}

/* ============================ weekly review ============================= */

export interface LiftTrend {
  exerciseId: string;
  name: string;
  trend: number;
  e1rm: number;
}

export interface WeeklyReview {
  weekStart: string;
  progressed: LiftTrend[];
  stalled: LiftTrend[];
  volume: { muscle: string; sets: number; status: 'under' | 'optimal' | 'high' | 'over'; mev: number; mav: number; mrv: number }[];
  deload: { deload: boolean; reasons: string[] };
  bodyweight: { rateKgPerWeek: number; trendKg: number | null; check: ReturnType<typeof phaseCheck> | null };
  nutrition: { avgKcal: number | null; avgProtein: number | null; daysLogged: number };
  plateaus: { exerciseId: string; name: string; note: string }[];
  sessionsLogged: number;
}

export function weeklyReview(weekStart: string = weekStartISO(todayISO())): WeeklyReview {
  const end = weekEnd(weekStart);
  const names = new Map(db.select({ id: schema.exercise.id, name: schema.exercise.name, m: schema.exercise.primaryMuscles }).from(schema.exercise).all().map((e) => [e.id, e]));
  const sets = weeklySetsPerMuscle(weekStart);

  const progressed: LiftTrend[] = [];
  const stalled: LiftTrend[] = [];
  const plateaus: WeeklyReview['plateaus'] = [];
  for (const t of recentTrends()) {
    const ex = names.get(t.exerciseId);
    const name = ex?.name ?? t.exerciseId;
    const lift = { exerciseId: t.exerciseId, name, trend: t.trend, e1rm: t.e1rm };
    if (t.n >= 3 && t.trend <= 0) {
      stalled.push(lift);
      const muscle = ex?.m[0];
      if (muscle) {
        const have = sets[muscle] ?? 0;
        const mav = VOLUME_LANDMARKS[muscle]?.mav;
        const advice =
          mav === undefined
            ? 'hold the weight and chase one more rep before changing anything'
            : have < mav
              ? `${muscle} volume is at ${have} sets, below MAV — try the extra set before dropping load`
              : `${muscle} volume is already at ${have} sets — a 10% reset will likely restart progress`;
        plateaus.push({ exerciseId: t.exerciseId, name, note: `${name} flat ${t.n} sessions; ${advice}.` });
      }
    } else if (t.n >= 2 && t.trend > 0) {
      progressed.push(lift);
    }
  }
  progressed.sort((a, b) => b.trend - a.trend);

  const volume = Object.entries(VOLUME_LANDMARKS).map(([muscle, l]) => {
    const n = sets[muscle] ?? 0;
    return { muscle, sets: n, status: volumeStatus(muscle, n), mev: l.mev, mav: l.mav, mrv: l.mrv };
  });

  const settings = getSettings();
  const weighIns = listWeighIns().filter((w) => w.date <= end);
  const trend = weightTrend(weighIns);
  const lastTrend = trend[trend.length - 1];
  const rate = weeklyRateKg(weighIns);
  const bodyweight = {
    rateKgPerWeek: rate,
    trendKg: lastTrend?.trend ?? null,
    check: lastTrend && trend.length >= 7 ? phaseCheck(settings.phase, lastTrend.trend, rate) : null,
  };

  const intake = intakeBetween(weekStart, end);
  const nutrition = {
    avgKcal: intake.length ? intake.reduce((a, d) => a + d.kcal, 0) / intake.length : null,
    avgProtein: intake.length ? intake.reduce((a, d) => a + (d.proteinG ?? 0), 0) / intake.length : null,
    daysLogged: intake.length,
  };

  const sessionsLogged = Number(
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.session)
      .where(and(isNotNull(schema.session.endedAt), gte(schema.session.date, weekStart), lte(schema.session.date, end)))
      .get()?.n ?? 0,
  );

  return {
    weekStart,
    progressed,
    stalled,
    volume,
    deload: shouldDeload(buildDeloadInput()),
    bodyweight,
    nutrition,
    plateaus,
    sessionsLogged,
  };
}
