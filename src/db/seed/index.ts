/**
 * First-launch seed — build plan 1.3.
 *
 * IDEMPOTENT BY CONSTRUCTION. Every row has a deterministic id (docs/09), so a
 * re-run is an `insert … on conflict do nothing` that changes nothing. This is
 * what lets the seed run on *every* start rather than behind a "first launch"
 * flag: a catalogue entry added in a later version of the app appears on the
 * next open, and a value the user has corrected is never reverted.
 *
 * The whole thing runs in one transaction, so a crash halfway leaves the DB
 * exactly as it was rather than half-catalogued.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import * as schema from '@/db/schema';
import { migrateLegacySessionPlans } from '@/db/repositories/sessions';

import { EQUIPMENT, EXERCISES } from './exercises';
import { FOODS_IN } from './foods-in';

/* ============================ ids & shapes ============================== */

type EquipmentKind = (typeof schema.equipment.$inferInsert)['kind'];

/** `eq-plate-25`, `eq-db-30`, `eq-bar-20` — stable across reinstalls. */
const EQUIPMENT_ID_PREFIX: Record<EquipmentKind, string> = {
  plate: 'eq-plate',
  dumbbell: 'eq-db',
  bar: 'eq-bar',
  machine_stack: 'eq-stack',
};

interface SeedEquipmentItem {
  kind: EquipmentKind;
  valueKg: number;
  count: number;
  machineName?: string;
}

const equipmentId = (kind: EquipmentKind, valueKg: number): string =>
  `${EQUIPMENT_ID_PREFIX[kind]}-${String(valueKg)}`;

/**
 * Defaults from docs/01. JSON-encoded because the `value` column is text and a
 * settings value may be a string, a number, a boolean or null — JSON is the one
 * encoding that round-trips all four. Inserted with `on conflict do nothing`, so
 * once he changes a value the seed never touches it again.
 */
const DEFAULT_SETTING_VALUES: Record<string, string | number> = {
  phase: 'recomp',
  heightCm: 173,
  age: 28,
  sex: 'male',
  wakeMinutes: 390, // 06:30
  sleepMinutes: 1350, // 22:30
  activityFactor: 1.5,
  trainingMinutes: 60,
};

/** Keeps every statement well under SQLite's bound-parameter ceiling. */
const INSERT_CHUNK = 40;

/** The transaction handle drizzle hands the callback — sync, like every read. */
type SeedTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function chunked<T>(rows: T[], size: number = INSERT_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/* ============================== the seed ================================ */

/** Idempotent — re-running must not duplicate (build plan 1.3). */
export function seedIfNeeded(): void {
  db.transaction((tx) => {
    // Order matters: foreign keys are ON and enforced immediately, so the
    // catalogue has to exist before the slots that reference it.
    seedExercises(tx);
    seedEquipment(tx);
    seedFoods(tx);
    seedSetupFlag(tx);
    seedSettings(tx);
  });
  migrateLegacySessionPlans();
}

function seedExercises(tx: SeedTx): void {
  const rows: (typeof schema.exercise.$inferInsert)[] = EXERCISES.map((ex) => ({
    id: ex.id,
    name: ex.name,
    loadType: ex.loadType,
    loadStep: ex.loadStep,
    primaryMuscles: ex.primaryMuscles,
    secondaryMuscles: ex.secondaryMuscles ?? null,
    isUnilateral: ex.isUnilateral === true ? 1 : 0,
    isCustom: 0,
    archivedAt: null,
  }));

  // do-nothing, not do-update: `loadStep` is meant to be tuned once against his
  // gym's actual plates, and an archived exercise must stay archived.
  for (const batch of chunked(rows)) {
    tx.insert(schema.exercise).values(batch).onConflictDoNothing().run();
  }
}

function seedEquipment(tx: SeedTx): void {
  const items: SeedEquipmentItem[] = EQUIPMENT;
  const rows: (typeof schema.equipment.$inferInsert)[] = items.map((item) => ({
    id: equipmentId(item.kind, item.valueKg),
    kind: item.kind,
    valueKg: item.valueKg,
    count: item.count,
    machineName: item.machineName ?? null,
  }));

  // The equipment screen edits counts; do-nothing keeps his real inventory.
  for (const batch of chunked(rows)) {
    tx.insert(schema.equipment).values(batch).onConflictDoNothing().run();
  }
}

function seedFoods(tx: SeedTx): void {
  const rows: (typeof schema.food.$inferInsert)[] = FOODS_IN.map((food) => ({
    id: food.id,
    name: food.name,
    servingG: food.servingG,
    servingLabel: food.servingLabel,
    kcal: food.kcal,
    protein: food.protein,
    carb: food.carb,
    fat: food.fat,
    fiber: food.fiber ?? null,
    isCustom: 0,
  }));

  // do-nothing preserves both `timesUsed` (quick-add ordering) and the macro
  // corrections he makes against his own kitchen.
  for (const batch of chunked(rows)) {
    tx.insert(schema.food).values(batch).onConflictDoNothing().run();
  }
}

/**
 * First-run setup is shown only on a fresh install. An existing database (plans or
 * workouts already there) is treated as set up, so an upgrade never shows it.
 */
function seedSetupFlag(tx: SeedTx): void {
  const has = tx.select({ key: schema.setting.key }).from(schema.setting).where(eq(schema.setting.key, 'setupDone')).all();
  if (has.length) return;
  const routines = tx.select({ id: schema.routine.id }).from(schema.routine).limit(1).all();
  const sessions = tx.select({ id: schema.session.id }).from(schema.session).limit(1).all();
  tx.insert(schema.setting).values({ key: 'setupDone', value: JSON.stringify(routines.length + sessions.length > 0) }).run();
}

function seedSettings(tx: SeedTx): void {
  const rows: (typeof schema.setting.$inferInsert)[] = Object.entries(DEFAULT_SETTING_VALUES).map(
    ([key, value]) => ({ key, value: JSON.stringify(value) }),
  );

  for (const batch of chunked(rows)) {
    tx.insert(schema.setting).values(batch).onConflictDoNothing().run();
  }
}
