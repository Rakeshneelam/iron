/**
 * Typed facade over the key/value `setting` table.
 * Every value is JSON-encoded (the seed writes `"recomp"`, `173`, …). A missing or
 * corrupt row falls back to its default per key — settings can never crash the app.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { useLive } from '@/db/live';
import * as schema from '@/db/schema';
import type { Phase, Sex } from '@/engine/metabolic';

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
};

export const PHASES: readonly Phase[] = ['cut', 'recomp', 'maintain', 'bulk'];

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[];
const NULLABLE: Partial<Record<keyof AppSettings, 'number' | 'string'>> = {
  ambientTempC: 'number',
  hydrationOverrideMl: 'number',
  lastDeloadDate: 'string',
};

function parseValue(key: keyof AppSettings, text: string): unknown {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (key === 'phase') return PHASES.includes(v as Phase) ? v : undefined;
  if (key === 'sex') return v === 'male' || v === 'female' ? v : undefined;
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
