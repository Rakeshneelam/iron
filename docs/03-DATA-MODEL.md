# 03 — Data model

Canonical definition lives in `src/db/schema.ts` (Drizzle). This document explains
the intent behind it. If the two disagree, the schema wins and this doc gets fixed.

## Conventions

- Primary keys are `text` UUIDs, generated client-side.
- Dates are ISO strings: `YYYY-MM-DD` for days, full ISO-8601 for instants.
- Weights in kg, volumes in ml, energy in kcal. No unit conversion anywhere in the
  DB; convert only at the display layer if ever needed.
- Booleans are `integer` 0/1.

## Tables

### `exercise`
The catalogue. `load_step` is the smallest increment *his gym can actually load* for
that movement — 2.5 kg for a barbell, 2 kg for the dumbbell rack, whatever the
machine stack uses. This is what stops the app suggesting 23.75 kg.

### `exercise_link`
`from_exercise_id → to_exercise_id`, with a `ratio`. Written when he swaps a
variation (incline DB press → incline machine press) and chooses to carry history
across. The progression engine reads linked history with the ratio applied, so
a swap doesn't reset progression to zero. **This is the feature no commercial app
gets right — don't drop it.**

### `routine` → `routine_day` → `routine_slot`
The plans. A slot is a planned exercise: target sets, rep range, target RIR, rest
seconds, position, optional `superset_group`, optional `start_weight` (used only
until the exercise has history). Any number of routines; at most one has
`active = 1`. `archived_at` hides a plan without deleting it (its days keep their
names in history). Templates in `src/db/seed/templates.ts` are COPIED into ordinary
routines — nothing references a template after creation.

### `session`
One workout. Holds `bodyweight_kg` taken that morning, plus optional readiness
inputs (`sleep_hours`, `soreness`, `stress`, `session_rpe`). `routine_day_id` is
nullable — an improvised workout is still a valid session.

`status`: `active` → in progress; `completed` → every planned exercise reached its
target sets; `partial` → finished with planned work missing or skipped; `skipped` →
the day was skipped on purpose (no sets, advances the cycle); `cancelled` → stopped
early, sets kept, does NOT count as done and does NOT advance the cycle. An empty
workout is deleted, never stored. Rows from before migration 0001 read `completed`.

### `session_exercise`
The workout's own exercise list, snapshotted from the plan at start: position,
`source` (`plan` | `added`), `skipped`, and the planned targets. Skips, additions,
swaps and reordering are today-only and never touch the plan; the snapshot is what
lets history and the export show planned vs done after the plan changes.

### `set_log`
The most important table. One row per set, written the instant it's logged.
`e1rm` is denormalised at insert so charts and trends never recompute it.
`pain_flag` drives the automatic back-off. `is_warmup` sets are excluded from every
volume and progression calculation.

Index: `(exercise_id, logged_at DESC)` — every progression query hits this.

### `exercise_session_stat`
Written at session close: best e1RM, tonnage, hard sets, top weight. Precomputed so
the review screen and charts are instant. Derivable from `set_log`, so it can be
rebuilt if it ever drifts.

### `weigh_in`, `measurement`
Bodyweight (one per day, keyed by date) and measurements. `measurement.cm` holds the
value in the site's unit — cm for circumferences, % for `bodyFat` — see
`src/features/body/sites.ts`. Trend smoothing
happens in the engine, never in SQL.

### `food`, `meal_log`, `recipe`, `recipe_item`
`food` holds both packaged items and his own entries, with `serving_g` and an
optional `serving_label` ("1 roti", "1 katori") so he logs in real units instead of
grams. `times_used` drives the quick-add ordering — the list reorders itself around
what he actually eats.

### `water_log`
Individual drink events with timestamps, not a daily total. The reminder scheduler
needs to know *when* he drank to compute debt correctly.

### `equipment`
Plates, dumbbells, bars, machine stacks available to him. Feeds `roundToStep` and
the plate calculator.

### `setting`
Key/value. Phase, height, age, wake/sleep minutes, hydration overrides, backup state.

## Rebuild rule

Everything except `set_log`, `session`, `session_exercise`, `weigh_in`, `measurement`,
`meal_log`, `water_log` and the plan tables is derived and can be regenerated. Those five are the irreplaceable ones —
they are what the backup exists to protect.
