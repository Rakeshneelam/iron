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
    index.tsx                 Today      — the workout, first
    food.tsx                  Food
    body.tsx                  Body       — Weight · Recovery · Measurements
    program.tsx               Plans
    review.tsx                Progress
    daily.tsx                 REDIRECT to /body?section=weight. href: null.
  water.tsx                   a detail screen off Today and Food, not a tab
  session/[id].tsx            active workout
  session/summary/[id].tsx    a finished workout, and any workout in history
  history/index.tsx           paged, searchable workout history
  weight/history.tsx          every weigh-in
  plan/schedule.tsx           THE training-schedule editor (weekdays + duration)
  settings/…                  six destinations; see §Settings below

src/
  engine/                     PURE. progression.ts, metabolic.ts. Tested. Don't rewrite.
  db/
    schema.ts                 Drizzle schema — the single definition of the DB
    client.ts                 opens the DB, runs migrations, seeds on first launch
    seed/                     exercise catalogue, the Upper/Lower routine, foods
    repositories/             sessions.ts, exercises.ts, food.ts, water.ts, body.ts
  features/
    session/                  logging UI, set row, rest timer, prescription card
                              order.ts (next-pending search), cancel.ts (one cancel)
    program/                  schedule.ts — rotation vs scheduled days, one resolver
    body/                     WeightField + the three Body sections
    checkin/                  CheckInSheet (any date) + the compact Today row
    food/
    water/
    exercises/                guides, and media/ — see §Exercise media
  components/                 Stepper, Chip, Ring, Sheet, TrendChart — dumb, themed
  theme/tokens.ts             colours, spacing, radii, type scale, motion
  services/
    notifications.ts          scheduling + rescheduling. See 06-NOTIFICATIONS.md
    restTimer.ts              foreground-service bridge
    backup.ts                 Drive appDataFolder. See 07-BACKUP.md
  lib/                        date helpers, load rounding, formatting, haptics,
                              deepLinks.ts (notification → route normalisation)

tests/                        node:test suites over src/engine AND the repositories
```

## Navigation: five tabs

**Today · Food · Body · Plans · Progress.** There were six, and two of them
overlapped: a `Daily` tab owned the check-in, weight and sleep while `Body` owned
measurements and a profile editor, so Today and Daily both opened with the same
check-in card and Body excluded the one body measurement taken daily.

- **Daily is gone as a destination.** Its content is `features/body/WeightSection`
  and `RecoverySection`, rendered by Body's section selector — moved, not copied.
  The route survives as a redirect because reminders scheduled by older versions
  carry `/daily` in their payload, and it is declared in `(tabs)/_layout.tsx` with
  `href: null` so automatic tab discovery cannot put a sixth tab back.
- **Body's section is route-addressable** (`/body?section=measurements`) so a deep
  link lands on what it was about, and is otherwise remembered across tab switches.
- **Notification destinations are normalised at the boundary**, in
  `lib/deepLinks.ts` — never in the engine, which stays pure and keeps emitting the
  URLs it always has. `/daily` and a bare `/body` resolve to Weight;
  `type: 'measurements'` resolves to Measurements.
- **Profile fields live in Settings → Profile & goals**, and nowhere else.

## One editor per thing

A contextual shortcut opens the canonical editor. It never grows its own copy of
the form — that is how the same value ends up with two validation rules.

| Thing | The one editor | Shortcuts into it |
|---|---|---|
| Weight for a date | `features/body/WeightField` | check-in sheet, weigh-in sheet, Today's row |
| A check-in (any date) | `features/checkin/CheckInSheet` | Today's row, Body → Recovery |
| Profile and both goals | `app/settings/profile.tsx` | Body, Food targets, Settings |
| Training schedule | `app/plan/schedule.tsx` | Plans, Settings → Training preferences |
| A logged set | `features/session/EditSetSheet` | session screen, workout history |
| Food and recipes | `features/food/AddFoodSheet` | every meal, saved recipes, empty diary |

Two rules that follow from this, both learned from bugs:

- **An untouched default is not an answer.** `WeightField` keeps the number and the
  assertion separate (`given`), so a prefilled weight can never become a weigh-in,
  and there is an explicit "Use 84.0 kg" for when the real answer equals the
  default. Same rule in the measurement sheet's "Same, 84.0".
- **Only committed data says "Saved."** Anything pending says what will happen
  ("Will save with the check-in").

## Rotation vs scheduled days

Two numbers, repeatedly used as one. A plan holds a **rotation** — Day A, B, C, run
in order whatever the calendar says. `settings.trainingDays` holds the **weekdays**
you intend to train on, which is what reminders fire against and what "planned this
week" counts. A four-workout rotation trained three days a week is ordinary.

`features/program/schedule.ts` owns both the resolver (`weeklyTarget`) and the
sentence (`scheduleLabel`). Today, Plans, Settings and `repositories/progress.ts`
all go through it. Nothing about engine progression changed.

## Settings

Six destinations, each owning its detail, nothing owned twice:

`Profile & goals` · `Training preferences` · `Equipment` · `Reminders` ·
`Backup & restore` · `Your data`

Quiet hours belong to Reminders. The equipment preset and tool list belong to
Equipment. The training schedule is a link to the Plans-side editor, not a copy.

## Exercise media

`features/exercises/media` renders real demonstration artwork when any is bundled
and falls back to the drawn stick figure when none is. **The registry ships empty.**
The obvious source (the Gym visual frames in `hasaneyldrm/exercises-dataset`) is MIT
for its JSON and explicitly *not* licensed for redistribution for its images —
"cloning this repo is not a license". `npm run media:import` fills the registry from
a local clone once you hold a licence; it refuses without one, writes into a
git-ignored folder, and wires the required credit in. The stick figure stays because
without that licence the alternative is an empty box.

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
