/**
 * Weekly progress and the inputs for plan recommendations. Read-only: trends come
 * from the engine; this file only gathers the numbers.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, like, lt, lte, max, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import * as schema from '@/db/schema';
import { weightTrend } from '@/engine/metabolic';
import { slope, VOLUME_LANDMARKS } from '@/engine/progression';
import { CATALOG_BY_ID, type Pattern } from '@/data/catalog';
import { weeklyInsights, type LiftRegion, type WeekFacts } from '@/engine/insights';
import { recommend, type RecExercise, type RecInput, type Recommendation } from '@/engine/recommend';
import { detectRecords, type RecordEvent } from '@/engine/records';
import { weeklyTarget } from '@/features/program/schedule';
import { addDays, daysBetweenISO, todayISO } from '@/lib/date';

import { listMeasurements, listWeighIns } from './body';
import { intakeBetween } from './food';
import { groupBy } from './mappers';
import { getActiveRoutine, getDays, getSlots, plannedWeeklySets } from './program';
import type { Session } from './sessions';
import { getRaw, getSettings, setRaw } from './settings';
import { countConsecutiveResets, e1rmSeries } from './stats';

export interface LiftChange {
  exerciseId: string;
  name: string;
  topWeight: number;
  prevTopWeight: number | null;
  bestE1rm: number;
  prevBestE1rm: number | null;
}

export interface WeekSummary {
  weekStart: string;
  weekEnd: string;
  plannedDays: number;
  completed: number;
  partial: number;
  skipped: number;
  cancelled: number;
  exercises: number;
  sets: number;
  reps: number;
  tonnage: number;
  minutes: number;
  /** Lifts trained this week vs the last time before it. */
  lifts: LiftChange[];
  /** Smoothed bodyweight just before the week and at its end. */
  bodyweight: { start: number | null; end: number | null };
  /** Sites measured this week vs the previous reading. */
  measurements: { site: string; value: number; prev: number | null }[];
  water: { days: number; daysLogged: number; daysHit: number; avgMl: number };
}

export function weekSummary(weekStart: string, waterTargetMl: number): WeekSummary {
  const weekEnd = addDays(weekStart, 6);
  const inWeek = and(gte(schema.session.date, weekStart), lte(schema.session.date, weekEnd), isNotNull(schema.session.endedAt));

  const sessions = db.select().from(schema.session).where(inWeek).all();
  const count = (st: Session['status']) => sessions.filter((s) => s.status === st).length;
  const minutes = sessions
    .filter((s) => s.status !== 'skipped' && s.endedAt)
    .reduce((m, s) => m + Math.max(0, (Date.parse(s.endedAt ?? s.startedAt) - Date.parse(s.startedAt)) / 60_000), 0);

  const agg = db
    .select({
      sets: sql<number>`count(*)`,
      reps: sql<number>`coalesce(sum(${schema.setLog.reps}), 0)`,
      tonnage: sql<number>`coalesce(sum(${schema.setLog.weight} * ${schema.setLog.reps}), 0)`,
      exercises: sql<number>`count(distinct ${schema.setLog.exerciseId})`,
    })
    .from(schema.setLog)
    .innerJoin(schema.session, eq(schema.setLog.sessionId, schema.session.id))
    .where(and(inWeek, eq(schema.setLog.isWarmup, 0)))
    .get();

  const names = new Map(db.select({ id: schema.exercise.id, name: schema.exercise.name }).from(schema.exercise).all().map((e) => [e.id, e.name]));
  const stats = db
    .select()
    .from(schema.exerciseSessionStat)
    .where(and(gte(schema.exerciseSessionStat.date, weekStart), lte(schema.exerciseSessionStat.date, weekEnd)))
    .all();
  const lifts: LiftChange[] = [];
  for (const [exerciseId, rows] of groupBy(stats, (r) => r.exerciseId)) {
    const prev = db
      .select()
      .from(schema.exerciseSessionStat)
      .where(and(eq(schema.exerciseSessionStat.exerciseId, exerciseId), lt(schema.exerciseSessionStat.date, weekStart)))
      .orderBy(desc(schema.exerciseSessionStat.date))
      .limit(1)
      .get();
    lifts.push({
      exerciseId,
      name: names.get(exerciseId) ?? exerciseId,
      topWeight: Math.max(...rows.map((r) => r.topWeight)),
      prevTopWeight: prev?.topWeight ?? null,
      bestE1rm: Math.max(...rows.map((r) => r.bestE1rm)),
      prevBestE1rm: prev?.bestE1rm ?? null,
    });
  }
  lifts.sort((a, b) => (b.bestE1rm - (b.prevBestE1rm ?? b.bestE1rm)) - (a.bestE1rm - (a.prevBestE1rm ?? a.bestE1rm)));

  const trend = weightTrend(listWeighIns().filter((w) => w.date <= weekEnd));
  const before = [...trend].reverse().find((t) => t.date < weekStart);
  const firstIn = trend.find((t) => t.date >= weekStart);
  const last = trend[trend.length - 1];
  const bodyweight = {
    start: before?.trend ?? firstIn?.trend ?? null,
    end: last && last.date >= weekStart ? last.trend : null,
  };

  const all = listMeasurements();
  const measurements: WeekSummary['measurements'] = [];
  for (const [site, rows] of groupBy(all.filter((m) => m.date >= weekStart && m.date <= weekEnd), (m) => m.site)) {
    const latest = rows[0];
    if (!latest) continue;
    const prev = all.find((m) => m.site === site && m.date < weekStart);
    measurements.push({ site, value: latest.cm, prev: prev?.cm ?? null });
  }

  const water = db
    .select({ date: schema.waterLog.date, ml: sql<number>`sum(${schema.waterLog.ml})` })
    .from(schema.waterLog)
    .where(and(gte(schema.waterLog.date, weekStart), lte(schema.waterLog.date, weekEnd)))
    .groupBy(schema.waterLog.date)
    .all()
    .map((r) => Number(r.ml));
  const logged = water.filter((ml) => ml > 0);

  return {
    weekStart,
    weekEnd,
    // The same resolver Today, Plans and Settings display from, so "planned this
    // week" cannot drift away from what those screens say (UX-10). Imported from
    // features because the rule is pure policy with no dependencies, and the
    // alternative is the second copy of it that caused the drift.
    plannedDays: weeklyTarget({
      scheduledDays: getSettings().trainingDays.length,
      rotation: getActiveRoutine()?.daysPerWeek ?? 0,
    }),
    completed: count('completed'),
    partial: count('partial'),
    skipped: count('skipped'),
    cancelled: count('cancelled'),
    exercises: Number(agg?.exercises ?? 0),
    sets: Number(agg?.sets ?? 0),
    reps: Number(agg?.reps ?? 0),
    tonnage: Number(agg?.tonnage ?? 0),
    minutes: Math.round(minutes),
    lifts,
    bodyweight,
    measurements,
    water: {
      days: Math.max(0, Math.min(7, daysBetweenISO(weekStart, todayISO()) + 1)),
      daysLogged: logged.length,
      daysHit: logged.filter((ml) => ml >= waterTargetMl).length,
      avgMl: logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : 0,
    },
  };
}

/** Every finished or skipped workout, newest first, with its day name and set count. */
export function recentWorkouts(limit = 10): { session: Session; dayLabel: string | null; sets: number }[] {
  const rows = db
    .select({ session: schema.session, dayLabel: schema.routineDay.label })
    .from(schema.session)
    .leftJoin(schema.routineDay, eq(schema.session.routineDayId, schema.routineDay.id))
    .where(isNotNull(schema.session.endedAt))
    .orderBy(desc(schema.session.startedAt))
    .limit(limit)
    .all();
  const ids = rows.map((r) => r.session.id);
  const counts = ids.length
    ? new Map(
        db
          .select({ id: schema.setLog.sessionId, n: sql<number>`count(*)` })
          .from(schema.setLog)
          .where(and(inArray(schema.setLog.sessionId, ids), eq(schema.setLog.isWarmup, 0)))
          .groupBy(schema.setLog.sessionId)
          .all()
          .map((r) => [r.id, Number(r.n)]),
      )
    : new Map<string, number>();
  return rows.map((r) => ({ session: r.session, dayLabel: r.dayLabel, sets: counts.get(r.session.id) ?? 0 }));
}

export interface HistoryRow {
  session: Session;
  dayLabel: string | null;
  sets: number;
  /** Top working set of the lift you searched for — the answer to "what did I do last time". */
  top: { name: string; weight: number; reps: number } | null;
}

/**
 * The row after which to continue — a stable cursor, not an offset.
 *
 * startedAt alone is not unique enough to page on (two sessions can share a
 * timestamp), so the id breaks the tie in the same order the sort does.
 */
export interface HistoryCursor {
  startedAt: string;
  id: string;
}

/** A page of history, plus where the next one starts. `next` is null at the end. */
export interface HistoryPage {
  rows: HistoryRow[];
  next: HistoryCursor | null;
}

/**
 * Past workouts, newest first, narrowed by a lift name and/or a start date.
 *
 * One list and one field rather than a mode switch: people arrive here asking either
 * "what did I do on bench" or "what did I do in March", and being made to pick a
 * search mode first serves neither. When a lift is named, each row carries that
 * lift's top set, because that number is the actual question.
 */
export function searchWorkouts(opts: { text?: string; sinceISO?: string; limit?: number; after?: HistoryCursor | null } = {}): HistoryRow[] {
  return searchWorkoutsPage(opts).rows;
}

/**
 * One page of history, with a cursor for the next.
 *
 * The screen used to ask for 200 rows and print "narrow the search to see older
 * ones" underneath — which, for someone with 250 sessions and no idea what to
 * search for, meant the oldest workouts were simply unreachable (UX-09).
 */
export function searchWorkoutsPage(opts: { text?: string; sinceISO?: string; limit?: number; after?: HistoryCursor | null } = {}): HistoryPage {
  const text = opts.text?.trim() ?? '';
  const limit = opts.limit ?? 40;
  const conds = [isNotNull(schema.session.endedAt)];
  if (opts.sinceISO) conds.push(gte(schema.session.date, opts.sinceISO));
  // Strictly after the cursor in the sort's own order: (startedAt, id) descending.
  if (opts.after) {
    const a = opts.after;
    conds.push(
      sql`(${schema.session.startedAt} < ${a.startedAt} OR (${schema.session.startedAt} = ${a.startedAt} AND ${schema.session.id} < ${a.id}))`,
    );
  }
  if (text) {
    conds.push(
      inArray(
        schema.session.id,
        db
          .select({ id: schema.setLog.sessionId })
          .from(schema.setLog)
          .innerJoin(schema.exercise, eq(schema.exercise.id, schema.setLog.exerciseId))
          .where(like(schema.exercise.name, `%${text}%`)),
      ),
    );
  }

  // One more than asked for, purely to learn whether another page exists.
  const rows = db
    .select({ session: schema.session, dayLabel: schema.routineDay.label })
    .from(schema.session)
    .leftJoin(schema.routineDay, eq(schema.session.routineDayId, schema.routineDay.id))
    .where(and(...conds))
    .orderBy(desc(schema.session.startedAt), desc(schema.session.id))
    .limit(limit + 1)
    .all();

  const more = rows.length > limit;
  if (more) rows.length = limit;
  const last = rows[rows.length - 1];
  const next = more && last ? { startedAt: last.session.startedAt, id: last.session.id } : null;

  const ids = rows.map((r) => r.session.id);
  if (ids.length === 0) return { rows: [], next: null };

  const counts = new Map(
    db
      .select({ id: schema.setLog.sessionId, n: sql<number>`count(*)` })
      .from(schema.setLog)
      .where(and(inArray(schema.setLog.sessionId, ids), eq(schema.setLog.isWarmup, 0)))
      .groupBy(schema.setLog.sessionId)
      .all()
      .map((r) => [r.id, Number(r.n)]),
  );

  const tops = new Map<string, { name: string; weight: number; reps: number }>();
  if (text) {
    // Bare `reps` and `name` come from the row that matched max(weight) — SQLite's
    // documented behaviour with exactly one max() in the query.
    for (const r of db
      .select({
        id: schema.setLog.sessionId,
        name: schema.exercise.name,
        weight: max(schema.setLog.weight),
        reps: schema.setLog.reps,
      })
      .from(schema.setLog)
      .innerJoin(schema.exercise, eq(schema.exercise.id, schema.setLog.exerciseId))
      .where(and(inArray(schema.setLog.sessionId, ids), eq(schema.setLog.isWarmup, 0), like(schema.exercise.name, `%${text}%`)))
      .groupBy(schema.setLog.sessionId)
      .all()) {
      if (r.weight !== null) tops.set(r.id, { name: r.name, weight: Number(r.weight), reps: Number(r.reps) });
    }
  }

  return {
    rows: rows.map((r) => ({
      session: r.session,
      dayLabel: r.dayLabel,
      sets: counts.get(r.session.id) ?? 0,
      top: tops.get(r.session.id) ?? null,
    })),
    next,
  };
}

/* ============================ recommendations =========================== */

const WINDOW_DAYS = 28;

export function buildRecInput(today: string = todayISO()): RecInput | null {
  const routine = getActiveRoutine();
  if (!routine) return null;
  const since = addDays(today, -(WINDOW_DAYS - 1));
  const windowSessions = db
    .select({ id: schema.session.id, status: schema.session.status, rpe: schema.session.sessionRpe })
    .from(schema.session)
    .where(and(gte(schema.session.date, since), isNotNull(schema.session.endedAt)))
    .all();
  const ids = windowSessions.filter((s) => s.status !== 'skipped').map((s) => s.id);
  const listed = ids.length
    ? db
        .select({ exerciseId: schema.sessionExercise.exerciseId, skipped: schema.sessionExercise.skipped, source: schema.sessionExercise.source })
        .from(schema.sessionExercise)
        .where(inArray(schema.sessionExercise.sessionId, ids))
        .all()
    : [];
  const sets = ids.length
    ? db
        .select({ sessionId: schema.setLog.sessionId, exerciseId: schema.setLog.exerciseId, pain: schema.setLog.painFlag })
        .from(schema.setLog)
        .where(and(inArray(schema.setLog.sessionId, ids), eq(schema.setLog.isWarmup, 0)))
        .all()
    : [];

  const exercises: RecExercise[] = [];
  const seen = new Set<string>();
  for (const day of getDays(routine.id)) {
    for (const slot of getSlots(day.id)) {
      if (seen.has(slot.exerciseId)) continue;
      seen.add(slot.exerciseId);
      const series = e1rmSeries(slot.exerciseId, 5).map((p) => p.e1rm);
      const mine = sets.filter((r) => r.exerciseId === slot.exerciseId);
      const onList = listed.filter((r) => r.exerciseId === slot.exerciseId && r.source === 'plan');
      exercises.push({
        exerciseId: slot.exerciseId,
        name: slot.exercise.name,
        primaryMuscle: slot.exercise.primaryMuscles[0] ?? '',
        slotId: slot.id,
        targetSets: slot.targetSets,
        planned: onList.length,
        skipped: onList.filter((r) => r.skipped === 1).length,
        trained: new Set(mine.map((r) => r.sessionId)).size,
        painSessions: new Set(mine.filter((r) => r.pain === 1).map((r) => r.sessionId)).size,
        trend: series.length >= 2 ? slope(series) : 0,
        trendSessions: series.length,
        consecutiveResets: countConsecutiveResets(slot.exerciseId),
      });
    }
  }

  const first = db.select({ date: schema.session.date }).from(schema.session).orderBy(asc(schema.session.date)).limit(1).get();
  const weeks = first ? Math.max(1, Math.min(4, Math.ceil((daysBetweenISO(first.date, today) + 1) / 7))) : 1;
  const rpes = windowSessions.map((s) => s.rpe).filter((x): x is number => x !== null);

  return {
    exercises,
    plannedWeeklySets: plannedWeeklySets(routine.id),
    landmarks: VOLUME_LANDMARKS,
    consistency: {
      weeks,
      daysPerWeek: routine.daysPerWeek,
      done: windowSessions.filter((s) => s.status === 'completed' || s.status === 'partial').length,
      skippedDays: windowSessions.filter((s) => s.status === 'skipped').length,
    },
    avgSessionRpe: rpes.length >= 3 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null,
  };
}

const DISMISSED_KEY = 'rec:dismissed';
/** A dismissed recommendation stays hidden this long, then may come back if still true. */
const DISMISS_DAYS = 14;

function dismissed(): Record<string, string> {
  try {
    const v: unknown = JSON.parse(getRaw(DISMISSED_KEY) ?? '{}');
    return v && typeof v === 'object' ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function dismissRecommendation(id: string): void {
  setRaw(DISMISSED_KEY, JSON.stringify({ ...dismissed(), [id]: todayISO() }));
}

export function undismissRecommendation(id: string): void {
  const d = dismissed();
  delete d[id];
  setRaw(DISMISSED_KEY, JSON.stringify(d));
}

export function activeRecommendations(): Recommendation[] {
  const input = buildRecInput();
  if (!input) return [];
  const d = dismissed();
  const today = todayISO();
  return recommend(input).filter((r) => {
    const at = d[r.id];
    return !at || daysBetweenISO(at, today) >= DISMISS_DAYS;
  });
}

/* ============================ records & insights ======================== */

export interface ExerciseRecords {
  exerciseId: string;
  name: string;
  events: RecordEvent[];
}

/** Personal records set in one session, against every earlier finished session. */
export function sessionRecords(sessionId: string): ExerciseRecords[] {
  const s = db.select().from(schema.session).where(eq(schema.session.id, sessionId)).get();
  if (!s) return [];
  const sets = db
    .select()
    .from(schema.setLog)
    .where(and(eq(schema.setLog.sessionId, sessionId), eq(schema.setLog.isWarmup, 0)))
    .all();
  const out: ExerciseRecords[] = [];
  for (const [exerciseId, current] of groupBy(sets, (x) => x.exerciseId)) {
    const prior = db
      .select({ sessionId: schema.setLog.sessionId, weight: schema.setLog.weight, reps: schema.setLog.reps, e1rm: schema.setLog.e1rm })
      .from(schema.setLog)
      .innerJoin(schema.session, eq(schema.setLog.sessionId, schema.session.id))
      .where(
        and(
          eq(schema.setLog.exerciseId, exerciseId),
          eq(schema.setLog.isWarmup, 0),
          isNotNull(schema.session.endedAt),
          lt(schema.session.startedAt, s.startedAt),
        ),
      )
      .all();
    const events = detectRecords([...groupBy(prior, (p) => p.sessionId).values()], current, CATALOG_BY_ID.get(exerciseId)?.measure === 'time');
    if (events.length) {
      const name = db.select({ name: schema.exercise.name }).from(schema.exercise).where(eq(schema.exercise.id, exerciseId)).get()?.name ?? exerciseId;
      out.push({ exerciseId, name, events });
    }
  }
  return out;
}

/** Workouts where training happened and the day counted (completed or partial). */
export function countFinishedWorkouts(): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.session)
    .where(inArray(schema.session.status, ['completed', 'partial']))
    .get();
  return Number(row?.n ?? 0);
}

/** Primary muscles worked in the last `days` days — for rest-day mobility. */
export function recentMuscles(days = 2): string[] {
  const since = addDays(todayISO(), -(days - 1));
  const rows = db
    .select({ muscles: schema.exercise.primaryMuscles })
    .from(schema.setLog)
    .innerJoin(schema.session, eq(schema.setLog.sessionId, schema.session.id))
    .innerJoin(schema.exercise, eq(schema.setLog.exerciseId, schema.exercise.id))
    .where(and(gte(schema.session.date, since), eq(schema.setLog.isWarmup, 0)))
    .all();
  return [...new Set(rows.flatMap((r) => r.muscles))];
}

/** The last date each primary muscle got a working set, over the last `days` days. */
export function lastTrainedByMuscle(days = 14): Map<string, string> {
  const since = addDays(todayISO(), -(days - 1));
  const rows = db
    .select({ muscles: schema.exercise.primaryMuscles, date: max(schema.session.date) })
    .from(schema.setLog)
    .innerJoin(schema.session, eq(schema.setLog.sessionId, schema.session.id))
    .innerJoin(schema.exercise, eq(schema.setLog.exerciseId, schema.exercise.id))
    .where(and(gte(schema.session.date, since), eq(schema.setLog.isWarmup, 0)))
    .groupBy(schema.setLog.exerciseId)
    .all();
  const out = new Map<string, string>();
  for (const r of rows) {
    if (!r.date) continue;
    for (const m of r.muscles) if (!out.has(m) || (out.get(m) ?? '') < r.date) out.set(m, r.date);
  }
  return out;
}

const REGION_OF: Partial<Record<Pattern, LiftRegion>> = {
  horizontal_push: 'push', vertical_push: 'push', fly: 'push', elbow_extension: 'push',
  horizontal_pull: 'pull', vertical_pull: 'pull', elbow_flexion: 'pull', shrug: 'pull',
  squat: 'legs', lunge: 'legs', hinge: 'legs', hip_extension: 'legs', knee_extension: 'legs', knee_flexion: 'legs', calf: 'legs', hip_abduction: 'legs', hip_adduction: 'legs',
};
const UPPER_MUSCLES = new Set(['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'traps']);
const LOWER_MUSCLES = new Set(['quads', 'hamstrings', 'glutes', 'adductors', 'calves']);

function setsByHalf(from: string, to: string): { upper: number; lower: number } {
  const rows = db
    .select({ muscles: schema.exercise.primaryMuscles, n: sql<number>`count(*)` })
    .from(schema.setLog)
    .innerJoin(schema.session, eq(schema.setLog.sessionId, schema.session.id))
    .innerJoin(schema.exercise, eq(schema.setLog.exerciseId, schema.exercise.id))
    .where(and(gte(schema.session.date, from), lte(schema.session.date, to), isNotNull(schema.session.endedAt), eq(schema.setLog.isWarmup, 0)))
    .groupBy(schema.setLog.exerciseId)
    .all();
  const out = { upper: 0, lower: 0 };
  for (const r of rows) {
    const first = r.muscles[0] ?? '';
    if (UPPER_MUSCLES.has(first)) out.upper += Number(r.n);
    else if (LOWER_MUSCLES.has(first)) out.lower += Number(r.n);
  }
  return out;
}

/** Up to three plain-language statements about the week, from the data alone. */
export function weekInsights(weekStart: string, waterTargetMl: number, proteinTargetG = 0): string[] {
  const end = addDays(weekStart, 6);
  const week = weekSummary(weekStart, waterTargetMl);
  const weekSessions = db
    .select({ session: schema.session, label: schema.routineDay.label })
    .from(schema.session)
    .leftJoin(schema.routineDay, eq(schema.session.routineDayId, schema.routineDay.id))
    .where(and(gte(schema.session.date, weekStart), lte(schema.session.date, end), isNotNull(schema.session.endedAt)))
    .all();
  // A week in which the app recorded nothing has nothing to say about it — the screen
  // shows its own "nothing here yet" line, and a fresh install must not be lectured.
  const used =
    weekSessions.length > 0 || week.water.daysLogged > 0 || week.measurements.length > 0 || week.bodyweight.end !== null;
  if (!used) return [];
  const records = weekSessions.filter((w) => w.session.status !== 'skipped').reduce((n, w) => n + sessionRecords(w.session.id).length, 0);
  const facts: WeekFacts = {
    planned: week.plannedDays,
    done: week.completed + week.partial,
    skipped: week.skipped,
    sets: setsByHalf(weekStart, end),
    prevSets: setsByHalf(addDays(weekStart, -7), addDays(weekStart, -1)),
    lifts: week.lifts.map((l) => ({
      name: l.name,
      region: REGION_OF[CATALOG_BY_ID.get(l.exerciseId)?.pattern ?? 'core_stability'] ?? 'other',
      e1rmDelta: l.prevBestE1rm === null ? null : l.bestE1rm - l.prevBestE1rm,
    })),
    records,
    bodyweightChange: week.bodyweight.start !== null && week.bodyweight.end !== null ? week.bodyweight.end - week.bodyweight.start : null,
    goal: getSettings().phase,
    water: { hit: week.water.daysHit, days: week.water.days, logged: week.water.daysLogged },
    skippedLabels: weekSessions.filter((w) => w.session.status === 'skipped').map((w) => w.label ?? 'a workout'),
    nutrition: nutritionWeek(weekStart, end, proteinTargetG),
  };
  return weeklyInsights(facts);
}

/** Food logging for one week, or null when nothing was ever logged. */
function nutritionWeek(weekStart: string, end: string, targetProteinG: number): WeekFacts['nutrition'] {
  const days = intakeBetween(weekStart, end);
  if (days.length === 0) return null;
  return {
    daysLogged: days.length,
    days: 7,
    avgProteinG: days.reduce((a, d) => a + (d.proteinG ?? 0), 0) / days.length,
    targetProteinG,
  };
}
