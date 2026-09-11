# Iron — a personal, local-first fitness app

Single-user. Offline. All data in a SQLite file on the phone. Optional encrypted
backup to your own Google Drive. No server, no account, no subscription.

| | |
|---|---|
| Workouts | Multiple plans from ~19 evidence-informed templates or custom, set-by-set logging, RIR-based progression with reasons, warm-ups and warm-up sets generated from the session, short-workout mode, swaps for your equipment |
| Library | ~90 exercises and ~45 warm-up/mobility/stretch drills with cues, mistakes, animated demos and an anatomy muscle map |
| Body | Morning bodyweight, smoothed trend, phase tracking |
| Food | Calories/macros, one-tap meal repeats, adaptive TDEE |
| Water | Debt-based reminders that stay quiet when you're ahead |
| Review | Weekly digest: what progressed, what stalled |

## For the coding agent

Read **`AGENTS.md`** (or `CLAUDE.md`) first, then `docs/08-BUILD-PLAN.md`. Work the
phases in order.

## Getting started

```bash
npm install
npm test                 # engine tests — must be green before you touch anything

# scaffold the Expo app in place (phase 1, ticket 1.1)
npx create-expo-app@latest . --template blank-typescript   # merge, don't overwrite
npx expo install expo-sqlite expo-notifications expo-keep-awake expo-secure-store
npx expo run:android     # dev build — Expo Go will NOT work for this app
```

## Docs

| File | What's in it |
|---|---|
| `docs/01-PRD.md` | What each screen does and why |
| `docs/02-ARCHITECTURE.md` | Folder layout, data flow, state rules |
| `docs/03-DATA-MODEL.md` | Tables, relationships, migrations |
| `docs/04-ALGORITHMS.md` | Progression + metabolic engine behaviour |
| `docs/05-DESIGN-SYSTEM.md` | Tokens, type scale, motion, gym-usability rules |
| `docs/06-NOTIFICATIONS.md` | Android reliability. The riskiest part of the build. |
| `docs/07-BACKUP.md` | Encrypted Drive appDataFolder backup/restore |
| `docs/08-BUILD-PLAN.md` | Phased tickets, in build order |

## Sharing it with friends

Everyone installs the same APK. Each phone keeps its own database: a fresh install
opens a one-screen setup (name, body stats, goal, pick a plan), and nothing is ever
shared between phones. Export (Settings → Your data) writes a structured JSON file
anyone can hand to a coach or an AI model, plus CSVs and a full backup.

## Build an APK and install it

This machine has no Android SDK, so APKs are built in the cloud with EAS. Every
profile in `eas.json` emits a sideloadable `.apk` (never an AAB — this app is not
going to the Play Store).

```bash
npx eas-cli login                                # once — free Expo account
npx eas-cli init                                 # once — links this folder to an EAS project
npx eas-cli build -p android --profile preview   # ~10–30 min on the free queue
```

Open the link it prints on the phone, download the `.apk`, allow "install unknown
apps" for your browser, install. The JS is bundled in: no dev server, no Expo Go.

Before spending a build slot, check locally — each of these catches a different
class of failure that would otherwise surface 15 minutes into the cloud build:

```bash
npm test                                  # engine: 42 tests
npm run typecheck                         # app + tests projects
npx expo export --platform android        # Metro bundle (.sql imports, module resolution)
```

The native rest-timer module (`modules/rest-timer`) is only compiled by the cloud
build. See its README for the device tests it still has to pass.
