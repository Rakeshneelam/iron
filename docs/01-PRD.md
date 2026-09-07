# 01 — Product requirements

One user: Rakesh. 84 kg, 173 cm, Hyderabad. Trains a 4-day Upper/Lower split with
extra emphasis on arms, shoulders, traps and back. Currently in a recomposition /
slow-cut phase. Trains in a commercial gym with standard kit.

The app has to survive contact with a real gym: sweaty hands, one hand free, bad
light, a phone that Android wants to put to sleep. Everything below is subordinate
to that.

---

## Screen 1 — Today (the only screen that really matters)

Opens directly on the workout scheduled for today.

**Above the fold, without tapping anything:**
- Which day it is (`Upper A`), and the exercise list with progress (`3 of 6`)
- Current exercise, its target: `3 × 6–10 @ RIR 1`
- The prescription: `62.5 kg` with a one-line reason
- What he did last time for this exercise, per set

**Logging a set:**
- Weight and reps pre-filled with the prescription
- ± steppers, ≥56dp targets, bottom third of the screen, reachable with one thumb
- Weight step matches the equipment (2.5 kg barbell, 2 kg dumbbells, machine stack)
- Tap `Log set` → writes to SQLite immediately → rest timer starts automatically
- RIR entered on a 0–4 chip row, defaulting to the target. One tap, not a picker.
- Long-press a set to edit or delete it
- A `pain` toggle per set. When set, the engine backs that exercise off next time.

**During the session:**
- Rest timer runs as a foreground service with a notification. It must survive
  screen-off, app-switching and Doze. Haptic + sound at zero.
- Reorder exercises by drag. Add an exercise not in the plan. Skip one. None of
  these are treated as failure.
- Screen stays awake.

**Before the first set of the day:** a single prompt for morning bodyweight, and
optional sleep hours / soreness / stress chips. Skippable in one tap — the engine
degrades gracefully without them.

**On finish:** session summary. Total volume, per-lift changes vs last time, any
new e1RM highs. No celebration animation, no streak.

---

## Screen 2 — Program

- Create routines; a routine has days; a day has ordered exercise slots
- Each slot: exercise, target sets, rep range, target RIR, rest seconds, optional
  superset group
- The 4-day Upper/Lower routine ships seeded and active (`src/db/seed/`)
- Swapping an exercise offers to carry history across (see `03-DATA-MODEL.md`,
  `exercise_link`) so a variation change doesn't reset progression
- Renaming an exercise never loses history

---

## Screen 3 — Body

- One tap to log this morning's weight; big number entry, remembers last value
- Chart: **trend line prominent, raw dots faint.** Never the reverse.
- Weekly rate as % of bodyweight, against the phase band
- Phase selector: cut / recomp / maintain / bulk
- Weekly check-in card: "on track at −0.21%/wk" or a ±150 kcal suggestion
- Optional circumference measurements (waist, arm, chest, thigh)

---

## Screen 4 — Food

The realistic goal is that a normal day takes under 30 seconds to log.

- Today's totals vs target: kcal, protein, carbs, fat. Protein is displayed first —
  it's the one that matters in a recomp.
- **Repeat yesterday** and **saved meals** are the primary actions, not search
- His staple Indian foods ship seeded in real units: 1 roti, 1 katori dal, 1 cup
  rice, 1 scoop whey (`src/db/seed/foods-in.ts`)
- Custom foods and multi-ingredient recipes, saved once and reused
- Barcode scan is optional and offline-only if implemented (phase 6). Never a
  blocker.
- Targets come from the adaptive TDEE once there are 14 days of data; before that,
  a formula estimate, clearly labelled as an estimate.
- Zero nagging. A missed day is blank, not a red mark.

---

## Screen 5 — Water

- Big ring: consumed vs target
- Quick-add buttons for his actual glasses/bottles (250 / 500 / 1000 ml)
- Target = 33 ml/kg + 600 ml per training hour + heat bump above 30 °C and 38 °C.
  Hyderabad summer makes the heat bump matter for a good part of the year.
- Reminders are **debt-based**: recalculated after every log, silent when ahead,
  never outside waking hours. See `06-NOTIFICATIONS.md`.
- Log from the notification without opening the app

---

## Screen 6 — Review

Generated weekly, readable in thirty seconds:

- Lifts that progressed, lifts that stalled, with the e1RM trend for each
- Weekly hard sets per muscle vs MEV/MAV/MRV
- Deload recommendation with its reasons, if triggered — a proposal, never automatic
- Bodyweight trend vs phase target
- Average protein, and days logged
- A plain-language plateau note where relevant: "bench flat 3 sessions; chest volume
  is at 9 sets, below MAV — try the extra set before dropping load"

---

## Settings

- Phase, height, age, wake/sleep times, units (kg)
- **Gym inventory**: available plates, dumbbell rack increments, machine stack steps.
  This feeds load rounding so the app never suggests a weight he can't load.
- Export everything to JSON/CSV
- Encrypted backup to Google Drive (phase 8)

## Explicitly out of scope

Social, sharing, streaks, coaching content, video demos, wearable-first flows,
multi-user, cloud sync, subscriptions.
