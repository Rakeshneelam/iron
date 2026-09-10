# rest-timer — local Expo module (Android)

The rest timer's native half, per `docs/06-NOTIFICATIONS.md` Rule 1.

> **Status: NOT yet compiled or run on a device.** It was written without a local
> Android SDK; the first EAS build is its first compile. Treat it as unverified until
> the device tests below pass.

## How it works

| Piece | Job |
|---|---|
| `RestTimerController.start()` | persists `endsAt`, schedules the exact alarm, starts the service |
| `RestTimerService` | foreground service, ongoing notification; Android's chronometer renders the countdown, so nothing ticks in JS |
| `AlarmManager.setExactAndAllowWhileIdle` | **source of truth for firing** — Doze cannot defer it |
| `RestTimerAlarmReceiver` | at `endsAt`: stops the service, posts "Rest over", vibrates |

The JS side (`src/services/restTimer.ts`) writes `endsAt` to SQLite **first**, then
calls this module. The UI countdown is always `endsAt - now`, so it is correct after
a force-quit whether or not this module exists. Where the module is absent (iOS,
Expo Go) JS schedules an expo-notifications date trigger instead.

## Why `shortService`

Android 14+ requires every foreground service to declare a type. The original
`app.json` declared `FOREGROUND_SERVICE_MEDIA_PLAYBACK` — wrong for a timer, and a
Play-policy violation. `shortService` is purpose-built for brief user-initiated work
and needs no extra permission.

**Its ceiling is ~3 minutes.** For longer rests (the seeded heavy lifts use 180 s,
right at the edge) Android calls `onTimeout`, the service stops and the live
countdown disappears — **but the exact alarm still fires on time**. If longer live
countdowns matter, switch to `specialUse` with a justification string.

Exact alarms: `SCHEDULE_EXACT_ALARM` is user-revocable on Android 12+. When it is not
granted the module falls back to `setAndAllowWhileIdle`, which Doze may delay by
minutes. `USE_EXACT_ALARM` (declared in app.json) is auto-granted for alarm/timer apps.

## Device tests that must pass (docs/06 §7)

1. Rest timer with screen off for 3 minutes → fires on time
2. Rest timer with app swiped away → fires, notification still counts down
3. Rest timer with battery optimisation ON → fires (or a warning is shown)
4. Hydration reminder after 4 hours in Doze → fires within a minute
5. Reboot with pending reminders → all rescheduled
6. Log water from the notification with the app closed → row written, schedule recomputed
7. Sleep window 22:30–06:30, 1 L behind at 23:00 → **nothing fires until morning**

Tests 1–3 exercise this module directly.
