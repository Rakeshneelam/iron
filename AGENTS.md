# AGENTS.md — read this first, every session

You are building **Iron** — a personal, single-user, local-first fitness app for one
person (Rakesh). It is not a product. There are no other users, no server, no
accounts, no monetisation. Optimise for *his* daily use, not for generality.

If you read only one file, read this one. Everything else is detail in `/docs`.

---

## 1. Hard rules — never violate these

1. **No backend. Ever.** SQLite on the device is the only source of truth. The only
   network call the app is allowed to make is an optional, user-initiated encrypted
   backup to the user's own Google Drive `appDataFolder`. No analytics, no crash
   reporting SaaS, no remote config, no ads, no telemetry.
2. **No accounts, no login, no onboarding wizard beyond a single settings screen.**
   The app opens straight into today's workout.
3. **Writes are immediate.** Every logged set hits SQLite the moment the user taps.
   Never hold a workout in React state and save "on finish" — the app will be killed
   in the background and the session must survive it.
4. **Never block the gym flow.** No confirmation dialogs, no modals, no "are you
   sure", no network waits on the logging screen.
5. **The suggestion engine advises; the user decides.** Every prescription must show
   a plain-English reason and must be overridable with one tap. Never silently change
   a weight, an exercise, or a program.
6. **Do not build the anti-features in §6.** They are excluded deliberately, based on
   research into why people abandon these apps.
7. **Ask before adding a dependency.** Prefer the platform. Every package is a
   liability in an app that must work offline for years.

---

## 2. What it does

Six surfaces, in priority order:

| # | Surface | Purpose |
|---|---|---|
| 1 | **Today** | The workout for today, logged set by set, with next-set suggestions |
| 2 | **Program** | Build/edit routines: a 4-day Upper/Lower split, exercises per day |
| 3 | **Body** | Morning bodyweight before training; smoothed trend, not raw dots |
| 4 | **Food** | Calories/macros with one-tap repeats of his real meals |
| 5 | **Water** | Daily target, quick log, debt-based reminders |
| 6 | **Review** | Weekly digest: what progressed, what stalled, is the phase on track |

The core intelligence is already written and tested in `src/engine/`. **Do not
rewrite it.** Wire it up.

---

## 3. Stack

- **React Native + Expo, development build** (not Expo Go — push/notification and
  native module limits make Expo Go useless here)
- **expo-router** for navigation
- **expo-sqlite** + **Drizzle ORM** — schema in `src/db/schema.ts`
- **expo-notifications** for local-only scheduled notifications
- **react-native-reanimated** + **react-native-gesture-handler** for motion
- **@shopify/react-native-skia** based charts (or `victory-native` v40+) for trends
- **expo-secure-store** for the backup encryption key
- TypeScript strict mode. No `any` in `src/engine/`.

> **Version numbers in `package.json` are indicative and may be wrong.** For every
> native module run `npx expo install <pkg>` so Expo resolves an SDK-compatible
> version. Do not hand-pin native deps.

Android is the primary target. iOS should compile but is secondary.

---

## 4. Repo layout

```
docs/          Specs. Read the one matching your ticket before writing code.
src/engine/    Pure TypeScript. No I/O, no React, no imports from the app. Tested.
src/db/        Drizzle schema + seed data (exercise catalogue, his routine, foods)
src/theme/     Design tokens. Never hardcode a colour or a spacing value in a screen.
tests/         node:test suites for the engine. Must stay green.
```

Everything else (`app/`, `src/components/`, `src/features/`) you create as you go,
following `docs/02-ARCHITECTURE.md`.

---

## 5. How to work

- Work through `docs/08-BUILD-PLAN.md` **in order**. Each phase is shippable. Do not
  start phase N+1 until phase N runs on a device.
- Before writing code for a ticket, read the doc it references.
- After any change to `src/engine/`, run `npm test`. It must pass.
- Commit per ticket, message format: `feat(phase-2): log sets to sqlite`.
- If a spec is ambiguous, choose the option that is **faster in the gym** and write
  your reasoning in the commit body. Do not stall waiting for clarification.
- If a spec is *wrong* — you find evidence it will not work — say so and propose the
  fix rather than silently working around it.

**Definition of done for a ticket:** it runs on a physical Android device, data
survives force-quitting the app, `npm test` is green, and no `console.log` remains.

---

## 6. Anti-features — do NOT build these

Each one is excluded because of documented user harm, not taste.

| Excluded | Why |
|---|---|
| Streaks, badges, XP, "don't break the chain" | All-or-nothing framing is the top driver of tracking abandonment; one missed day makes people quit entirely. Missed days are neutral here. |
| Social feed, sharing, leaderboards | Single user. There is no audience. |
| Fixed-interval reminder spam | The most common complaint in every water app's reviews. Reminders are debt-based and silent when he's ahead. See `docs/06-NOTIFICATIONS.md`. |
| Automatic exercise rotation / "AI picks your workout" | The single most-cited complaint about Fitbod. Stable exercise selection is better for hypertrophy and for tracking progression. |
| Opaque suggestions | Every number shows its reasoning. |
| Nagging about accuracy ("you didn't weigh this!") | Precision perfectionism kills the logging habit. "Good enough" logging that continues beats perfect logging that stops. |
| Paywalls, tiers, upsells, ads, accounts | Non-problems in a single-user local app. Do not build defences for them either — no sync-conflict resolution, no multi-device merge. |
| Daily raw-weight celebration/alarm | Daily scale weight swings 1–2 kg on water alone. Only the trend is shown prominently. |

---

## 7. Things that must feel good

The user asked for "smooth as butter". Concretely:

- 60fps everywhere. All animation on the UI thread via Reanimated worklets — never
  `Animated` with `useNativeDriver: false`.
- Set logging: **one thumb, no zoom, no scrolling mid-set.** Steppers with ≥56dp tap
  targets, bottom-anchored.
- Screen stays awake during an active session (`expo-keep-awake`).
- Previous session's numbers pre-filled and visible without tapping anything.
- Rest timer is a foreground service, not a JS timer. It survives backgrounding,
  screen-off and Doze. This is the highest technical risk in the project — see
  `docs/06-NOTIFICATIONS.md` and do it properly the first time.
- No spinners on local reads. SQLite is fast; if something feels slow, it's a bad
  query, not a loading state to paper over.
