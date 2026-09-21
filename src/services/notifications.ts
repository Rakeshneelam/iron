/**
 * Local notifications only (docs/06). What to send comes from the pure reminder
 * planner (engine/reminders) and the debt-based water plan; this file only turns
 * them into OS notifications. Scheduling is idempotent — cancel by tag, then
 * schedule — and is re-derived on start, when the app goes to the background,
 * and after water logs, so reminders always reflect what was actually logged.
 */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Linking, Platform } from 'react-native';

import { getWeighIn, listMeasurements } from '@/db/repositories/body';
import { getDayTotals, intakeBetween } from '@/db/repositories/food';
import { getActiveRoutine, resolveNextDay } from '@/db/repositories/program';
import { getActiveSession, listSessions } from '@/db/repositories/sessions';
import { getRaw, getSettings, setRaw, type AppSettings } from '@/db/repositories/settings';
import { logWater } from '@/db/repositories/water';
import type { ReminderSlot } from '@/engine/metabolic';
import { planReminders, type ReminderState } from '@/engine/reminders';
import { addDays, daysBetweenISO, minutesSinceMidnight, parseISODate, todayISO } from '@/lib/date';
import { destinationFor } from '@/lib/deepLinks';

import { hydrationPlan, tomorrowHydrationSlots } from './hydration';

export const CHANNELS = { rest: 'rest-timer', hydration: 'hydration', daily: 'daily' } as const;
const TAGS = { hydration: 'hydration', reminder: 'reminder' } as const;
/** Tags used by earlier versions; cancelled so an upgrade never leaves stale repeats behind. */
const LEGACY_TAGS = ['weigh-in', 'weekly-review'] as const;
export const WATER_CATEGORY = 'water-log';
const REMINDER_CATEGORY = 'reminder';
const WATER_ACTIONS = [250, 500] as const;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** A notification posted to a channel that does not exist is silently dropped. */
export async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNELS.rest, {
    name: 'Rest timer',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 300, 150, 300],
  });
  await Notifications.setNotificationChannelAsync(CHANNELS.hydration, {
    name: 'Water',
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
  });
  await Notifications.setNotificationChannelAsync(CHANNELS.daily, {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Asks the OS without prompting. Lets a screen show the real state before nagging. */
export async function notificationsAllowed(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

/**
 * Prompts if it has to. Called when someone switches a reminder ON, never at
 * startup: a permission dialog before the app has been seen is a question with no
 * context, and Android only lets it be asked once (UX-12).
 */
export async function requestPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function cancelTagged(tag: string): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => (n.content.data as Record<string, unknown> | null)?.tag === tag)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

function atLocal(dateISO: string, minutes: number): Date {
  const d = parseISODate(dateISO);
  d.setHours(0, minutes, 0, 0);
  return d;
}

async function scheduleAt(when: Date, content: Notifications.NotificationContentInput, channelId: string): Promise<void> {
  if (when.getTime() <= Date.now() + 30_000) return;
  await Notifications.scheduleNotificationAsync({
    content,
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId },
  });
}

/** Debt-based, waking hours only, silent when ahead — see hydrationPlan(). */
export async function scheduleHydration(): Promise<void> {
  await cancelTagged(TAGS.hydration);
  if (!getSettings().reminders.water.on) return;
  const today = todayISO();
  const tomorrow = addDays(today, 1);
  const days: [string, ReminderSlot[]][] = [
    [today, hydrationPlan().slots],
    // A day the app is never opened would otherwise be silent.
    [tomorrow, tomorrowHydrationSlots()],
  ];
  for (const [date, slots] of days) {
    for (const slot of slots) {
      await scheduleAt(
        atLocal(date, slot.atMinutes),
        { title: 'Water', body: slot.label, data: { tag: TAGS.hydration }, categoryIdentifier: WATER_CATEGORY },
        CHANNELS.hydration,
      );
    }
  }
}

/** What the reminder planner needs to know about today. */
function reminderState(s: AppSettings): ReminderState {
  const now = new Date();
  const today = todayISO();
  const yesterday = addDays(today, -1);
  const weekday = now.getDay();
  const recent = listSessions(20, ['completed', 'partial', 'cancelled', 'skipped']);
  const lastMeasurement = listMeasurements()[0]?.date;
  const water = hydrationPlan(now);
  const routine = getActiveRoutine();
  return {
    weekday,
    nowMinutes: minutesSinceMidnight(now),
    wake: s.wakeMinutes,
    sleep: s.sleepMinutes,
    trainingDays: s.trainingDays,
    trainedToday: recent.some((x) => x.date === today && x.status !== 'skipped'),
    activeWorkout: getActiveSession() !== undefined,
    // A deliberately skipped day was handled — only a silent miss counts.
    missedYesterday: s.trainingDays.includes((weekday + 6) % 7) && !recent.some((x) => x.date === yesterday),
    weighedToday: getWeighIn(today) !== undefined,
    daysSinceMeasurement: lastMeasurement ? daysBetweenISO(lastMeasurement, today) : null,
    waterBehind: s.reminders.water.on && !water.ahead && water.consumedMl < water.targetMl,
    usesFood: intakeBetween(addDays(today, -6), today).length > 0,
    foodLoggedToday: getDayTotals(today).kcal > 0,
    nextDayLabel: (routine ? resolveNextDay(routine.id) : undefined)?.label ?? null,
  };
}

export async function scheduleReminders(): Promise<void> {
  await cancelTagged(TAGS.reminder);
  for (const t of LEGACY_TAGS) await cancelTagged(t);
  const s = getSettings();
  const today = todayISO();
  for (const r of planReminders(s.reminders, reminderState(s))) {
    await scheduleAt(
      atLocal(addDays(today, r.dayOffset), r.minutes),
      { title: r.title, body: r.body, data: { tag: TAGS.reminder, url: r.url, type: r.type }, categoryIdentifier: REMINDER_CATEGORY },
      CHANNELS.daily,
    );
  }
}

let chain: Promise<void> = Promise.resolve();

/** Idempotent full re-derivation. Serialised so overlapping calls never double-schedule. */
export function rescheduleAll(): Promise<void> {
  chain = chain
    .then(async () => {
      await ensureChannels();
      await scheduleHydration();
      await scheduleReminders();
    })
    .catch(() => undefined);
  return chain;
}

/** Quick actions. They open the app briefly to write the row (no background task installed). */
export async function registerCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(WATER_CATEGORY, [
    ...WATER_ACTIONS.map((ml) => ({ identifier: `water-${ml}`, buttonTitle: `+${ml} ml`, options: { opensAppToForeground: true } })),
    { identifier: 'water-later', buttonTitle: 'Later', options: { opensAppToForeground: true } },
  ]);
  await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY, [
    { identifier: 'later', buttonTitle: 'In an hour', options: { opensAppToForeground: true } },
  ]);
}

async function snooze(r: Notifications.NotificationResponse, minutes: number, channelId: string): Promise<void> {
  const c = r.notification.request.content;
  await Notifications.scheduleNotificationAsync({
    content: { title: c.title ?? 'Reminder', body: c.body ?? '', data: c.data ?? {}, categoryIdentifier: c.categoryIdentifier ?? undefined },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: Date.now() + minutes * 60_000, channelId },
  });
}

function handleResponse(r: Notifications.NotificationResponse): void {
  const key = `${r.notification.request.identifier}:${r.actionIdentifier}`;
  if (getRaw('notif:lastHandled') === key) return;
  setRaw('notif:lastHandled', key);
  const dismiss = () => void Notifications.dismissNotificationAsync(r.notification.request.identifier).catch(() => undefined);

  const water = /^water-(\d+)$/.exec(r.actionIdentifier);
  if (water?.[1]) {
    logWater(Number(water[1]));
    dismiss();
    void rescheduleAll();
    return;
  }
  if (r.actionIdentifier === 'water-later') {
    dismiss();
    void snooze(r, 30, CHANNELS.hydration);
    return;
  }
  if (r.actionIdentifier === 'later') {
    dismiss();
    void snooze(r, 60, CHANNELS.daily);
    return;
  }
  const data = r.notification.request.content.data as Record<string, unknown> | null;
  const url = destinationFor(data);
  if (url !== null) {
    setTimeout(() => {
      try {
        router.push(url as never);
      } catch {
        /* navigation not ready yet — the app is open, which is what the tap asked for */
      }
    }, 0);
  }
}

/** Mounted once in the root layout. Covers both cold-start and running responses. */
export function useNotificationResponses(): void {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (last) handleResponse(last);
  }, [last]);
}

export async function openBatteryOptimisationSettings(): Promise<void> {
  try {
    await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
  } catch {
    await Linking.openSettings();
  }
}
