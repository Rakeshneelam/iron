# 02 — Architecture

## Principles

1. **SQLite is the state.** React holds view state; it does not hold truth. Any
   value that must survive a force-quit is written the moment it's produced.
2. **The engine is pure.** `src/engine/*` imports nothing from React, the DB, or any
   native module. It takes plain objects and returns plain objects. This is what
   makes it testable, and what lets you replay history against a changed rule.
3. **Repositories are the only place SQL lives.** Screens call repository functions,
   never Drizzle directly.
4. **Feature folders, not type folders.** Everything for a feature sits together.

## Layout

```
app/                          expo-router routes
  (tabs)/
    index.tsx                 Today
    program.tsx
    body.tsx
    food.tsx
    water.tsx
    review.tsx
  session/[id].tsx            active workout
  settings/…

src/
  engine/                     PURE. progression.ts, metabolic.ts. Tested. Don't rewrite.
  db/
    schema.ts                 Drizzle schema — the single definition of the DB
    client.ts                 opens the DB, runs migrations, seeds on first launch
    seed/                     exercise catalogue, the Upper/Lower routine, foods
    repositories/             sessions.ts, exercises.ts, food.ts, water.ts, body.ts
  features/
    session/                  logging UI, set row, rest timer, prescription card
    program/
    body/
    food/
    water/
    review/
  components/                 Stepper, Chip, Ring, Sheet, TrendChart — dumb, themed
  theme/tokens.ts             colours, spacing, radii, type scale, motion
  services/
    notifications.ts          scheduling + rescheduling. See 06-NOTIFICATIONS.md
    restTimer.ts              foreground-service bridge
    backup.ts                 Drive appDataFolder. See 07-BACKUP.md
  lib/                        date helpers, load rounding, formatting

tests/                        node:test suites over src/engine
```

## Data flow for the hot path (logging a set)

```
tap "Log set"
  → repositories/sessions.insertSet()      // synchronous write, no await on UI
  → optimistic UI update (Reanimated, no re-render of the list)
  → restTimer.start(restSeconds)           // foreground service
  → engine recompute is DEFERRED to next-exercise or session-end
```

Do not run the progression engine on every keystroke. Run it:
- when an exercise is opened (to produce the prescription), and
- at session close (to store per-exercise e1RM and update trends).

## State

- **Server state:** none. There is no server.
- **DB state:** read through repositories; cache with a small Zustand store per
  feature, invalidated on write. Do not install a data-fetching library.
- **View state:** local `useState`. Animation state lives in Reanimated shared
  values so it never crosses the JS bridge on the hot path.

## Performance rules

- Exercise history queries use the `idx_setlog_ex_date` index; never scan `set_log`.
- Precompute and store `e1rm` on the set row at insert time.
- Precompute per-session, per-exercise aggregates at session close into
  `exercise_session_stat` so charts and the review screen never aggregate at render.
- Charts render from at most ~200 points; downsample beyond that.
- `FlashList` (or `FlatList` with `getItemLayout`) for any list that can exceed a
  screen.

## Migrations

Drizzle Kit generates SQL migrations from `schema.ts`. They run on app start, in
order, inside a transaction. Never edit a migration that has already run on the
device — add a new one. The DB is a real user's years of training data; treat it
like production, because it is.

## Error handling

Local-only means most failure modes are programmer error. Fail loudly in dev, never
lose data in production: wrap writes in transactions, and if a write throws, keep the
value in memory and retry rather than showing an error the user can't act on.
