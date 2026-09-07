# Iron — a personal, local-first fitness app

Single-user. Offline. All data in a SQLite file on the phone. Optional encrypted
backup to your own Google Drive. No server, no account, no subscription.

| | |
|---|---|
| Workouts | Routine builder (4-day Upper/Lower seeded), set-by-set logging, RIR-based progression suggestions |
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
