# 09 — Module contract

Generated during the phase 1–7 build so that work on separate modules composes.
**This file is normative for signatures.** If you implement a module listed here,
export exactly these names with exactly these shapes. If you consume one, you may
rely on them existing. Where a signature is wrong, fix it here first, then the code.

Engine types (`ExerciseConfig`, `SessionLog`, `SetLog`, `Prescription`, `Readiness`,
`WeighIn`, `IntakeDay`, `Phase`, `Sex`, `DeloadInput`) are imported from
`@/engine/progression` and `@/engine/metabolic`. Never redefine them.

Drizzle row types come from the schema:
`type Exercise = typeof schema.exercise.$inferSelect` etc. Repositories re-export
the row types they own.

---

## Global decisions

1. **Repository reads are synchronous.** `drizzle-orm/expo-sqlite` runs sync against
   `openDatabaseSync`. `docs/05` bans spinners on local reads, so screens call
   repositories directly in render — no `useEffect` + `useState` + loading flag.
2. **Reactive reads use `useLiveQuery`** from `drizzle-orm/expo-sqlite`, which
   re-renders on write. The DB is opened with `enableChangeListener: true`. This
   replaces the "Zustand store invalidated on write" note in `docs/02` — it is not a
   new dependency (it ships inside Drizzle) and removes a whole class of stale-cache
   bugs. Zustand is still used for ephemeral session UI state only.
3. **Writes are synchronous and immediate**, per `AGENTS.md` §1.3. A logging call
   returns after the row is committed. No optimistic queues.
4. **Never hardcode a colour, spacing, radius or duration.** Import from
   `@/theme/tokens`.
5. **Dates**: `YYYY-MM-DD` for days, full ISO-8601 for instants, both local-time.
   Always via `@/lib/date` — never `new Date().toISOString().slice(0,10)`, which is
   UTC and logs a 05:30 IST workout to the previous day.
6. No `console.log` in committed code.

---

## `@/lib/date`

```ts
export function todayISO(): string                     // local 'YYYY-MM-DD'
export function nowISO(): string                       // local-offset ISO-8601 instant
export function toISODate(d: Date): string
export function parseISODate(iso: string): Date        // local midnight
export function addDays(iso: string, n: number): string
export function daysBetweenISO(a: string, b: string): number
export function minutesSinceMidnight(d?: Date): number
export function weekStartISO(iso: string): string      // Monday
export function lastNDays(n: number, endISO?: string): string[]   // ascending
export function fmtClock(totalSeconds: number): string // '2:30', negative -> '0:00'
export function fmtDayLabel(iso: string): string       // 'Today' | 'Yesterday' | 'Mon 3 Mar'
```

## `@/lib/ids`

```ts
export function newId(): string        // expo-crypto randomUUID()
```

## `@/lib/format`

```ts
export function kg(n: number): string        // '62.5 kg' — trims trailing .0
export function kgNum(n: number): string     // '62.5'
export function ml(n: number): string        // '1.2 L' above 1000, else '750 ml'
export function kcal(n: number): string
export function grams(n: number): string
export function pct(n: number, dp?: number): string
export function signed(n: number, dp?: number): string   // '+2.5' / '-1.0'
```

## `@/lib/plates`

```ts
export type EquipmentRow = typeof schema.equipment.$inferSelect

/** Per-side plate breakdown for a barbell target. null when not loadable. */
export function platesPerSide(
  targetKg: number, barKg: number, plates: EquipmentRow[]
): { plate: number; count: number }[] | null

/** Snap to a weight the gym can actually load, given real inventory. */
export function nearestLoadable(
  targetKg: number, loadType: LoadType, equipment: EquipmentRow[], fallbackStep: number
): number

export function barsAvailable(equipment: EquipmentRow[]): EquipmentRow[]
```

## `@/lib/chart`

```ts
export interface Pt { x: number; y: number }
/** Largest-triangle-three-buckets. docs/02: charts render <= ~200 points. */
export function downsample(pts: Pt[], max: number): Pt[]
export function linePath(pts: Pt[], w: number, h: number, pad: number): string
export function scaleY(v: number, min: number, max: number, h: number, pad: number): number
```

---

## `@/db/client`

```ts
export const expoDb: SQLiteDatabase                       // raw handle, for PRAGMA
export const db: ExpoSQLiteDatabase<typeof schema>        // drizzle instance
export const DB_NAME = 'iron.db'
/** Idempotent: PRAGMAs, migrations, seed. Safe to call once at app start. */
export async function initDatabase(): Promise<void>
```

Open with `openDatabaseSync(DB_NAME, { enableChangeListener: true })`.
Set `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON` before migrating.

## `@/db/seed/index`

```ts
/** Idempotent — re-running must not duplicate (build plan 1.3). */
export function seedIfNeeded(): void
```

Seeds `exercise`, `equipment`, the Upper/Lower `routine` + days + slots (active), the
Indian food staples, and default `setting` rows. Use **deterministic ids** so
re-running is a no-op: routine `rt-upper-lower`, day `rd-upper-lower-{i}`, slot
`rs-upper-lower-{dayIndex}-{position}`.

Default settings (from `docs/01`): phase `recomp`, heightCm 173, age 28, sex male,
wake 06:30 (390), sleep 22:30 (1350), activityFactor 1.5, trainingMinutes 60.

---

## Repositories — `@/db/repositories/*`

### `exercises.ts`
```ts
export type Exercise = typeof schema.exercise.$inferSelect
export function getExercise(id: string): Exercise | undefined
export function listExercises(opts?: { muscle?: string; includeArchived?: boolean; q?: string }): Exercise[]
export function createCustomExercise(input: Omit<Exercise,'id'|'isCustom'|'archivedAt'>): Exercise
export function updateExercise(id: string, patch: Partial<Exercise>): void
export function archiveExercise(id: string): void
/** Bridge to the engine. slot supplies rep range / sets / RIR when present. */
export function toExerciseConfig(ex: Exercise, slot?: RoutineSlot | null): ExerciseConfig
export function linkExercises(fromId: string, toId: string, ratio: number): void
export function getLinkedSources(exerciseId: string): { fromExerciseId: string; ratio: number }[]
```

`toExerciseConfig` must set `consecutiveResets` from `countConsecutiveResets` in
`stats.ts` so `prescribe` can reach the SWAP branch.

### `program.ts`
```ts
export type Routine = typeof schema.routine.$inferSelect
export type RoutineDay = typeof schema.routineDay.$inferSelect
export type RoutineSlot = typeof schema.routineSlot.$inferSelect
export type SlotWithExercise = RoutineSlot & { exercise: Exercise }

export function getActiveRoutine(): Routine | undefined
export function listRoutines(): Routine[]
export function setActiveRoutine(id: string): void
export function getDays(routineId: string): RoutineDay[]
export function getSlots(routineDayId: string): SlotWithExercise[]
/** Cycle position, NOT calendar day: the day after the last completed session's.
    A missed day is neutral (AGENTS.md §6) — it must never skip you forward. */
export function resolveNextDay(routineId: string): RoutineDay | undefined
export function createRoutine(name: string, daysPerWeek: number): Routine
export function addDay(routineId: string, label: string): RoutineDay
export function addSlot(routineDayId: string, exerciseId: string, partial?: Partial<RoutineSlot>): RoutineSlot
export function updateSlot(id: string, patch: Partial<RoutineSlot>): void
export function removeSlot(id: string): void
export function reorderSlots(routineDayId: string, orderedIds: string[]): void
/** carryHistory writes an exercise_link so progression survives the swap. */
export function swapSlotExercise(slotId: string, newExerciseId: string, opts: { carryHistory: boolean; ratio?: number }): void
```

### `sessions.ts`
```ts
export type Session = typeof schema.session.$inferSelect
export type SetRow = typeof schema.setLog.$inferSelect

export function getActiveSession(): Session | undefined            // endedAt IS NULL
export function startSession(routineDayId: string | null): Session
export function endSession(sessionId: string): void                // writes exercise_session_stat (3.5)
export function abandonSession(sessionId: string): void
export function setReadiness(sessionId: string, r: { bodyweightKg?: number; sleepHours?: number; soreness?: number; stress?: number }): void
export function setSessionNotes(sessionId: string, notes: string): void

export function insertSet(input: {
  sessionId: string; exerciseId: string; weight: number; reps: number; rir: number;
  isWarmup?: boolean; painFlag?: boolean; wasOverride?: boolean; restTakenSeconds?: number;
}): SetRow                                     // assigns setIndex, computes+stores e1rm
export function updateSet(id: string, patch: Partial<Pick<SetRow,'weight'|'reps'|'rir'|'painFlag'|'isWarmup'>>): void
export function deleteSet(id: string): void

export function getSessionSets(sessionId: string): SetRow[]
export function getSetsFor(sessionId: string, exerciseId: string): SetRow[]
/** Engine-shaped, newest-first, warmups included with isWarmup set.
    MUST follow exercise_link and apply `ratio` to weights of inherited history. */
export function getExerciseHistory(exerciseId: string, limit?: number): SessionLog[]
export function getLastPerformance(exerciseId: string, excludeSessionId?: string):
  { date: string; sets: SetRow[] } | undefined
export function listSessions(limit?: number): Session[]
export function getSessionSummary(sessionId: string): {
  session: Session; totalTonnage: number; hardSets: number; durationMin: number;
  perExercise: { exerciseId: string; name: string; bestE1rm: number; prevBestE1rm: number | null; isPR: boolean; tonnage: number }[];
}
/** Ad-hoc exercise added to a running session but not in the plan (2.5). */
export function addAdHocExercise(sessionId: string, exerciseId: string): void
export function getAdHocExercises(sessionId: string): string[]
export function skipExercise(sessionId: string, exerciseId: string): void
export function getSkipped(sessionId: string): string[]
```

Ad-hoc/skip state persists in `setting` under key `session:{id}:adhoc` / `:skipped`
(JSON arrays) — no schema change, survives force-quit.

### `stats.ts`
```ts
export function weeklySetsPerMuscle(weekStart?: string): Record<string, number>
export function e1rmSeries(exerciseId: string, limit?: number): { date: string; e1rm: number }[]
export function dailyTonnage(days?: number): number[]              // ascending, zero-filled
export function avgRIRLast7d(): number
export function poorReadinessDays(): number
export function weeksSinceDeload(): number
export function buildDeloadInput(): DeloadInput
export function countConsecutiveResets(exerciseId: string): number
export function rebuildAllStats(): void                            // repair exercise_session_stat
export function weeklyReview(weekStart?: string): {
  weekStart: string;
  progressed: { exerciseId: string; name: string; trend: number; e1rm: number }[];
  stalled:    { exerciseId: string; name: string; trend: number; e1rm: number }[];
  volume: { muscle: string; sets: number; status: 'under'|'optimal'|'high'|'over'; mev: number; mav: number; mrv: number }[];
  deload: { deload: boolean; reasons: string[] };
  bodyweight: { rateKgPerWeek: number; check: ReturnType<typeof phaseCheck> | null };
  nutrition: { avgKcal: number | null; avgProtein: number | null; daysLogged: number };
  plateaus: { exerciseId: string; name: string; note: string }[];
  sessionsLogged: number;
}
```

### `body.ts`
```ts
export function upsertWeighIn(dateISO: string, kg: number, note?: string): void
export function listWeighIns(limit?: number): WeighIn[]        // engine shape, ascending
export function getWeighIn(dateISO: string): WeighIn | undefined
export function getLatestWeight(): number | undefined          // falls back to settings default
export function addMeasurement(date: string, site: string, cm: number): void
export function listMeasurements(site?: string): typeof schema.measurement.$inferSelect[]
```

### `food.ts`
```ts
export type Food = typeof schema.food.$inferSelect
export type Recipe = typeof schema.recipe.$inferSelect
export type MealSlot = 'breakfast'|'lunch'|'snack'|'dinner'
export interface Macros { kcal: number; protein: number; carb: number; fat: number; fiber: number }
export interface DayEntry { id: string; mealSlot: MealSlot; label: string; servingLabel: string | null;
  grams: number; servings: number; macros: Macros; foodId: string | null; recipeId: string | null }

export function searchFoods(q: string, limit?: number): Food[]
export function quickAddFoods(limit?: number): Food[]           // ORDER BY times_used DESC
export function logFood(input: { dateISO: string; mealSlot: MealSlot; foodId: string; grams: number }): void
export function logRecipe(input: { dateISO: string; mealSlot: MealSlot; recipeId: string; servings: number }): void
export function deleteEntry(id: string): void
export function getDay(dateISO: string): { entries: DayEntry[]; totals: Macros; bySlot: Record<MealSlot, DayEntry[]> }
export function getDayTotals(dateISO: string): Macros
export function repeatDay(fromISO: string, toISO: string): number      // returns rows copied
export function repeatMeal(fromISO: string, slot: MealSlot, toISO: string): number
export function createFood(input: Omit<Food,'id'|'timesUsed'|'isCustom'>): Food
export function updateFood(id: string, patch: Partial<Food>): void
export function createRecipe(name: string, servings: number, items: { foodId: string; grams: number }[]): Recipe
export function getRecipeMacros(recipeId: string): Macros
export function listRecipes(): Recipe[]
export function intakeHistory(days?: number): IntakeDay[]        // engine shape
```

`logFood`/`logRecipe` increment `times_used` in the same transaction.

### `water.ts`
```ts
export function logWater(ml: number, dateISO?: string): void
export function getDayTotal(dateISO: string): number
export function getDayEntries(dateISO: string): typeof schema.waterLog.$inferSelect[]
export function undoLast(dateISO: string): void
export function deleteEntry(id: string): void
export function historyMl(days: number): { date: string; ml: number }[]
```

### `settings.ts`
```ts
export interface AppSettings {
  phase: Phase; heightCm: number; age: number; sex: Sex;
  wakeMinutes: number; sleepMinutes: number; activityFactor: number;
  trainingMinutes: number; ambientTempC: number | null;
  hydrationOverrideMl: number | null; calorieCycling: boolean;
  batteryPromptShown: boolean; lastDeloadDate: string | null;
  restTimerAutoStart: boolean; hapticsEnabled: boolean;
}
export const DEFAULT_SETTINGS: AppSettings
export function getSettings(): AppSettings
export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void
export function useSettings(): AppSettings                        // live, re-renders on write
export function getRaw(key: string): string | undefined
export function setRaw(key: string, value: string): void
```

**Encoding:** every `setting.value` is `JSON.stringify`-ed — the seed writes
`"recomp"` (with quotes), `173`, `true`, `null`. `getSettings` must `JSON.parse`
each value inside a try/catch and fall back to `DEFAULT_SETTINGS` per key;
`setSetting` must `JSON.stringify`. `getRaw`/`setRaw` pass the stored text through
untouched (used for the `session:{id}:adhoc` JSON arrays).

---

## Services — `@/services/*`

### `notifications.ts`
```ts
export const CHANNELS = { rest: 'rest-timer', hydration: 'hydration', daily: 'daily' } as const
export async function ensureChannels(): Promise<void>              // MUST run before any post
export async function requestPermissions(): Promise<boolean>
export async function cancelTagged(tag: string): Promise<void>     // cancel-then-schedule = idempotent
export async function rescheduleAll(): Promise<void>               // app start, and after every water log
export async function scheduleHydration(): Promise<void>
export async function scheduleMorningWeighIn(): Promise<void>
export async function scheduleWeeklyReview(): Promise<void>
export async function registerCategories(): Promise<void>          // water quick-log 250/500
export function useNotificationResponses(): void                   // hook, mounted once in root layout
export async function openBatteryOptimisationSettings(): Promise<void>
```

Hard constraints from `docs/06`, all testable:
- Nothing scheduled outside `[wakeMinutes, sleepMinutes]`. Ever.
- Silent when at/above the pro-rated target — schedule nothing, send no encouragement.
- At most **one** catch-up nudge; slots >= 60 min apart.
- Channels created before first post or the notification is silently dropped.

### `restTimer.ts`
```ts
export async function startRest(sessionId: string, seconds: number, label?: string): Promise<void>
export async function cancelRest(): Promise<void>
export async function addSeconds(delta: number): Promise<void>
export function getPersistedEndsAt(): string | null                // from timer_state
export function useRestTimer(): {
  running: boolean; endsAt: string | null; remainingMs: number; totalMs: number;
  start(seconds: number, label?: string): void; cancel(): void; add(delta: number): void;
}
```

Rules from `docs/06` §1, non-negotiable:
- `endsAt` is written to `timer_state` **before** anything else, so a force-quit
  mid-rest resumes correctly.
- The countdown is always `endsAt - now`, recomputed per frame. **Never** accumulate
  ticks; `setInterval` is a display detail only and must not be the source of truth.
- An exact alarm (`allowWhileIdle`) is the firing source of truth.
- Delegates to the native foreground service when present, degrades to the
  notification path when not.

### `export.ts`
```ts
export async function exportJSON(): Promise<void>    // whole DB -> share sheet
export async function exportCSV(): Promise<void>     // per-table csv -> share sheet
export function buildJSONDump(): string
export function buildCSVs(): { name: string; csv: string }[]
```

---

## Components — `@/components/*`

All dumb, themed, no DB imports. Named exports, one component per file.

```ts
Screen        { title?, subtitle?, scroll?, padded?, right?, children }
Card          { children, style?, onPress?, tone?: 'default'|'accent'|'warning'|'danger' }
Stepper       { value, onChange, step, min?, max?, size?: 'gym'|'default', label?, suffix?, onLongPress? }
ChipRow       { options: {label,value}[], value, onChange, size?: 'gym'|'default' }
PrimaryButton { label, onPress, tone?: 'accent'|'neutral'|'danger', size?: 'gym'|'default', disabled?, icon? }
Ring          { progress, size, thickness?, label, sublabel?, tone? }
Sheet         { visible, onClose, title?, children }   // bottom sheet; never blocks the timer
TrendChart    { trend: Pt[], raw?: Pt[], height?, onScrub?, format? }
Bar           { value, max, tone }                     // volume-vs-landmark bars
StatTile      { label, value, hint?, tone? }
SectionHeader { title, right? }
EmptyState    { message, actionLabel?, onAction? }     // one sentence + the action. Never guilt.
ReasonLine    { text }                                 // the engine's plain-English reason
```

Tap targets: `hit.gym` (56) on anything in the logging flow, `hit.default` (44)
elsewhere. Primary actions live in the bottom third.

---

## Routes — `app/`

```
app/_layout.tsx                 DB init gate, notification handlers, GestureHandlerRootView
app/(tabs)/_layout.tsx          six tabs
app/(tabs)/index.tsx            Today
app/(tabs)/program.tsx
app/(tabs)/body.tsx
app/(tabs)/food.tsx
app/(tabs)/water.tsx
app/(tabs)/review.tsx
app/session/[id].tsx            active workout
app/session/summary/[id].tsx
app/program/[dayId].tsx         day editor
app/settings/index.tsx
app/settings/equipment.tsx
```

---

## Amendments made during the build

Recorded so the next session does not "fix" these back.

1. **`useLive` replaces `useLiveQuery`** (§Global decisions 2). Drizzle's hook starts
   every mount at `data = []` and fills it in an effect — a one-frame empty flash on
   every screen, i.e. the skeleton `docs/05` bans. `useLive(read, tables, deps)` in
   `@/db/live` reads synchronously on first render and re-reads on
   `addDatabaseChangeListener` for the listed tables. Table names are the SQLite
   (snake_case) names.
2. **New modules** not in the original contract:
   `@/db/repositories/equipment` (gym inventory), `@/db/repositories/mappers`
   (`toEngineSet`, `groupBy`, `parseIdList` — kept separate so repositories never
   import each other in a cycle), `@/services/hydration` (`hydrationTarget`,
   `hydrationPlan` — shared by the Water screen and the notification service),
   `@/features/session/prescription` (the only caller of `prescribe()`).
3. **`sessions.ts` additions:** `getSession`, `getSessionPlan`, `setSessionOrder`,
   `unskipExercise`, `isReadinessDone` / `markReadinessDone`. `endSession` returns
   `{ discarded }` — a session with no working sets is deleted rather than kept,
   otherwise opening and closing a workout would advance the routine cycle.
4. **`stats.writeSessionStats`** is the single writer of `exercise_session_stat`,
   used by both `endSession` and `rebuildAllStats`.
5. **`food.intakeBetween(from, to)`** added; `intakeHistory(days, endISO?)` gained
   the optional end date so targets can exclude the in-progress day.
6. **Export** writes into a folder picked with `Directory.pickDirectoryAsync()`:
   React Native's `Share` cannot share files on Android and `expo-sharing` is not
   installed. `exportAll()` is the entry point.
7. **Hydration "silent when ahead"** (docs/06) is implemented as: the first nudge
   may not land before pro-rata pace catches up with what he has drunk. The literal
   reading — schedule nothing — would leave a day he is ahead at 10:00 with no
   reminder at all, even after he falls behind.
8. **Water quick-log actions open the app briefly** to write the row. Logging fully
   in the background needs `expo-task-manager`, which is not installed.
9. **Bodyweight exercises at 0 kg added load** stay at 0 kg unless the engine says
   ADD_LOAD. `prescribe()`'s `done()` floors every load at one `loadStep`, which
   would otherwise add 2.5 kg to an unweighted pull-up every session. Handled in the
   adapter; the proper fix belongs in the engine with a test.
10. **Accepting a deload** in Review sets `lastDeloadDate`; for the next 7 days the
    adapter passes each prescription through the engine's `deloadPrescription()`.
