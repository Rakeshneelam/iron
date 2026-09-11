/**
 * Typed facade over the key/value `setting` table.
 * Every value is JSON-encoded (the seed writes `"recomp"`, `173`, …). A missing or
 * corrupt row falls back to its default per key — settings can never crash the app.
 */
import { eq } from 'drizzle-orm';

import type { Level } from '@/data/catalog';
import type { EquipmentPreset, Goal } from '@/data/templates';
import { db } from '@/db/client';
import { useLive } from '@/db/live';
import * as schema from '@/db/schema';
import type { Phase, Sex } from '@/engine/metabolic';
import { DEFAULT_REMINDERS, type ReminderPrefs } from '@/engine/reminders';
import type { WarmupMode } from '@/engine/warmup';

export interface AppSettings {
  /** Shown on Today. Optional — the app works nameless. */
  name: string;
  /** False on a fresh install until the first-run setup is finished. */
  setupDone: boolean;
  phase: Phase;
  heightCm: number;
  age: number;
  sex: Sex;
  wakeMinutes: number;
  sleepMinutes: number;
  activityFactor: number;
  trainingMinutes: number;
  ambientTempC: number | null;
  hydrationOverrideMl: number | null;
  calorieCycling: boolean;
  batteryPromptShown: boolean;
  lastDeloadDate: string | null;
  restTimerAutoStart: boolean;
  hapticsEnabled: boolean;
  /* ---- training profile (only what changes recommendations) ---- */
  experience: Level;
  goalFocus: Goal;
  /** Weekdays you plan to train, 0 = Sunday. Drives reminders and "planned this week". */
  trainingDays: number[];
  equipmentPreset: EquipmentPreset;
  /** Explicit equipment list; empty = derived from the preset. */
  tools: string[];
  /** Exercise ids you'd rather not do — swapped out of new plans and never suggested. */
  disliked: string[];
  /** Voluntarily flagged areas ('knees', 'lowerBack', 'shoulders', 'wrists', 'impact'). */
  limitations: string[];
  warmupMode: WarmupMode;
  reminders: ReminderPrefs;
}

export const DEFAULT_SETTINGS: AppSettings = {
  name: '',
  setupDone: false,
  phase: 'recomp',
  heightCm: 173,
  age: 28,
  sex: 'male',
  wakeMinutes: 390,
  sleepMinutes: 1350,
  activityFactor: 1.5,
  trainingMinutes: 60,
  ambientTempC: null,
  hydrationOverrideMl: null,
  calorieCycling: false,
  batteryPromptShown: false,
  lastDeloadDate: null,
  restTimerAutoStart: true,
  hapticsEnabled: true,
  experience: 'intermediate',
  goalFocus: 'hypertrophy',
  trainingDays: [1, 2, 4, 5],
  equipmentPreset: 'gym',
  tools: [],
  disliked: [],
  limitations: [],
  warmupMode: 'standard',
  reminders: DEFAULT_REMINDERS,
};

export const PHASES: readonly Phase[] = ['cut', 'recomp', 'maintain', 'bulk'];

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[];
const NULLABLE: Partial<Record<keyof AppSettings, 'number' | 'string'>> = {
  ambientTempC: 'number',
  hydrationOverrideMl: 'number',
  lastDeloadDate: 'string',
};
const ENUMS: Partial<Record<keyof AppSettings, readonly string[]>> = {
  phase: PHASES,
  sex: ['male', 'female'],
  experience: ['beginner', 'intermediate', 'advanced'],
  goalFocus: ['strength', 'hypertrophy', 'general'],
  equipmentPreset: ['gym', 'home', 'dumbbells', 'bands', 'bodyweight'],
  warmupMode: ['quick', 'standard', 'full'],
};

/** Stored reminder prefs merged over the defaults, so new reminder types appear with sane values. */
function mergeReminders(v: Record<string, unknown>): ReminderPrefs {
  const out: Record<string, unknown> = {};
  for (const [k, def] of Object.entries(DEFAULT_REMINDERS)) {
    const stored = v[k];
    out[k] = stored && typeof stored === 'object' ? { ...def, ...(stored as object) } : def;
  }
  return out as unknown as ReminderPrefs;
}

function parseValue(key: keyof AppSettings, text: string): unknown {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return undefined;
  }
  const allowed = ENUMS[key];
  if (allowed) return typeof v === 'string' && allowed.includes(v) ? v : undefined;
  if (Array.isArray(DEFAULT_SETTINGS[key])) return Array.isArray(v) ? v : undefined;
  if (key === 'reminders') return v && typeof v === 'object' && !Array.isArray(v) ? mergeReminders(v as Record<string, unknown>) : undefined;
  const nullable = NULLABLE[key];
  if (nullable) return v === null || typeof v === nullable ? v : undefined;
  if (typeof v === 'number' && !Number.isFinite(v)) return undefined;
  return typeof v === typeof DEFAULT_SETTINGS[key] ? v : undefined;
}

export function getSettings(): AppSettings {
  const rows = db.select().from(schema.setting).all();
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of KEYS) {
    const text = byKey.get(key);
    if (text === undefined) continue;
    const v = parseValue(key, text);
    if (v !== undefined) out[key] = v;
  }
  return out as unknown as AppSettings;
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  setRaw(key, JSON.stringify(value));
}

/** Live settings: re-renders whenever any setting is written. */
export function useSettings(): AppSettings {
  return useLive(getSettings, ['setting']);
}

export function getRaw(key: string): string | undefined {
  return db.select().from(schema.setting).where(eq(schema.setting.key, key)).get()?.value;
}

export function setRaw(key: string, value: string): void {
  db.insert(schema.setting)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.setting.key, set: { value } })
    .run();
}

export function deleteRaw(key: string): void {
  db.delete(schema.setting).where(eq(schema.setting.key, key)).run();
}
