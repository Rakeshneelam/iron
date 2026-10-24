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
| `Stepper` (hero) | Dark slab, round − (dark) and + (volt), the number in italic, last/target chips under it |
| Tab bar | A floating capsule of five round icons; the current one is a volt disc; a pink dot on Today while a workout is open |

## Screens

- **Today** — initial, date and a greeting; the week as a `DayStrip`; the day's
  workout on a volt card (state chip, name, facts as chips); Day and Length chips;
  Rest day / Missed it / More; then tiles: Water (sky, + logs a glass), Food (peach,
  + opens the food picker), Weight (lav, trend and sparkline), This week (dark).
  Start, Resume or Log a workout sits in the dock under the thumb.
- **Workout** — centred header with an `n/m` pill that opens the list; the exercise
  name in italic; the verdict and facts as chips; today's sets as pills (logged,
  now, to come; tap a logged one to fix it); the reason on a dark card with Why?;
  the dock: weight and reps slabs, RIR pills and Pain, the rest pill with its ring,
  and Log set.
- **Food** — the week strip; a peach ring of kcal left beside eaten and target;
  protein, carbs and fat tiles; meal cards with a peach + and your usual foods as chips.
- **Water** — a dark card that fills with water toward the target; sky quick-add tiles.
- **Body** — Weight: the trend on a lavender card with its chart, range pills, this
  morning's reading, recent weigh-ins. Measurements and Recovery keep their sections.
- **Progress** — twelve weeks of volume as bars (tap one to read that week),
  Workouts and Lifts up tiles, the week's notes, suggestions, lift rows with a
  sparkline and a change chip.
- **Plans** — the active plan as a volt card with its days inside.
- **Summary** and **Exercise** — a volt hero card with the headline figure and chips.

## What was removed

`DayScore`, `LongRecord`, `LoadLine`, `SessionRail`, `SessionScore`, `WaterLevel` and
`IntakeBar` were the v0.7 instruments. The queries behind them are unchanged;
`weeksRecord` gained `tonnage` for the Progress bars.
