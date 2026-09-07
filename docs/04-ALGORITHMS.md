# 04 — Algorithms

Implemented in `src/engine/progression.ts` and `src/engine/metabolic.ts`, covered by
`tests/`. **These are written and tested. Wire them up; do not rewrite them.**

If you believe a rule is wrong, change it in one place, run `npm test`, and update
the test that encodes the old behaviour — never fork the logic into a screen.

---

## Progression — RIR-gated double progression

Reps climb within the range; when the top of the range is cleared at the target
effort, load steps up and reps reset to the bottom.

```
look at last session's sets at the top weight:
  pain flagged                            → BACKOFF 15%
  min reps < rep_lo − 1                   → BACKOFF 5%
  min reps = rep_lo − 1                   → HOLD
  min reps ≥ rep_hi AND RIR ≥ target      → ADD_LOAD  max(one step, 2.5%)
  min reps ≥ rep_hi AND RIR < target      → HOLD (earn it cleanly first)
  else if e1RM trend flat over 3 sessions:
        weekly sets < MAV                 → ADD_SET
        2 prior resets on this lift       → SWAP variation
        else                              → RESET −10%
  else                                    → ADD_REPS (+1 rep target)

× readinessModifier (0.90–1.00)
floored at last weight − one step
rounded to the equipment's real increment
```

Two deliberate choices, both worth defending in review:

- **Readiness only ever scales load down.** Sleeping well does not earn weight;
  clearing the rep range does. Self-reported readiness is noisy — using it to add
  load is how algorithmic apps lose users' trust.
- **A bad day can't erase a month.** The floor means the worst outcome on a terrible
  day is repeating one step lighter.

### Supporting signals
- **e1RM** — RIR-adjusted, Epley/Brzycki blend, effective reps clamped at 15 (past
  that the estimate is fiction).
- **Trend** — least-squares slope of best e1RM over the last 5 sessions.
- **ACWR** — 7-day tonnage ÷ 28-day tonnage. Above 1.5 means volume ramped faster
  than adaptation.
- **Volume landmarks** — weekly hard sets per muscle against MEV/MAV/MRV.
- **Warm-up ramp** — generated from the working weight; more steps for compounds.

### Deload
Fires when **two or more** hold: half the lifts flat or regressing, ACWR > 1.5,
average RIR under 1 for a week, four low-readiness days, eight weeks since the last
break. It shows its reasons and proposes half the sets at 90% load with RIR +2.
**It never applies itself.** He accepts or dismisses.

---

## Metabolic

### Bodyweight
EWMA, α = 0.1 (≈10-day window). Weekly rate expressed as % of bodyweight. Daily
scale weight moves 1–2 kg on water alone — the UI shows the trend line prominently
and the raw dots faintly, never the other way round.

### Adaptive TDEE
After 14 days of logged intake *and* weigh-ins:

```
TDEE ≈ mean(intake) − (Δ trend weight × 7700 kcal/kg) / days
```

This is his actual maintenance, measured. Mifflin-St Jeor is the cold start only,
and is labelled "estimate" in the UI until real data replaces it. Returns `null`
when the data isn't there, so the UI says "keep logging" instead of showing a
confident wrong number.

### Targets
Phase bands: cut −18%, recomp −8%, maintain 0, bulk +10%. Protein 2.0–2.2 g/kg,
fat floor 0.8 g/kg, carbs take the remainder. Optional calorie cycling: +8% on
training days, −8% on rest days, same weekly total.

### Weekly check-in
Compares actual rate against the phase band and suggests a ±150 kcal nudge. One
decision per week, never a daily judgement.

### Hydration
Target = 33 ml/kg + 600 ml per training hour + 400 ml above 30 °C + another 300 ml
above 38 °C.

Reminders are **debt-based**, not a fixed drumbeat: after every log the schedule is
recomputed from what's still owed and how much waking day is left, spaced at least
an hour apart, capped per nudge. If he's ahead, it schedules nothing. That silence
is the feature — fixed-schedule reminders get muted within a week.

---

## Replay (phase 7, high value)

Because the engine is pure, you can run the whole set-log history through a modified
rule set and diff the outcome against what actually happened. Build this as a
developer screen: it turns "should I use RIR 1 or RIR 2 targets" from an argument
into a measurement. No other app has it.
