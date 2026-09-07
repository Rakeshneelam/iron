# 06 — Notifications and the rest timer

**This is the highest-risk part of the build.** It is where every competing app gets
one-star reviews. StrongLifts' own support documentation concedes that almost every
reported timer failure comes down to device battery settings, and that ongoing
workouts and timers can be lost when the app is battery-restricted. Get this right
the first time and the rest of the app is straightforward.

---

## Rule 1 — never use a JavaScript timer for anything that matters

`setInterval` / `setTimeout` stop when the JS thread is suspended. On a locked
Android phone that happens within minutes. A rest timer built on `setInterval` will
work in the simulator, work in your hand, and fail on the bench.

**Rest timer implementation:**
1. A **foreground service** with an ongoing notification showing the countdown, so
   Android will not kill it and he can see the time without unlocking.
2. An **exact alarm** scheduled for the end time, as the source of truth for firing.
3. The UI countdown is computed from `endsAt - now` on each frame. If JS was
   suspended, the number is still correct when the app resumes.
4. Persist `endsAt` to SQLite. If the app is killed and reopened mid-rest, the timer
   resumes from the stored value.

Never derive elapsed time by accumulating ticks. Always compute from timestamps.

## Rule 2 — declare and request the right permissions

- `POST_NOTIFICATIONS` — runtime request on Android 13+. Without it, nothing appears.
- `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` — Android 12+. Without exact alarms,
  Doze defers your reminder by minutes to hours.
- `RECEIVE_BOOT_COMPLETED` — reschedule everything on reboot or all pending
  notifications vanish.
- `FOREGROUND_SERVICE` — for the rest timer.

Create the Android notification channels explicitly at startup (`rest-timer`,
`hydration`, `daily`). A notification posted to a channel that doesn't exist is
silently dropped — this is the single most common cause of "it works on my phone".

## Rule 3 — ask once about battery optimisation, then stop

On first launch after the first workout, show one card: *"Android may stop the rest
timer when the screen is off. Allow Iron to run unrestricted?"* with a button that
opens the battery-optimisation settings. If he declines, never ask again — put it
in Settings.

## Rule 4 — reschedule defensively

Pending notifications are lost on reboot, on app update, and sometimes on force-stop.
Re-derive and re-schedule the full set on every app start, and after every water log.
Scheduling is idempotent: cancel by tag, then schedule.

---

## Hydration scheduling

Driven by `scheduleHydration()` in `src/engine/metabolic.ts`. The engine returns
slots; this service turns them into OS notifications.

Hard constraints:

- **Waking hours only.** Nothing between his configured sleep and wake times. Ever.
  A 2am water reminder is how an app gets uninstalled.
- **Silent when ahead.** If consumption is at or above the pro-rated target for the
  time of day, schedule nothing. Do not send an encouraging message instead.
- **Recompute on every log.** Cancel the pending hydration set, recompute from
  current debt and remaining waking minutes, reschedule.
- **At least 60 minutes apart**, and no more than one "catch-up" nudge — if he's
  600 ml behind, say so once rather than firing three reminders in an hour.
- **Actionable.** The notification carries quick-log actions (250 / 500 ml) that
  write to SQLite without opening the app, then trigger a reschedule.
- Low importance channel: visible, no full-screen intent, no sound after 20:00.

## Other notifications

| Type | When | Channel |
|---|---|---|
| Rest timer | Set logged | `rest-timer` (ongoing, foreground service) |
| Hydration | Debt-based, waking hours | `hydration` (low importance) |
| Morning weigh-in | Once, at wake time, training days only | `daily` |
| Weekly review | Sunday evening | `daily` |

That is the complete list. Adding more is an anti-feature — see `AGENTS.md` §6.

## Test matrix — a ticket is not done until these pass on a physical device

1. Rest timer with screen off for 3 minutes → fires on time
2. Rest timer with app swiped away → fires, notification still counts down
3. Rest timer with battery optimisation ON → fires (or a warning is shown if it
   provably cannot)
4. Hydration reminder after 4 hours in Doze → fires within a minute of schedule
5. Reboot with pending reminders → all rescheduled
6. Log water from the notification with the app closed → row written, schedule
   recomputed
7. Set sleep window 22:30–06:30, be 1 L behind at 23:00 → **nothing fires until
   morning**
