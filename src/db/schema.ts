/**
 * Drizzle schema — the single definition of the database.
 * Generate migrations with `npm run db:generate`. Never edit a migration that has
 * already run on the device; add a new one.
 *
 * See docs/03-DATA-MODEL.md for the intent behind each table.
 */
import { sqliteTable, text, integer, real, index, primaryKey } from 'drizzle-orm/sqlite-core';

/* ============================ Catalogue ================================= */

export const exercise = sqliteTable('exercise', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  loadType: text('load_type', {
    enum: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'smith'],
  }).notNull(),
  /** Smallest increment HIS gym can actually load. Drives all rounding. */
  loadStep: real('load_step').notNull().default(2.5),
  primaryMuscles: text('primary_muscles', { mode: 'json' }).$type<string[]>().notNull(),
  secondaryMuscles: text('secondary_muscles', { mode: 'json' }).$type<string[]>(),
  isUnilateral: integer('is_unilateral').notNull().default(0),
  isCustom: integer('is_custom').notNull().default(0),
  archivedAt: text('archived_at'),
});

/**
 * Carries progression history across a variation swap. `ratio` scales loads
 * (incline DB press → incline machine press is not 1:1). Without this table a
 * swap resets progression to zero — the thing every commercial app gets wrong.
 */
export const exerciseLink = sqliteTable('exercise_link', {
  id: text('id').primaryKey(),
  fromExerciseId: text('from_exercise_id').notNull().references(() => exercise.id),
  toExerciseId: text('to_exercise_id').notNull().references(() => exercise.id),
  ratio: real('ratio').notNull().default(1),
  createdAt: text('created_at').notNull(),
});

export const equipment = sqliteTable('equipment', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['plate', 'dumbbell', 'bar', 'machine_stack'] }).notNull(),
  valueKg: real('value_kg').notNull(),
  count: integer('count').notNull().default(2),
  machineName: text('machine_name'),
});

/* ============================= Program ================================== */

export const routine = sqliteTable('routine', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  daysPerWeek: integer('days_per_week').notNull(),
  active: integer('active').notNull().default(0),
  createdAt: text('created_at').notNull(),
  /** Archived plans are hidden from the list but keep their history links. */
  archivedAt: text('archived_at'),
});

export const routineDay = sqliteTable('routine_day', {
  id: text('id').primaryKey(),
  routineId: text('routine_id').notNull().references(() => routine.id, { onDelete: 'cascade' }),
  dayIndex: integer('day_index').notNull(),
  label: text('label').notNull(),
});

export const routineSlot = sqliteTable('routine_slot', {
  id: text('id').primaryKey(),
  routineDayId: text('routine_day_id').notNull().references(() => routineDay.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id').notNull().references(() => exercise.id),
  position: integer('position').notNull(),
  targetSets: integer('target_sets').notNull(),
  repLo: integer('rep_lo').notNull(),
  repHi: integer('rep_hi').notNull(),
  targetRir: integer('target_rir').notNull().default(1),
  restSeconds: integer('rest_seconds').notNull().default(150),
  supersetGroup: text('superset_group'),
  notes: text('notes'),
  /** Optional first-session weight, used only while there is no history (CALIBRATE). */
  startWeight: real('start_weight'),
});

/* ============================= Logging ================================== */

export const SESSION_STATUSES = ['active', 'completed', 'partial', 'skipped', 'cancelled'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  /** Nullable: an improvised workout is still a valid session. */
  routineDayId: text('routine_day_id').references(() => routineDay.id),
  date: text('date').notNull(),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  /**
   * active → in progress. completed / partial → finished (all / some planned work).
   * skipped → the day was skipped on purpose (no sets). cancelled → stopped early,
   * logged sets kept but the day does NOT count as done.
   */
  status: text('status', { enum: SESSION_STATUSES }).notNull().default('completed'),
  bodyweightKg: real('bodyweight_kg'),
  sleepHours: real('sleep_hours'),
  soreness: integer('soreness'),
  stress: integer('stress'),
  sessionRpe: integer('session_rpe'),
  notes: text('notes'),
}, (t) => ({
  byDate: index('idx_session_date').on(t.date),
}));

/**
 * The workout's own exercise list, snapshotted from the plan when it starts. Holds
 * the planned targets (so history can show planned vs done after the plan changes),
 * additions, skips, swaps and order — everything that is "today only".
 */
export const sessionExercise = sqliteTable('session_exercise', {
  sessionId: text('session_id').notNull().references(() => session.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id').notNull().references(() => exercise.id),
  position: integer('position').notNull(),
  /** 'plan' = from the routine day; 'added' = added during the workout. */
  source: text('source', { enum: ['plan', 'added'] }).notNull(),
  skipped: integer('skipped').notNull().default(0),
  targetSets: integer('target_sets'),
  repLo: integer('rep_lo'),
  repHi: integer('rep_hi'),
  targetRir: integer('target_rir'),
  restSeconds: integer('rest_seconds'),
  supersetGroup: text('superset_group'),
  startWeight: real('start_weight'),
}, (t) => ({
  pk: primaryKey({ columns: [t.sessionId, t.exerciseId] }),
}));

export const setLog = sqliteTable('set_log', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => session.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id').notNull().references(() => exercise.id),
  setIndex: integer('set_index').notNull(),
  weight: real('weight').notNull(),
  reps: integer('reps').notNull(),
  rir: integer('rir').notNull(),
  isWarmup: integer('is_warmup').notNull().default(0),
  painFlag: integer('pain_flag').notNull().default(0),
  restTakenSeconds: integer('rest_taken_seconds'),
  loggedAt: text('logged_at').notNull(),
  /** Denormalised at insert so charts never recompute. */
  e1rm: real('e1rm').notNull(),
  /** Set when the user overrode the engine's suggestion — the engine sees reality. */
  wasOverride: integer('was_override').notNull().default(0),
}, (t) => ({
  byExerciseDate: index('idx_setlog_ex_date').on(t.exerciseId, t.loggedAt),
  bySession: index('idx_setlog_session').on(t.sessionId),
}));

/** Precomputed at session close. Derivable from set_log; rebuildable if it drifts. */
export const exerciseSessionStat = sqliteTable('exercise_session_stat', {
  sessionId: text('session_id').notNull().references(() => session.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id').notNull().references(() => exercise.id),
  bestE1rm: real('best_e1rm').notNull(),
  tonnage: real('tonnage').notNull(),
  hardSets: integer('hard_sets').notNull(),
  topWeight: real('top_weight').notNull(),
  date: text('date').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.sessionId, t.exerciseId] }),
  byExercise: index('idx_stat_ex_date').on(t.exerciseId, t.date),
}));

/* =============================== Body =================================== */

export const weighIn = sqliteTable('weigh_in', {
  date: text('date').primaryKey(),
  kg: real('kg').notNull(),
  note: text('note'),
});

/**
 * The morning check-in: how you slept and how you feel. One row per day; weight
 * stays in `weigh_in`. A workout copies both into its session row when it starts.
 */
export const checkIn = sqliteTable('check_in', {
  date: text('date').primaryKey(),
  sleepHours: real('sleep_hours'),
  soreness: integer('soreness'),
  stress: integer('stress'),
});

/**
 * One reading per row. `cm` holds the value in the site's unit — cm for
 * circumferences, % for `bodyFat` (see features/body/sites.ts). Kept as `cm` so no
 * migration rewrites existing rows.
 */
export const measurement = sqliteTable('measurement', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  site: text('site').notNull(),
  cm: real('cm').notNull(),
});

/* ============================= Nutrition ================================ */

export const food = sqliteTable('food', {
  id: text('id').primaryKey(),
  barcode: text('barcode'),
  name: text('name').notNull(),
  brand: text('brand'),
  /** Grams in one "serving". */
  servingG: real('serving_g').notNull(),
  /** What he actually says: "1 roti", "1 katori", "1 scoop". */
  servingLabel: text('serving_label'),
  kcal: real('kcal').notNull(),
  protein: real('protein').notNull(),
  carb: real('carb').notNull(),
  fat: real('fat').notNull(),
  fiber: real('fiber'),
  isCustom: integer('is_custom').notNull().default(0),
  /** Drives quick-add ordering — the list reorders around what he really eats. */
  timesUsed: integer('times_used').notNull().default(0),
}, (t) => ({
  byName: index('idx_food_name').on(t.name),
  byBarcode: index('idx_food_barcode').on(t.barcode),
}));

export const recipe = sqliteTable('recipe', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  servings: real('servings').notNull().default(1),
  timesUsed: integer('times_used').notNull().default(0),
});

export const recipeItem = sqliteTable('recipe_item', {
  id: text('id').primaryKey(),
  recipeId: text('recipe_id').notNull().references(() => recipe.id, { onDelete: 'cascade' }),
  foodId: text('food_id').notNull().references(() => food.id),
  grams: real('grams').notNull(),
});

export const mealLog = sqliteTable('meal_log', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  mealSlot: text('meal_slot', { enum: ['breakfast', 'lunch', 'snack', 'dinner'] }).notNull(),
  foodId: text('food_id').references(() => food.id),
  recipeId: text('recipe_id').references(() => recipe.id),
  grams: real('grams').notNull(),
  loggedAt: text('logged_at').notNull(),
}, (t) => ({
  byDate: index('idx_meal_date').on(t.date),
}));

/* ============================== Water =================================== */

/** Individual events, not daily totals — the scheduler needs to know WHEN. */
export const waterLog = sqliteTable('water_log', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  ml: integer('ml').notNull(),
  loggedAt: text('logged_at').notNull(),
}, (t) => ({
  byDate: index('idx_water_date').on(t.date),
}));

/* ============================= Settings ================================= */

export const setting = sqliteTable('setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** Survives a force-quit mid-rest: resume from endsAt, never from accumulated ticks. */
export const timerState = sqliteTable('timer_state', {
  id: text('id').primaryKey(),
  sessionId: text('session_id'),
  endsAt: text('ends_at').notNull(),
  label: text('label'),
});
