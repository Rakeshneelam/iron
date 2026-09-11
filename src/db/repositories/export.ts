/**
 * AI-friendly export: one self-describing JSON document with a stable schema, built
 * for a coach, a spreadsheet or another AI model to read without knowing this app.
 * Assembled here because repositories are the only layer that reads tables
 * (docs/02); services/export.ts only writes files.
 */
import { asc, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import * as schema from '@/db/schema';
import { weightTrend } from '@/engine/metabolic';
import { CATALOG_BY_ID, categoryOf } from '@/data/catalog';
import { siteDef } from '@/features/body/sites';
import { fmtClockOfDay } from '@/features/settings/time';
import { addDays, todayISO, weekStartISO } from '@/lib/date';

import { intakeBetween } from './food';
import { groupBy } from './mappers';
import { sessionRecords, weekSummary } from './progress';
import { getSettings } from './settings';

export const EXPORT_SCHEMA = 'iron.export';
export const EXPORT_SCHEMA_VERSION = 3;
const MAX_WEEKS = 26;

const r1 = (n: number) => Math.round(n * 10) / 10;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const README = {
  about: 'Training log exported from Iron, a local-first strength-training app. One person, one phone.',
  howToRead: [
    'workouts[] lists every workout, oldest first.',
    'workouts[].status: completed = every planned exercise reached its target sets; partial = finished with some planned work missing or skipped; cancelled = stopped early, logged sets kept, does NOT count as done; skipped = the planned day was skipped on purpose (no sets); active = still in progress.',
    'workouts[].exercises[].planned is the plan as it was on that day (null for exercises added mid-workout, and for workouts logged before schema v2). source: plan | added | logged (logged = sets exist but it was removed or swapped off the list).',
    'workouts[].exercises[].status: done | partial | not_started | skipped.',
    'rir = reps in reserve (0 = failure). e1rmKg = estimated one-rep max from weight, reps and RIR. Warm-up sets (warmup: true) are excluded from every total.',
    'plans[].days run as a repeating cycle in order, not on fixed weekdays; workoutsPerWeek is the intended frequency.',
    'bodyweight[].trendKg is an exponentially smoothed trend — use it, not single days, to judge change.',
    'hydration.days[] are compared against the CURRENT target; the target moves with bodyweight and training.',
    'Workouts recorded before schema v2 default to status completed.',
    'Timed exercises (measure: "time") store seconds in the reps field. Band exercises store the band level in weightKg.',
    'workouts[].records lists personal records set in that workout (weight, reps at a weight, estimated 1RM, session volume).',
  ],
};

const UNITS = { weight: 'kg', length: 'cm', bodyFat: '%', water: 'ml', energy: 'kcal', protein: 'g', duration: 'min', rest: 's' };

export function buildAIExport(opts: { appVersion: string; hydrationTargetMl: number }) {
  const settings = getSettings();
  const today = todayISO();

  const exercises = db.select().from(schema.exercise).all();
  const exById = new Map(exercises.map((e) => [e.id, e]));
  const name = (id: string) => exById.get(id)?.name ?? id;

  const routines = db.select().from(schema.routine).orderBy(asc(schema.routine.createdAt)).all();
  const days = db.select().from(schema.routineDay).all();
  const slots = db.select().from(schema.routineSlot).all();
  const dayById = new Map(days.map((d) => [d.id, d]));
  const routineById = new Map(routines.map((r) => [r.id, r]));

  const plans = routines.map((r) => ({
    id: r.id,
    name: r.name,
    active: r.active === 1,
    archived: r.archivedAt !== null,
    workoutsPerWeek: r.daysPerWeek,
    createdAt: r.createdAt,
    days: days
      .filter((d) => d.routineId === r.id)
      .sort((a, b) => a.dayIndex - b.dayIndex)
      .map((d) => ({
        id: d.id,
        order: d.dayIndex + 1,
        label: d.label,
        exercises: slots
          .filter((s) => s.routineDayId === d.id)
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            exerciseId: s.exerciseId,
            name: name(s.exerciseId),
            order: s.position + 1,
            sets: s.targetSets,
            repRange: [s.repLo, s.repHi],
            targetRir: s.targetRir,
            restSeconds: s.restSeconds,
            supersetGroup: s.supersetGroup,
            startWeightKg: s.startWeight,
            notes: s.notes,
          })),
      })),
  }));

  const sessions = db.select().from(schema.session).orderBy(asc(schema.session.startedAt)).all();
  const setsBySession = groupBy(db.select().from(schema.setLog).orderBy(asc(schema.setLog.loggedAt)).all(), (s) => s.sessionId);
  const listedBySession = groupBy(db.select().from(schema.sessionExercise).all(), (r) => r.sessionId);

  const workouts = sessions.map((s) => {
    const sets = setsBySession.get(s.id) ?? [];
    const rows = [...(listedBySession.get(s.id) ?? [])].sort((a, b) => a.position - b.position);
    const setsByEx = groupBy(sets, (x) => x.exerciseId);
    const ids = [...rows.map((r) => r.exerciseId), ...[...setsByEx.keys()].filter((id) => !rows.some((r) => r.exerciseId === id))];
    const day = s.routineDayId ? dayById.get(s.routineDayId) : undefined;
    const plan = day ? routineById.get(day.routineId) : undefined;
    const work = sets.filter((x) => x.isWarmup === 0);

    return {
      id: s.id,
      date: s.date,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationMin: s.endedAt ? Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 60_000) : null,
      status: s.status,
      plan: plan ? { id: plan.id, name: plan.name } : null,
      day: day ? { id: day.id, label: day.label } : null,
      readiness: { bodyweightKg: s.bodyweightKg, sleepHours: s.sleepHours, soreness1to5: s.soreness, stress1to5: s.stress },
      sessionRpe: s.sessionRpe,
      notes: s.notes,
      records: s.status === 'skipped' ? [] : sessionRecords(s.id).flatMap((r) => r.events.map((e) => ({ exerciseId: r.exerciseId, kind: e.kind, value: e.value, previous: e.previous }))),
      totals: { workingSets: work.length, reps: sum(work.map((x) => x.reps)), volumeKg: Math.round(sum(work.map((x) => x.weight * x.reps))) },
      exercises: ids.map((exerciseId, i) => {
        const row = rows.find((r) => r.exerciseId === exerciseId);
        const mine = setsByEx.get(exerciseId) ?? [];
        const w = mine.filter((x) => x.isWarmup === 0);
        const planned = row && row.targetSets !== null ? row.targetSets : null;
        const status = row?.skipped === 1 ? 'skipped' : w.length === 0 ? 'not_started' : planned !== null && w.length < planned ? 'partial' : 'done';
        return {
          exerciseId,
          name: name(exerciseId),
          primaryMuscles: exById.get(exerciseId)?.primaryMuscles ?? [],
          order: i + 1,
          source: row ? row.source : 'logged',
          status,
          planned: row && row.targetSets !== null ? { sets: row.targetSets, repRange: [row.repLo, row.repHi], targetRir: row.targetRir, restSeconds: row.restSeconds } : null,
          sets: mine.map((x) => ({
            set: x.setIndex + 1,
            weightKg: x.weight,
            reps: x.reps,
            rir: x.rir,
            warmup: x.isWarmup === 1,
            pain: x.painFlag === 1,
            e1rmKg: r1(x.e1rm),
            restTakenSec: x.restTakenSeconds,
            overrodeSuggestion: x.wasOverride === 1,
            loggedAt: x.loggedAt,
          })),
          totals: {
            workingSets: w.length,
            reps: sum(w.map((x) => x.reps)),
            volumeKg: Math.round(sum(w.map((x) => x.weight * x.reps))),
            topWeightKg: w.length ? Math.max(...w.map((x) => x.weight)) : null,
            bestE1rmKg: w.length ? r1(Math.max(...w.map((x) => x.e1rm))) : null,
          },
        };
      }),
    };
  });

  const stats = db.select().from(schema.exerciseSessionStat).orderBy(asc(schema.exerciseSessionStat.date)).all();
  const progression = [...groupBy(stats, (r) => r.exerciseId)].map(([exerciseId, rows]) => ({
    exerciseId,
    name: name(exerciseId),
    sessions: rows.map((r) => ({ date: r.date, bestE1rmKg: r1(r.bestE1rm), topWeightKg: r.topWeight, volumeKg: Math.round(r.tonnage), hardSets: r.hardSets })),
  }));

  const weighIns = db.select({ date: schema.weighIn.date, kg: schema.weighIn.kg }).from(schema.weighIn).orderBy(asc(schema.weighIn.date)).all();
  const bodyweight = weightTrend(weighIns).map((t) => ({ date: t.date, kg: t.raw, trendKg: r1(t.trend) }));

  const measurements = db
    .select()
    .from(schema.measurement)
    .orderBy(asc(schema.measurement.date))
    .all()
    .map((m) => {
      const def = siteDef(m.site);
      return { date: m.date, site: m.site, label: def.label, value: m.cm, unit: def.unit };
    });

  const hydrationDays = db
    .select({ date: schema.waterLog.date, ml: sql<number>`sum(${schema.waterLog.ml})`, entries: sql<number>`count(*)` })
    .from(schema.waterLog)
    .groupBy(schema.waterLog.date)
    .orderBy(asc(schema.waterLog.date))
    .all()
    .map((d) => ({ date: d.date, totalMl: Number(d.ml), entries: Number(d.entries), metTarget: Number(d.ml) >= opts.hydrationTargetMl }));

  const firstMeal = db.select({ date: schema.mealLog.date }).from(schema.mealLog).orderBy(asc(schema.mealLog.date)).limit(1).get();
  const nutrition = firstMeal ? intakeBetween(firstMeal.date, today) : [];

  const firstDate = [sessions[0]?.date, weighIns[0]?.date].filter((d): d is string => !!d).sort()[0];
  const weeklySummaries = [];
  if (firstDate) {
    const last = weekStartISO(today);
    const start = [weekStartISO(firstDate), addDays(last, -7 * (MAX_WEEKS - 1))].sort()[1] ?? last;
    for (let w = start; w <= last; w = addDays(w, 7)) {
      const x = weekSummary(w, opts.hydrationTargetMl);
      weeklySummaries.push({
        weekStart: x.weekStart,
        weekEnd: x.weekEnd,
        workouts: { plannedPerWeek: x.plannedDays, completed: x.completed, partial: x.partial, skipped: x.skipped, cancelled: x.cancelled },
        training: { exercises: x.exercises, workingSets: x.sets, reps: x.reps, volumeKg: Math.round(x.tonnage), minutes: x.minutes },
        lifts: x.lifts.map((l) => ({
          exerciseId: l.exerciseId,
          name: l.name,
          topWeightKg: l.topWeight,
          previousTopWeightKg: l.prevTopWeight,
          bestE1rmKg: r1(l.bestE1rm),
          previousBestE1rmKg: l.prevBestE1rm === null ? null : r1(l.prevBestE1rm),
        })),
        bodyweightTrendKg: {
          start: x.bodyweight.start === null ? null : r1(x.bodyweight.start),
          end: x.bodyweight.end === null ? null : r1(x.bodyweight.end),
        },
        measurements: x.measurements.map((m) => ({ site: m.site, value: m.value, previous: m.prev, unit: siteDef(m.site).unit })),
        water: { daysInWeek: x.water.days, daysLogged: x.water.daysLogged, daysMetTarget: x.water.daysHit, averageMl: Math.round(x.water.avgMl) },
      });
    }
  }

  return {
    schema: EXPORT_SCHEMA,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: { name: 'Iron', version: opts.appVersion },
    readme: README,
    units: UNITS,
    profile: {
      name: settings.name || null,
      sex: settings.sex,
      age: settings.age,
      heightCm: settings.heightCm,
      goal: settings.phase,
      activityFactor: settings.activityFactor,
      typicalSessionMinutes: settings.trainingMinutes,
      wakeTime: fmtClockOfDay(settings.wakeMinutes),
      sleepTime: fmtClockOfDay(settings.sleepMinutes),
      currentHydrationTargetMl: opts.hydrationTargetMl,
      calorieCycling: settings.calorieCycling,
      lastDeloadDate: settings.lastDeloadDate,
      training: {
        goal: settings.goalFocus,
        experience: settings.experience,
        trainingDays: settings.trainingDays.map((d) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d]),
        sessionMinutes: settings.trainingMinutes,
        equipmentPreset: settings.equipmentPreset,
        equipment: settings.tools,
        limitations: settings.limitations,
        dislikedExercises: settings.disliked,
        warmupMode: settings.warmupMode,
      },
    },
    exercises: exercises.map((e) => {
      const c = CATALOG_BY_ID.get(e.id);
      return {
      id: e.id,
      name: e.name,
      equipment: e.loadType,
      loadStepKg: e.loadStep,
      primaryMuscles: e.primaryMuscles,
      secondaryMuscles: e.secondaryMuscles ?? [],
      unilateral: e.isUnilateral === 1,
      custom: e.isCustom === 1,
      archived: e.archivedAt !== null,
      ...(c ? { category: categoryOf(c), pattern: c.pattern, compound: c.compound, level: c.level, measure: c.measure ?? 'reps' } : {}),
      };
    }),
    exerciseSwaps: db
      .select()
      .from(schema.exerciseLink)
      .all()
      .map((l) => ({ from: l.fromExerciseId, to: l.toExerciseId, loadRatio: l.ratio, at: l.createdAt })),
    plans,
    workouts,
    progression,
    bodyweight,
    measurements,
    hydration: { currentTargetMl: opts.hydrationTargetMl, days: hydrationDays },
    nutrition: nutrition.map((d) => ({ date: d.date, kcal: d.kcal, proteinG: d.proteinG ?? null })),
    weeklySummaries,
  };
}

export type AIExport = ReturnType<typeof buildAIExport>;
