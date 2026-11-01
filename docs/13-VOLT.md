# 13 — Volt: the visual language

Read this before drawing anything. The tokens are in `src/theme/tokens.ts`; this is
what they mean and how the screens use them.

## Why it exists

v0.7 drew every screen as a technical record: hairline rules, hollow marks for
plans, solid for logs, one orange "heat" for whatever was live. It was consistent
and it was hard to read at a glance. The user rejected it and asked for a
completely new UI and palette, taking cues from current fitness work on Dribbble.
v0.8 is the result: a near-black stage, one electric lime for training and action,
and a colour of its own for each thing you track.

The data, the engine and every behaviour are unchanged. Only the drawing moved.

## Palette

| Role | Token | Hex | Used for |
|---|---|---|---|
| Stage | `bg` | `#0C0C0E` | Every screen |
| Card | `surface` | `#17171A` | Dark cards, rows, chips |
| Raised | `surfaceHigh` | `#202024` | Controls on a card, the tab capsule |
| Ink | `text` / `textMuted` / `textFaint` | `#F6F6F7` / `#A2A2AC` / `#8A8A94` | Text, three strengths |
| **Volt** | `accent` | `#D6FF3D` | Training, the one action on a screen, a new best |
| Water | `cold` | `#8ED8FF` | Water, everywhere |
| Food | `peach` | `#FFB98A` | Food, everywhere |
| Body | `lav` | `#C3B3FF` | Weight, measurements, recovery |
| Third macro | `pink` | `#FFA6D6` | Fat; the live-workout dot on the tab bar |
| Tile ink | `onTile` / `onTileMuted` | `#0C0C0E` / `#3A3A40` | Text on any coloured tile |
| Tile band | `onTileWash` | 12% black | Progress tracks and quiet chips on a tile |
| Worth a look | `warning` | `#FFD25C` | A stall, a lighter week |
| Pain | `danger` / `dangerFill` | `#FF6B6F` / `#CC2F36` | Pain, and destroying data |

Rules:

- **Volt means training or "do this".** Never decoration, never a second button.
- **A colour is a tracker.** A sky tile is water before you read a word of it.
- **Coloured tiles carry near-black ink**, never white. `tests/theme-contrast.test.ts`
  checks both tile inks on all four tile colours, and every ink on every dark ground.
- **Red is pain and nothing else.** Not a missed day, not weight going up, not
  eating over a target.
- **A missed day is neutral**: a day without a dot. Nothing can be broken (AGENTS §6).

## Type

- **Plus Jakarta Sans** 400–800 — everything you read and tap.
- **Archivo Condensed, italic**, 700–900 — screen titles, today's workout name, the
  exercise you are on, and every big number.

Italic display type overhangs its box. Give such a `Text` a few points of right
padding or Android clips the last glyph.

## Shapes

- Every control is a pill (`radius.pill`). Cards are rounded slabs (`radius.lg`);
  hero cards are rounder (`radius.xl`).
- Cards have no outline. A border means state: selected, live (volt + glow), pain.
- Space separates groups. There are no rules between sections.

## The kit

| Component | What it is |
|---|---|
| `PrimaryButton` | A pill. A big accent one with an icon puts the icon in a dark "go" circle on the right |
| `Card` | `default` dark; `volt`, `sky`, `peach`, `lav` filled tiles; `accent`, `warning`, `danger` outlined |
| `DayStrip` | A week as seven pills, the chosen day volt, a dot under days with something in them |
| `DateStepper` | The day being read: its name, a Today pill, week arrows, and a `DayStrip` to tap |
| `MiniBars` | Rounded bars, one lit in its tracker's colour, optional value bubble; `onSelect` makes each bar a button |
| `Sparkline` / `TrendChart` | Lines. `TrendChart` takes `ink` so it can sit on a coloured tile |
| `Ring` | A progress ring in any tracker's tone |
| `EntryRow` | One logged entry (a drink, a weigh-in) as its own rounded row |
| `WeekdayPicker` | Seven equal circles, one letter each — never "Mo / n" |
| `LevelAvatar`, `LevelCard`, `BadgeGrid`, `RewardCard` | The level ring, the level, the badges, what a workout earned (`features/level`) |
| `Stepper` (hero) | Dark slab, round − (dark) and + (volt), the number in italic, last/target chips under it |
| Tab bar | A floating capsule of five round icons; the current one is a volt disc; a pink dot on Today while a workout is open |

## Screens

- **Today** — your initial in a level ring (→ You), the date, a greeting; the week
  as a `DayStrip`; the day's workout on a volt card (state chip, name, facts as
  chips) whose corner button changes the day or the length; the day's other
  choices as icon tiles — Rest day, Missed it, Other workout, Mobility — never
  behind a "More"; then tiles: Water (sky, + logs a glass), Food (peach, + opens the
  picker), Weight (lav, + logs a weigh-in right there) and the weekly goal ring.
  Start, Resume or Log a workout sits in the dock under the thumb.
- **Workout** — centred header with an `n/m` pill that opens the list; the exercise
  name in italic with a "⋯" for its own tools (how-to, swap, skip, remove, plates,
  warm-up sets); the verdict and facts as chips; today's sets as pills (a star on a
  new best); the reason on a dark card with Why?; the dock: weight and reps slabs,
  RIR and Pain, the rest strip (clock, −15 / +30 / Skip as text, a draining line —
  never a second pill on Log set), and Log set. The list sheet is the list, a
  warm-up row, Add exercise, and End workout / Cancel side by side.
- **Warm-up and cool-down** — one drill at a time; the countdown is a dark track
  with a volt arc and round controls; Done, then "Skip drill" for one or "Skip
  warm-up" for all.
- **Food** — the week strip; a peach ring of kcal left beside eaten and target;
  protein, carbs and fat tiles; meal cards with a peach + and usual foods as chips.
- **Water** — a dark card that fills with water toward the target; sky quick-add tiles.
- **Body** — Weight: the trend on a lavender card, range pills, this morning, recent
  weigh-ins. Measurements and Recovery. No settings here.
- **Progress** — twelve weeks of volume as bars (tap one to read that week), Workouts
  and Lifts up tiles, notes, suggestions, lift rows with a sparkline and a change chip.
- **Plans** — the active plan as a volt card with its days inside.
- **Summary** — a volt hero card, then the reward card: XP earned and where it came
  from, the level bar, a level-up, any badge unlocked.
- **You** (avatar) — level card, badges, profile, then Reminders, Backup & data,
  Haptics, Battery, Privacy. **Settings** (sliders) — Body · Training · Workout.

## Levels and badges

Loss-free by construction (AGENTS §6): `src/engine/level.ts` turns lifetime counts
into XP — 100 a workout, 3 a working set, 40 a personal best, 150 a weekly goal
reached, 10 a water-target day, 10 a food-logged day, 5 a weigh-in — and XP into a
level (250·L·(L−1) to reach level L) with a title. Badges are counts, never runs.
Nothing is stored: `db/repositories/level.ts` derives the counts from what was
logged, so a level cannot drift or be lost. "How XP works" on You lists every source.

## What was removed

`DayScore`, `LongRecord`, `LoadLine`, `SessionRail`, `SessionScore`, `WaterLevel` and
`IntakeBar` were the v0.7 instruments. The queries behind them are unchanged;
`weeksRecord` gained `tonnage` for the Progress bars.

After the first device test (0.8.0) these went too: the More sheet on Today, the
battery prompt on the summary (the row lives in You), the workout milestone tag
(badges cover it), Progress's Body & water section, the profile links in Body, the
"Use 75 kg" confirmation (a weight is now a button until given), and most of the
explanatory small print.
