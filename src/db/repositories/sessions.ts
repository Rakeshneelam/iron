/**
 * Sessions and sets — the hot path. Every write here is synchronous and committed
 * before it returns (AGENTS.md §1.3): the app can be killed the instant after a tap.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import * as schema from '@/db/schema';
import { e1RM, type SessionLog } from '@/engine/progression';
import { nowISO, todayISO } from '@/lib/date';
import { newId } from '@/lib/ids';

import { getExercise, getLinkedSources, type Exercise } from './exercises';
import { groupBy, parseIdList, toEngineSet } from './mappers';
import { getSlots, type RoutineSlot } from './program';
import { deleteRaw, getRaw, setRaw } from './settings';
import { writeSessionStats } from './stats';

export type Session = typeof schema.session.$inferSelect;
export type SetRow = typeof schema.setLog.$inferSelect;

/* ============================ lifecycle ================================= */

export function getActiveSession(): Session | undefined {
  return db.select().from(schema.session).where(isNull(schema.session.endedAt)).orderBy(desc(schema.session.startedAt)).limit(1).get();
}

export function getSession(id: string): Session | undefined {
  return db.select().from(schema.session).where(eq(schema.session.id, id)).get();
}

/** Never two open sessions: an unfinished one is resumed rather than duplicated. */
export function startSession(routineDayId: string | null): Session {
  const open = getActiveSession();
  if (open) return open;
  const row: Session = {
    id: newId(),
    routineDayId,
    date: todayISO(),
    startedAt: nowISO(),
    endedAt: null,
    bodyweightKg: null,
    sleepHours: null,
    soreness: null,
    stress: null,
    sessionRpe: null,
    notes: null,
  };
  db.insert(schema.session).values(row).run();
  return row;
}

const rawKeys = (id: string) => [`session:${id}:adhoc`, `session:${id}:skipped`, `session:${id}:order`, `session:${id}:readinessDone`];

/**
 * Close the session and precompute per-exercise stats (ticket 3.5).
 * A session with no working sets is discarded rather than kept as an empty row —
 * otherwise opening and closing a workout would advance the routine cycle.
 */
export function endSession(sessionId: string): { discarded: boolean } {
  const hasWork = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.setLog)
    .where(and(eq(schema.setLog.sessionId, sessionId), eq(schema.setLog.isWarmup, 0)))
    .get();
  if (Number(hasWork?.n ?? 0) === 0) {
    abandonSession(sessionId);
    return { discarded: true };
  }
  db.transaction((tx) => {
    tx.update(schema.session).set({ endedAt: nowISO() }).where(eq(schema.session.id, sessionId)).run();
    tx.delete(schema.timerState).run();
    writeSessionStats(sessionId);
  });
  for (const k of rawKeys(sessionId)) deleteRaw(k);
  return { discarded: false };
}

export function abandonSession(sessionId: string): void {
  db.transaction((tx) => {
    tx.delete(schema.timerState).run();
    tx.delete(schema.session).where(eq(schema.session.id, sessionId)).run();
  });
  for (const k of rawKeys(sessionId)) deleteRaw(k);
}

export function setReadiness(
  sessionId: string,
  r: { bodyweightKg?: number; sleepHours?: number; soreness?: number; stress?: number },
): void {
  const patch: Partial<Session> = {};
  if (r.bodyweightKg !== undefined) patch.bodyweightKg = r.bodyweightKg;
  if (r.sleepHours !== undefined) patch.sleepHours = r.sleepHours;
  if (r.soreness !== undefined) patch.soreness = r.soreness;
  if (r.stress !== undefined) patch.stress = r.stress;
  if (Object.keys(patch).length) db.update(schema.session).set(patch).where(eq(schema.session.id, sessionId)).run();
  markReadinessDone(sessionId);
}

export function markReadinessDone(sessionId: string): void {
  setRaw(`session:${sessionId}:readinessDone`, 'true');
}

export function isReadinessDone(sessionId: string): boolean {
  return getRaw(`session:${sessionId}:readinessDone`) === 'true';
}

export function setSessionNotes(sessionId: string, notes: string): void {
  db.update(schema.session).set({ notes }).where(eq(schema.session.id, sessionId)).run();
}

/* =============================== sets =================================== */

export function insertSet(input: {
  sessionId: string;
  exerciseId: string;
  weight: number;
  reps: number;
  rir: number;
  isWarmup?: boolean;
  painFlag?: boolean;
  wasOverride?: boolean;
  restTakenSeconds?: number;
}): SetRow {
  const next = db
    .select({ n: sql<number>`coalesce(max(${schema.setLog.setIndex}), -1)` })
    .from(schema.setLog)
    .where(and(eq(schema.setLog.sessionId, input.sessionId), eq(schema.setLog.exerciseId, input.exerciseId)))
    .get();
  const row: SetRow = {
    id: newId(),
    sessionId: input.sessionId,
    exerciseId: input.exerciseId,
    setIndex: Number(next?.n ?? -1) + 1,
    weight: input.weight,
    reps: input.reps,
    rir: input.rir,
    isWarmup: input.isWarmup ? 1 : 0,
    painFlag: input.painFlag ? 1 : 0,
    restTakenSeconds: input.restTakenSeconds ?? null,
    loggedAt: nowISO(),
    // Denormalised at insert (docs/03): charts and trends never recompute it.
    e1rm: e1RM(input.weight, input.reps, input.rir),
    wasOverride: input.wasOverride ? 1 : 0,
  };
  db.insert(schema.setLog).values(row).run();
  return row;
}

export function updateSet(
  id: string,
  patch: Partial<{ weight: number; reps: number; rir: number; painFlag: boolean; isWarmup: boolean }>,
): void {
  const cur = db.select().from(schema.setLog).where(eq(schema.setLog.id, id)).get();
  if (!cur) return;
  const weight = patch.weight ?? cur.weight;
  const reps = patch.reps ?? cur.reps;
  const rir = patch.rir ?? cur.rir;
  db.update(schema.setLog)
    .set({
      weight,
      reps,
      rir,
      painFlag: patch.painFlag === undefined ? cur.painFlag : patch.painFlag ? 1 : 0,
      isWarmup: patch.isWarmup === undefined ? cur.isWarmup : patch.isWarmup ? 1 : 0,
      e1rm: e1RM(weight, reps, rir),
    })
    .where(eq(schema.setLog.id, id))
    .run();
}

export function deleteSet(id: string): void {
  db.delete(schema.setLog).where(eq(schema.setLog.id, id)).run();
}

export function getSessionSets(sessionId: string): SetRow[] {
  return db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, sessionId)).orderBy(asc(schema.setLog.loggedAt)).all();
}

export function getSetsFor(sessionId: string, exerciseId: string): SetRow[] {
  return db
    .select()
    .from(schema.setLog)
    .where(and(eq(schema.setLog.sessionId, sessionId), eq(schema.setLog.exerciseId, exerciseId)))
    .orderBy(asc(schema.setLog.setIndex))
    .all();
}

/* ============================== history ================================= */

/**
 * Engine-shaped history, newest session first, from finished sessions only.
 * Follows exercise_link: sets from a swapped-out variation come along with their
 * weights scaled by the link ratio, so a swap never resets progression to zero.
 */
export function getExerciseHistory(exerciseId: string, limit = 8): SessionLog[] {
  const ratios = new Map<string, number>([[exerciseId, 1]]);
  for (const src of getLinkedSources(exerciseId)) ratios.set(src.fromExerciseId, src.ratio);

  const rows = db
    .select({ set: schema.setLog, date: schema.session.date })
    .from(schema.setLog)
    .innerJoin(schema.session, eq(schema.setLog.sessionId, schema.session.id))
    .where(and(inArray(schema.setLog.exerciseId, [...ratios.keys()]), isNotNull(schema.session.endedAt)))
    .orderBy(desc(schema.setLog.loggedAt))
    .limit(limit * 40)
    .all();

  const bySession = groupBy(rows, (r) => r.set.sessionId);
  const out: SessionLog[] = [];
  for (const [sessionId, group] of bySession) {
    if (out.length >= limit) break;
    const first = group[0];
    if (!first) continue;
    const sets = [...group]
      .sort((a, b) => a.set.loggedAt.localeCompare(b.set.loggedAt))
      .map((r) => toEngineSet(r.set, ratios.get(r.set.exerciseId) ?? 1));
    out.push({ sessionId, date: first.date, exerciseId, sets });
  }
  return out;
}

/** What he did last time on exactly this exercise, excluding the current session. */
export function getLastPerformance(exerciseId: string, excludeSessionId?: string): { date: string; sets: SetRow[] } | undefined {
  const where = excludeSessionId
    ? and(eq(schema.setLog.exerciseId, exerciseId), ne(schema.setLog.sessionId, excludeSessionId))
    : eq(schema.setLog.exerciseId, exerciseId);
  const latest = db
    .select({ sessionId: schema.setLog.sessionId, date: schema.session.date })
    .from(schema.setLog)
    .innerJoin(schema.session, eq(schema.setLog.sessionId, schema.session.id))
    .where(where)
    .orderBy(desc(schema.setLog.loggedAt))
    .limit(1)
    .get();
  if (!latest) return undefined;
  return { date: latest.date, sets: getSetsFor(latest.sessionId, exerciseId) };
}

export function listSessions(limit = 20): Session[] {
  return db.select().from(schema.session).where(isNotNull(schema.session.endedAt)).orderBy(desc(schema.session.startedAt)).limit(limit).all();
}

export interface SessionSummary {
  session: Session;
  totalTonnage: number;
  hardSets: number;
  durationMin: number;
  perExercise: {
    exerciseId: string;
    name: string;
    bestE1rm: number;
    prevBestE1rm: number | null;
    isPR: boolean;
    tonnage: number;
    sets: number;
  }[];
}

/** Volume, per-lift change vs last time, e1RM highs. No streaks, no celebration. */
export function getSessionSummary(sessionId: string): SessionSummary | undefined {
  const session = getSession(sessionId);
  if (!session) return undefined;
  const sets = getSessionSets(sessionId);
  const perExercise: SessionSummary['perExercise'] = [];
  let totalTonnage = 0;
  let hardSets = 0;

  for (const [exerciseId, group] of groupBy(sets, (s) => s.exerciseId)) {
    const work = group.filter((s) => s.isWarmup === 0);
    if (work.length === 0) continue;
    const tonnage = work.reduce((t, s) => t + s.weight * s.reps, 0);
    const best = Math.max(...work.map((s) => s.e1rm));
    const prev = db
      .select({ best: schema.exerciseSessionStat.bestE1rm })
      .from(schema.exerciseSessionStat)
      .where(and(eq(schema.exerciseSessionStat.exerciseId, exerciseId), ne(schema.exerciseSessionStat.sessionId, sessionId)))
      .orderBy(desc(schema.exerciseSessionStat.date))
      .limit(1)
      .get();
    const allTime = db
      .select({ best: sql<number | null>`max(${schema.exerciseSessionStat.bestE1rm})` })
      .from(schema.exerciseSessionStat)
      .where(and(eq(schema.exerciseSessionStat.exerciseId, exerciseId), ne(schema.exerciseSessionStat.sessionId, sessionId)))
      .get();
    const allTimeBest = allTime?.best == null ? null : Number(allTime.best);
    totalTonnage += tonnage;
    hardSets += work.length;
    perExercise.push({
      exerciseId,
      name: getExercise(exerciseId)?.name ?? exerciseId,
      bestE1rm: best,
      prevBestE1rm: prev?.best ?? null,
      isPR: allTimeBest !== null && best > allTimeBest + 0.05,
      tonnage,
      sets: work.length,
    });
  }

  const end = session.endedAt ? Date.parse(session.endedAt) : Date.now();
  const durationMin = Math.max(0, Math.round((end - Date.parse(session.startedAt)) / 60_000));
  return { session, totalTonnage, hardSets, durationMin, perExercise };
}

/* ======================= plan, ad-hoc, skip, order ====================== */

export function addAdHocExercise(sessionId: string, exerciseId: string): void {
  const ids = getAdHocExercises(sessionId);
  if (!ids.includes(exerciseId)) setRaw(`session:${sessionId}:adhoc`, JSON.stringify([...ids, exerciseId]));
  unskipExercise(sessionId, exerciseId);
}

export function getAdHocExercises(sessionId: string): string[] {
  return parseIdList(getRaw(`session:${sessionId}:adhoc`));
}

/** Skipping is never failure — it is just not today. */
export function skipExercise(sessionId: string, exerciseId: string): void {
  const ids = getSkipped(sessionId);
  if (!ids.includes(exerciseId)) setRaw(`session:${sessionId}:skipped`, JSON.stringify([...ids, exerciseId]));
}

export function unskipExercise(sessionId: string, exerciseId: string): void {
  const ids = getSkipped(sessionId).filter((id) => id !== exerciseId);
  setRaw(`session:${sessionId}:skipped`, JSON.stringify(ids));
}

export function getSkipped(sessionId: string): string[] {
  return parseIdList(getRaw(`session:${sessionId}:skipped`));
}

export function setSessionOrder(sessionId: string, exerciseIds: string[]): void {
  setRaw(`session:${sessionId}:order`, JSON.stringify(exerciseIds));
}

export interface PlannedExercise {
  exerciseId: string;
  exercise: Exercise;
  slot: RoutineSlot | null;
  adHoc: boolean;
  skipped: boolean;
}

/**
 * Everything on today's list: the day's slots, then ad-hoc additions, then anything
 * logged that is in neither (e.g. after a mid-session swap). Honours a saved order.
 */
export function getSessionPlan(sessionId: string): PlannedExercise[] {
  const session = getSession(sessionId);
  if (!session) return [];
  const skipped = new Set(getSkipped(sessionId));
  const out: PlannedExercise[] = [];
  const seen = new Set<string>();

  if (session.routineDayId) {
    for (const s of getSlots(session.routineDayId)) {
      if (seen.has(s.exerciseId)) continue;
      seen.add(s.exerciseId);
      const { exercise, ...slot } = s;
      out.push({ exerciseId: s.exerciseId, exercise, slot, adHoc: false, skipped: skipped.has(s.exerciseId) });
    }
  }
  const logged = [...new Set(getSessionSets(sessionId).map((s) => s.exerciseId))];
  for (const id of [...getAdHocExercises(sessionId), ...logged]) {
    if (seen.has(id)) continue;
    const exercise = getExercise(id);
    if (!exercise) continue;
    seen.add(id);
    out.push({ exerciseId: id, exercise, slot: null, adHoc: true, skipped: skipped.has(id) });
  }

  const order = parseIdList(getRaw(`session:${sessionId}:order`));
  if (order.length) {
    const rank = new Map(order.map((id, i) => [id, i]));
    out.sort((a, b) => (rank.get(a.exerciseId) ?? 1e6) - (rank.get(b.exerciseId) ?? 1e6));
  }
  return out;
}
