/**
 * Sessions and sets — the hot path. Every write here is synchronous and committed
 * before it returns (AGENTS.md §1.3): the app can be killed the instant after a tap.
 *
 * A workout's exercise list lives in `session_exercise`, snapshotted from the plan
 * at start. Skips, additions, swaps and order are "today only" and never touch the
 * plan; the snapshot keeps planned targets so history can show planned vs done.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import * as schema from '@/db/schema';
import type { SessionStatus } from '@/db/schema';
import { e1RM, type SessionLog } from '@/engine/progression';
import { nowISO, todayISO } from '@/lib/date';
import { newId } from '@/lib/ids';

import { getExercise, getLinkedSources, type Exercise } from './exercises';
import { groupBy, parseIdList, toEngineSet } from './mappers';
import { getSlots, type Targets } from './program';
import { deleteRaw, getRaw, setRaw } from './settings';
import { writeSessionStats } from './stats';

export type Session = typeof schema.session.$inferSelect;
export type SetRow = typeof schema.setLog.$inferSelect;
export type SessionExerciseRow = typeof schema.sessionExercise.$inferSelect;
export type { SessionStatus };

/** The plan's day counts as done — these advance the routine cycle. */
export const DAY_DONE: readonly SessionStatus[] = ['completed', 'partial', 'skipped'];
/** Training actually happened (sets exist). */
export const TRAINED: readonly SessionStatus[] = ['completed', 'partial', 'cancelled'];

/* ============================ lifecycle ================================= */

export function getActiveSession(): Session | undefined {
  return db.select().from(schema.session).where(isNull(schema.session.endedAt)).orderBy(desc(schema.session.startedAt)).limit(1).get();
}

export function getSession(id: string): Session | undefined {
  return db.select().from(schema.session).where(eq(schema.session.id, id)).get();
}

function planRows(sessionId: string, routineDayId: string): SessionExerciseRow[] {
  const out: SessionExerciseRow[] = [];
  const seen = new Set<string>();
  for (const s of getSlots(routineDayId)) {
    if (seen.has(s.exerciseId)) continue;
    seen.add(s.exerciseId);
    out.push({
      sessionId,
      exerciseId: s.exerciseId,
      position: out.length,
      source: 'plan',
      skipped: 0,
      targetSets: s.targetSets,
      repLo: s.repLo,
      repHi: s.repHi,
      targetRir: s.targetRir,
      restSeconds: s.restSeconds,
      supersetGroup: s.supersetGroup,
      startWeight: s.startWeight,
    });
  }
  return out;
}

/**
 * Never two open sessions: an unfinished one is resumed rather than duplicated.
 * `fit` (from a shortened workout) sets the sets per exercise; planned exercises
 * left out of it are kept on the list as skipped, so history shows what was cut.
 */
export function startSession(routineDayId: string | null, opts: { fit?: readonly { exerciseId: string; sets: number }[] } = {}): Session {
  const open = getActiveSession();
  if (open) return open;
  const row: Session = {
    id: newId(),
    routineDayId,
    date: todayISO(),
    startedAt: nowISO(),
    endedAt: null,
    status: 'active',
    bodyweightKg: null,
    sleepHours: null,
    soreness: null,
    stress: null,
    sessionRpe: null,
    notes: null,
  };
  db.transaction(() => {
    db.insert(schema.session).values(row).run();
    const rows = routineDayId ? planRows(row.id, routineDayId) : [];
    if (opts.fit) {
      const sets = new Map(opts.fit.map((f) => [f.exerciseId, f.sets]));
      for (const r of rows) {
        const n = sets.get(r.exerciseId);
        if (n === undefined) r.skipped = 1;
        else r.targetSets = n;
      }
    }
    if (rows.length) db.insert(schema.sessionExercise).values(rows).run();
  });
  return row;
}

/** Records a deliberately skipped plan day: no sets, advances the cycle. Undo = deleteSession. */
export function skipDay(routineDayId: string): string {
  const now = nowISO();
  const id = newId();
  db.insert(schema.session)
    .values({ id, routineDayId, date: todayISO(), startedAt: now, endedAt: now, status: 'skipped' })
    .run();
  return id;
}

const rawKeys = (id: string) => [`session:${id}:adhoc`, `session:${id}:skipped`, `session:${id}:order`, `session:${id}:readinessDone`, `session:${id}:warmup`];

export type WarmupState = 'pending' | 'done' | 'skipped';

/** Whether the session warm-up was done — the first big lift gets an extra ramp set if not. */
export function getWarmupState(sessionId: string): WarmupState {
  const v = getRaw(`session:${sessionId}:warmup`);
  return v === 'done' || v === 'skipped' ? v : 'pending';
}

export function setWarmupState(sessionId: string, state: WarmupState): void {
  if (state === 'pending') deleteRaw(`session:${sessionId}:warmup`);
  else setRaw(`session:${sessionId}:warmup`, state);
}

function workingSetCount(sessionId: string): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.setLog)
    .where(and(eq(schema.setLog.sessionId, sessionId), eq(schema.setLog.isWarmup, 0)))
    .get();
  return Number(row?.n ?? 0);
}

function close(sessionId: string, status: SessionStatus): void {
  db.transaction(() => {
    db.update(schema.session).set({ endedAt: nowISO(), status }).where(eq(schema.session.id, sessionId)).run();
    db.delete(schema.timerState).run();
    writeSessionStats(sessionId);
  });
  for (const k of rawKeys(sessionId)) deleteRaw(k);
}

/**
 * Finish: `completed` when every planned exercise hit its target sets, else `partial`.
 * A workout with no working sets is discarded — opening and closing one by accident
 * must never advance the routine or leave an empty row in history.
 */
export function finishSession(sessionId: string): { discarded: boolean; status: SessionStatus | null } {
  if (workingSetCount(sessionId) === 0) {
    deleteSession(sessionId);
    return { discarded: true, status: null };
  }
  const p = planProgress(sessionId);
  const status: SessionStatus = p.done === p.planned ? 'completed' : 'partial';
  close(sessionId, status);
  return { discarded: false, status };
}

/**
 * Cancel: never counts as done and never advances the cycle. With `keepSets` the
 * sets stay in history (they really happened) under status `cancelled`; otherwise
 * the whole workout is deleted.
 */
export function cancelSession(sessionId: string, keepSets: boolean): void {
  if (keepSets && workingSetCount(sessionId) > 0) close(sessionId, 'cancelled');
  else deleteSession(sessionId);
}

/** Removes a session and everything hanging off it (sets, stats, exercise list). */
export function deleteSession(sessionId: string): void {
  db.transaction(() => {
    db.delete(schema.timerState).where(eq(schema.timerState.sessionId, sessionId)).run();
    db.delete(schema.session).where(eq(schema.session.id, sessionId)).run();
  });
  for (const k of rawKeys(sessionId)) deleteRaw(k);
}

/** Undo for an accidental Finish/Cancel. Refuses while another workout is open. */
export function reopenSession(sessionId: string): boolean {
  const open = getActiveSession();
  if (open && open.id !== sessionId) return false;
  const s = getSession(sessionId);
  if (!s || s.status === 'skipped') return false;
  db.transaction(() => {
    db.update(schema.session).set({ endedAt: null, status: 'active' }).where(eq(schema.session.id, sessionId)).run();
    db.delete(schema.exerciseSessionStat).where(eq(schema.exerciseSessionStat.sessionId, sessionId)).run();
  });
  return true;
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
  db.insert(schema.setting)
    .values({ key: `session:${sessionId}:readinessDone`, value: 'true' })
    .onConflictDoNothing()
    .run();
}

export function isReadinessDone(sessionId: string): boolean {
  return getRaw(`session:${sessionId}:readinessDone`) === 'true';
}

/** Post-workout feedback: effort (session RPE 1–10) and free-text notes. */
export function setSessionFeedback(sessionId: string, patch: { sessionRpe?: number | null; notes?: string | null }): void {
  db.update(schema.session).set(patch).where(eq(schema.session.id, sessionId)).run();
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

/** Undo for a deleted set: puts the exact row back. */
export function restoreSet(row: SetRow): void {
  db.insert(schema.setLog).values(row).onConflictDoNothing().run();
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

/** What was done last time on exactly this exercise, excluding the current session. */
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

/** Finished sessions, newest first. Defaults to ones where training happened. */
export function listSessions(limit = 20, statuses: readonly SessionStatus[] = TRAINED): Session[] {
  return db
    .select()
    .from(schema.session)
    .where(and(isNotNull(schema.session.endedAt), inArray(schema.session.status, [...statuses])))
    .orderBy(desc(schema.session.startedAt))
    .limit(limit)
    .all();
}

export interface SessionSummary {
  session: Session;
  totalTonnage: number;
  hardSets: number;
  totalReps: number;
  durationMin: number;
  progress: PlanProgress;
  perExercise: {
    exerciseId: string;
    name: string;
    bestE1rm: number;
    prevBestE1rm: number | null;
    isPR: boolean;
    tonnage: number;
    sets: number;
    topSet: string;
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
  let totalReps = 0;

  for (const [exerciseId, group] of groupBy(sets, (s) => s.exerciseId)) {
    const work = group.filter((s) => s.isWarmup === 0);
    if (work.length === 0) continue;
    const tonnage = work.reduce((t, s) => t + s.weight * s.reps, 0);
    const best = Math.max(...work.map((s) => s.e1rm));
    const top = work.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a));
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
    totalReps += work.reduce((t, s) => t + s.reps, 0);
    perExercise.push({
      exerciseId,
      name: getExercise(exerciseId)?.name ?? exerciseId,
      bestE1rm: best,
      prevBestE1rm: prev?.best ?? null,
      isPR: allTimeBest !== null && best > allTimeBest + 0.05,
      tonnage,
      sets: work.length,
      topSet: `${top.weight}×${top.reps}`,
    });
  }

  const end = session.endedAt ? Date.parse(session.endedAt) : Date.now();
  const durationMin = Math.max(0, Math.round((end - Date.parse(session.startedAt)) / 60_000));
  return { session, totalTonnage, hardSets, totalReps, durationMin, progress: planProgress(sessionId), perExercise };
}

/* ===================== the workout's exercise list ====================== */

export interface PlannedExercise {
  exerciseId: string;
  exercise: Exercise;
  /** Planned targets, or null for an exercise added during the workout. */
  slot: Targets | null;
  adHoc: boolean;
  skipped: boolean;
}

function targetsOf(r: SessionExerciseRow): Targets | null {
  if (r.targetSets === null) return null;
  return {
    targetSets: r.targetSets,
    repLo: r.repLo ?? 8,
    repHi: r.repHi ?? 12,
    targetRir: r.targetRir ?? 1,
    restSeconds: r.restSeconds ?? 120,
    supersetGroup: r.supersetGroup,
    startWeight: r.startWeight,
  };
}

/** The list, in order, plus anything logged that is no longer on it (e.g. after a swap). */
export function getSessionPlan(sessionId: string): PlannedExercise[] {
  const rows = db
    .select({ se: schema.sessionExercise, exercise: schema.exercise })
    .from(schema.sessionExercise)
    .innerJoin(schema.exercise, eq(schema.sessionExercise.exerciseId, schema.exercise.id))
    .where(eq(schema.sessionExercise.sessionId, sessionId))
    .orderBy(asc(schema.sessionExercise.position))
    .all();
  const out: PlannedExercise[] = rows.map(({ se, exercise }) => ({
    exerciseId: se.exerciseId,
    exercise,
    slot: targetsOf(se),
    adHoc: se.source === 'added',
    skipped: se.skipped === 1,
  }));
  const seen = new Set(out.map((p) => p.exerciseId));
  for (const s of getSessionSets(sessionId)) {
    if (seen.has(s.exerciseId)) continue;
    seen.add(s.exerciseId);
    const exercise = getExercise(s.exerciseId);
    if (exercise) out.push({ exerciseId: s.exerciseId, exercise, slot: null, adHoc: true, skipped: false });
  }
  return out;
}

export interface PlanProgress {
  /** Exercises that came from the plan. */
  planned: number;
  /** Planned exercises that reached their target sets. */
  done: number;
  skipped: number;
}

export function planProgress(sessionId: string): PlanProgress {
  const plan = getSessionPlan(sessionId).filter((p) => !p.adHoc);
  const counts = new Map<string, number>();
  for (const s of getSessionSets(sessionId)) if (s.isWarmup === 0) counts.set(s.exerciseId, (counts.get(s.exerciseId) ?? 0) + 1);
  return {
    planned: plan.length,
    done: plan.filter((p) => !p.skipped && (counts.get(p.exerciseId) ?? 0) >= (p.slot?.targetSets ?? 1)).length,
    skipped: plan.filter((p) => p.skipped).length,
  };
}

const seKey = (sessionId: string, exerciseId: string) =>
  and(eq(schema.sessionExercise.sessionId, sessionId), eq(schema.sessionExercise.exerciseId, exerciseId));

function getRow(sessionId: string, exerciseId: string): SessionExerciseRow | undefined {
  return db.select().from(schema.sessionExercise).where(seKey(sessionId, exerciseId)).get();
}

function nextPosition(sessionId: string): number {
  const row = db
    .select({ n: sql<number>`coalesce(max(${schema.sessionExercise.position}), -1)` })
    .from(schema.sessionExercise)
    .where(eq(schema.sessionExercise.sessionId, sessionId))
    .get();
  return Number(row?.n ?? -1) + 1;
}

/** Adds to today's list only. Re-adding a skipped one just un-skips it. */
export function addSessionExercise(sessionId: string, exerciseId: string): void {
  if (getRow(sessionId, exerciseId)) {
    unskipExercise(sessionId, exerciseId);
    return;
  }
  db.insert(schema.sessionExercise)
    .values({ sessionId, exerciseId, position: nextPosition(sessionId), source: 'added', skipped: 0 })
    .run();
}

export interface RemovedExercise {
  row: SessionExerciseRow | undefined;
  sets: SetRow[];
}

/** Takes an exercise off today's list together with its sets. Returns what undo needs. */
export function removeSessionExercise(sessionId: string, exerciseId: string): RemovedExercise {
  const removed = { row: getRow(sessionId, exerciseId), sets: getSetsFor(sessionId, exerciseId) };
  db.transaction(() => {
    db.delete(schema.setLog).where(and(eq(schema.setLog.sessionId, sessionId), eq(schema.setLog.exerciseId, exerciseId))).run();
    db.delete(schema.sessionExercise).where(seKey(sessionId, exerciseId)).run();
  });
  return removed;
}

export function restoreSessionExercise(r: RemovedExercise): void {
  db.transaction(() => {
    if (r.row) db.insert(schema.sessionExercise).values(r.row).onConflictDoNothing().run();
    for (const s of r.sets) db.insert(schema.setLog).values(s).onConflictDoNothing().run();
  });
}

/** Skipping is never failure — it is just not today. */
export function skipExercise(sessionId: string, exerciseId: string): void {
  db.update(schema.sessionExercise).set({ skipped: 1 }).where(seKey(sessionId, exerciseId)).run();
}

export function unskipExercise(sessionId: string, exerciseId: string): void {
  db.update(schema.sessionExercise).set({ skipped: 0 }).where(seKey(sessionId, exerciseId)).run();
}

/**
 * Today-only swap (machine taken, tweaked shoulder). The planned targets move to the
 * new exercise; sets already logged on the old one stay and still show on the list.
 */
export function swapSessionExercise(sessionId: string, fromId: string, toId: string): void {
  if (fromId === toId || getRow(sessionId, toId)) return;
  if (getRow(sessionId, fromId)) {
    db.update(schema.sessionExercise).set({ exerciseId: toId, skipped: 0 }).where(seKey(sessionId, fromId)).run();
  } else {
    addSessionExercise(sessionId, toId);
  }
}

/** Persists an explicit order. Exercises only known from logged sets get a row here. */
export function setSessionOrder(sessionId: string, exerciseIds: string[]): void {
  db.transaction(() => {
    exerciseIds.forEach((exerciseId, position) => {
      db.insert(schema.sessionExercise)
        .values({ sessionId, exerciseId, position, source: 'added', skipped: 0 })
        .onConflictDoUpdate({ target: [schema.sessionExercise.sessionId, schema.sessionExercise.exerciseId], set: { position } })
        .run();
    });
  });
}

/**
 * One-off upgrade: workouts left open by the previous version kept their list in
 * settings keys (adhoc / skipped / order). Rebuild those as session_exercise rows.
 */
export function migrateLegacySessionPlans(): void {
  const open = db.select().from(schema.session).where(isNull(schema.session.endedAt)).all();
  for (const s of open) {
    const has = db.select({ n: sql<number>`count(*)` }).from(schema.sessionExercise).where(eq(schema.sessionExercise.sessionId, s.id)).get();
    if (Number(has?.n ?? 0) > 0) continue;
    const rows = s.routineDayId ? planRows(s.id, s.routineDayId) : [];
    const skipped = new Set(parseIdList(getRaw(`session:${s.id}:skipped`)));
    for (const exerciseId of parseIdList(getRaw(`session:${s.id}:adhoc`))) {
      if (rows.some((r) => r.exerciseId === exerciseId) || !getExercise(exerciseId)) continue;
      rows.push({ sessionId: s.id, exerciseId, position: rows.length, source: 'added', skipped: 0, targetSets: null, repLo: null, repHi: null, targetRir: null, restSeconds: null, supersetGroup: null, startWeight: null });
    }
    const order = parseIdList(getRaw(`session:${s.id}:order`));
    const rank = new Map(order.map((id, i) => [id, i]));
    rows.sort((a, b) => (rank.get(a.exerciseId) ?? 1e6 + a.position) - (rank.get(b.exerciseId) ?? 1e6 + b.position));
    rows.forEach((r, i) => {
      r.position = i;
      r.skipped = skipped.has(r.exerciseId) ? 1 : 0;
    });
    if (rows.length) db.insert(schema.sessionExercise).values(rows).onConflictDoNothing().run();
  }
}
