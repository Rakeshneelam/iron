# 08 — Build plan

Work these in order. **Each phase must run on a physical Android device before the
next one starts.** The failure mode for a personal project this size is a half-built
app with six features at 60%; the mitigation is shipping phase by phase.

Phases 1–3 alone already beat every commercial app for this user's specific case.

---

## Phase 1 — Foundation (weekend)

- **1.1** Scaffold Expo dev build in place: `npx create-expo-app` + expo-router.
  Merge with the existing files; do not overwrite `src/`, `docs/`, `AGENTS.md`.
  Verify `npx expo run:android` installs on a real device.
- **1.2** Wire `expo-sqlite` + Drizzle. Generate the first migration from
  `src/db/schema.ts`. Run migrations on start.
- **1.3** Seed on first launch: exercise catalogue, equipment, the Upper/Lower
  routine, the Indian food staples. Idempotent — re-running must not duplicate.
- **1.4** Theme tokens + tab shell (six tabs, empty screens).
- **1.5** Repositories with the queries phases 2–3 will need, plus their indexes.

**Done when:** app opens on the device, DB file exists, seeded routine is queryable.

## Phase 2 — Logging (weekend)

- **2.1** Today screen: reads the active routine, resolves today's day, lists slots.
- **2.2** Set row: stepper-based weight/reps, RIR chips, log button. ≥56dp targets,
  bottom third, one-handed. Writes to SQLite on tap, computes and stores `e1rm`.
- **2.3** Previous-session panel, pre-filled values, per-set history.
- **2.4** Rest timer as a **foreground service + exact alarm** — read
  `06-NOTIFICATIONS.md` in full first. Survives screen-off and app-switch.
- **2.5** Session lifecycle: start, morning bodyweight + readiness prompt (skippable),
  reorder, add ad-hoc exercise, skip, finish, summary.
- **2.6** `expo-keep-awake` during a session. Haptics on every commit.

**Done when:** a full workout is logged one-handed, the app is force-quit mid-session
and reopens exactly where it was, and the timer survives the screen going off.

## Phase 3 — Progression (2–3 evenings)

- **3.1** Wire `prescribe()` into the Today screen. Show weight, rep target, RIR
  target, and the reason line.
- **3.2** Load rounding against the `equipment` table + a plate calculator sheet.
- **3.3** Warm-up ramp from `buildWarmups()`, collapsible.
- **3.4** Pain flag per set → automatic back-off next session.
- **3.5** Write `exercise_session_stat` at session close.
- **3.6** Accept/override UI. Overrides are logged so the engine sees reality.

**Done when:** every exercise opens with a defensible suggested weight and a reason.

## Phase 4 — Bodyweight (1 evening)

- **4.1** Weigh-in entry, one tap from Today, remembers the last value.
- **4.2** Trend chart: EWMA line prominent, raw dots faint.
- **4.3** Weekly rate as % bodyweight, phase selector, `phaseCheck()` card.

## Phase 5 — Water (1 evening)

- **5.1** Target from `hydrationTargetMl()`; ring UI; quick-add buttons.
- **5.2** `scheduleHydration()` → notification service. Waking hours only, silent
  when ahead, recomputed on every log.
- **5.3** Quick-log actions on the notification.

**Done when:** the §7 test in `06-NOTIFICATIONS.md` passes — 1 L behind at 23:00
fires nothing until morning.

## Phase 6 — Nutrition (week)

- **6.1** Food + meal_log repositories, day view, macro totals (protein first).
- **6.2** **Repeat yesterday** and saved meals as the primary actions.
- **6.3** Custom foods and recipes in real units (roti, katori, scoop).
- **6.4** `adaptiveTDEE()` + `dailyTargets()`; label estimates as estimates until
  14 days of data exist.
- **6.5** *Optional:* bundled Open Food Facts India subset + offline barcode scan.
  Filter the dump offline; never ship the full 40+ GB dataset. ODbL — keep the
  attribution.

**Done when:** a normal day is logged in under 30 seconds.

## Phase 7 — Analytics (week)

- **7.1** Per-lift e1RM chart with the trend line and stall markers.
- **7.2** Weekly volume per muscle vs MEV/MAV/MRV.
- **7.3** Deload proposal card with its reasons — proposal only.
- **7.4** Weekly review digest in plain language.
- **7.5** Plateau autopsy: when a lift stalls, show volume, bodyweight, sleep and
  protein around it.
- **7.6** *Stretch:* replay engine — rerun history against a modified rule and diff.

## Phase 8 — Durability (2–3 evenings)

- **8.1** Export everything to JSON + CSV via the share sheet. **Ship this first.**
- **8.2** Google Drive `appDataFolder` encrypted backup, resumable upload.
- **8.3** Restore flow with schema validation and a named-date confirmation.
- **8.4** Recovery phrase shown once in Settings.

---

## Later, only if wanted

Health Connect readiness inputs (steps, HR, sleep) · home-screen widget · Wear OS
companion · light theme · iOS build.

## Cut list — if time runs short, drop in this order

Barcode scanning → replay engine → plateau autopsy → measurements → Drive backup
(keep plain export) → light theme.

Never cut: immediate writes, foreground-service rest timer, load rounding, trend
smoothing, waking-hours-only reminders.
