/**
 * Export (docs/07 — "build this first"), written into a folder the user picks:
 *   iron-export-DATE.json   structured, self-describing — for a coach or an AI model
 *   iron-DATE-*.csv         flat tables for spreadsheets
 *   iron-backup-DATE.json   every table verbatim — the lossless backup
 * No auth, no network. Uses the Android folder picker because React Native's Share
 * cannot share files on Android and expo-sharing is not installed.
 */
import Constants from 'expo-constants';
import { Directory } from 'expo-file-system';

import { expoDb } from '@/db/client';
import { buildAIExport, type AIExport } from '@/db/repositories/export';
import { nowISO, todayISO } from '@/lib/date';

import { hydrationTarget } from './hydration';

const TABLES = [
  'exercise', 'exercise_link', 'equipment', 'routine', 'routine_day', 'routine_slot', 'session', 'session_exercise', 'set_log',
  'exercise_session_stat', 'weigh_in', 'measurement', 'food', 'recipe', 'recipe_item', 'meal_log', 'water_log', 'setting',
] as const;

type Row = Record<string, unknown>;

function readTable(name: string): Row[] {
  return expoDb.getAllSync<Row>(`SELECT * FROM "${name}"`);
}

export function buildJSONDump(): string {
  const tables: Record<string, Row[]> = {};
  for (const t of TABLES) tables[t] = readTable(t);
  return JSON.stringify({ app: 'iron', exportedAt: nowISO(), tables }, null, 2);
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCSV(rows: Row[]): string {
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  const lines = [cols.map(cell).join(',')];
  for (const r of rows) lines.push(cols.map((c) => cell(r[c])).join(','));
  return lines.join('\r\n');
}

/** Flat, one-row-per-thing views of the structured export. */
export function buildCSVs(data: AIExport): { name: string; csv: string }[] {
  const workouts = data.workouts.map((w) => ({
    workout_id: w.id,
    date: w.date,
    status: w.status,
    plan: w.plan?.name,
    day: w.day?.label,
    duration_min: w.durationMin,
    working_sets: w.totals.workingSets,
    reps: w.totals.reps,
    volume_kg: w.totals.volumeKg,
    session_rpe: w.sessionRpe,
    bodyweight_kg: w.readiness.bodyweightKg,
    sleep_hours: w.readiness.sleepHours,
    soreness_1_5: w.readiness.soreness1to5,
    stress_1_5: w.readiness.stress1to5,
    notes: w.notes,
  }));
  const exercises = data.workouts.flatMap((w) =>
    w.exercises.map((e) => ({
      date: w.date,
      workout_id: w.id,
      workout_status: w.status,
      exercise_id: e.exerciseId,
      exercise: e.name,
      source: e.source,
      status: e.status,
      planned_sets: e.planned?.sets,
      planned_rep_lo: e.planned?.repRange[0],
      planned_rep_hi: e.planned?.repRange[1],
      planned_rir: e.planned?.targetRir,
      working_sets: e.totals.workingSets,
      reps: e.totals.reps,
      volume_kg: e.totals.volumeKg,
      top_weight_kg: e.totals.topWeightKg,
      best_e1rm_kg: e.totals.bestE1rmKg,
    })),
  );
  const sets = data.workouts.flatMap((w) =>
    w.exercises.flatMap((e) =>
      e.sets.map((s) => ({
        date: w.date,
        workout_id: w.id,
        workout_status: w.status,
        day: w.day?.label,
        exercise_id: e.exerciseId,
        exercise: e.name,
        set: s.set,
        weight_kg: s.weightKg,
        reps: s.reps,
        rir: s.rir,
        warmup: s.warmup,
        pain: s.pain,
        e1rm_kg: s.e1rmKg,
        rest_taken_sec: s.restTakenSec,
        logged_at: s.loggedAt,
      })),
    ),
  );
  const weekly = data.weeklySummaries.map((w) => ({
    week_start: w.weekStart,
    planned: w.workouts.plannedPerWeek,
    completed: w.workouts.completed,
    partial: w.workouts.partial,
    skipped: w.workouts.skipped,
    cancelled: w.workouts.cancelled,
    working_sets: w.training.workingSets,
    reps: w.training.reps,
    volume_kg: w.training.volumeKg,
    minutes: w.training.minutes,
    bodyweight_trend_start_kg: w.bodyweightTrendKg.start,
    bodyweight_trend_end_kg: w.bodyweightTrendKg.end,
    water_days_met_target: w.water.daysMetTarget,
    water_avg_ml: w.water.averageMl,
  }));
  return [
    { name: 'workouts', csv: toCSV(workouts) },
    { name: 'workout_exercises', csv: toCSV(exercises) },
    { name: 'sets', csv: toCSV(sets) },
    { name: 'bodyweight', csv: toCSV(data.bodyweight) },
    { name: 'measurements', csv: toCSV(data.measurements) },
    { name: 'water_daily', csv: toCSV(data.hydration.days) },
    { name: 'weekly_summary', csv: toCSV(weekly) },
  ];
}

async function pickFolder(): Promise<Directory | null> {
  try {
    return await Directory.pickDirectoryAsync();
  } catch {
    return null; // cancelled
  }
}

/** Returns the number of files written, or null if the picker was cancelled. */
export async function exportAll(): Promise<number | null> {
  const dir = await pickFolder();
  if (!dir) return null;
  const stamp = todayISO();
  const data = buildAIExport({ appVersion: Constants.expoConfig?.version ?? 'unknown', hydrationTargetMl: hydrationTarget().ml });
  dir.createFile(`iron-export-${stamp}.json`, 'application/json').write(JSON.stringify(data, null, 2));
  const csvs = buildCSVs(data);
  for (const { name, csv } of csvs) dir.createFile(`iron-${stamp}-${name}.csv`, 'text/csv').write(csv);
  dir.createFile(`iron-backup-${stamp}.json`, 'application/json').write(buildJSONDump());
  return csvs.length + 2;
}
