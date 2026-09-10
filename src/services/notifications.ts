/**
 * Local notifications only (docs/06). The complete list: rest timer, debt-based
 * hydration, morning weigh-in, weekly review. Adding more is an anti-feature.
 * Scheduling is idempotent — cancel by tag, then schedule — and is re-derived on
 * every app start and after every water log.
 */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Linking, Platform } from 'react-native';

import { getWeighIn } from '@/db/repositories/body';
import { listSessions } from '@/db/repositories/sessions';
import { getRaw, getSettings, setRaw } from '@/db/repositories/settings';
import { logWater } from '@/db/repositories/water';
import { addDays, parseISODate, todayISO } from '@/lib/date';

import { hydrationPlan } from './hydration';

export const CHANNELS = { rest: 'rest-timer', hydration: 'hydration', daily: 'daily' } as const;
const TAGS = { hydration: 'hydration', weighIn: 'weigh-in', review: 'weekly-review' } as const;
export const WATER_CATEGORY = 'water-log';
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
    name: 'Weigh-in & weekly review',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

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
  const plan = hydrationPlan();
  const today = todayISO();
  for (const slot of plan.slots) {
    await scheduleAt(
      atLocal(today, slot.atMinutes),
      { title: 'Water', body: slot.label, data: { tag: TAGS.hydration }, categoryIdentifier: WATER_CATEGORY },
      CHANNELS.hydration,
    );
  }
}

/** Once, at wake time, on the weekdays he has actually trained in the last 4 weeks. */
export async function scheduleMorningWeighIn(): Promise<void> {
  await cancelTagged(TAGS.weighIn);
  const s = getSettings();
  const today = todayISO();
  const since = addDays(today, -28);
  const trainingWeekdays = new Set(
    listSessions(60)
      .filter((x) => x.date >= since)
      .map((x) => parseISODate(x.date).getDay()),
  );
  if (trainingWeekdays.size === 0) return;
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i);
    if (!trainingWeekdays.has(parseISODate(date).getDay()) || getWeighIn(date)) continue;
    await scheduleAt(
      atLocal(date, s.wakeMinutes),
      { title: 'Morning weigh-in', body: 'Before breakfast. One number — the trend does the rest.', data: { tag: TAGS.weighIn, url: '/body' } },
      CHANNELS.daily,
    );
  }
}

/** Sunday evening, never after bedtime. */
export async function scheduleWeeklyReview(): Promise<void> {
  await cancelTagged(TAGS.review);
  const s = getSettings();
  const at = Math.max(s.wakeMinutes, Math.min(19 * 60, s.sleepMinutes - 60));
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Weekly review', body: 'What progressed, what stalled — thirty seconds.', data: { tag: TAGS.review, url: '/review' } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1,
      hour: Math.floor(at / 60),
      minute: at % 60,
      channelId: CHANNELS.daily,
    },
  });
}

let chain: Promise<void> = Promise.resolve();

/** Idempotent full re-derivation. Serialised so overlapping calls never double-schedule. */
export function rescheduleAll(): Promise<void> {
  chain = chain
    .then(async () => {
      await ensureChannels();
      await scheduleHydration();
      await scheduleMorningWeighIn();
      await scheduleWeeklyReview();
    })
    .catch(() => undefined);
  return chain;
}

/**
 * Water quick-log actions. They open the app briefly to write the row: logging
 * fully in the background needs expo-task-manager, which is not installed.
 */
export async function registerCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(
    WATER_CATEGORY,
    WATER_ACTIONS.map((ml) => ({ identifier: `water-${ml}`, buttonTitle: `+${ml} ml`, options: { opensAppToForeground: true } })),
  );
}

function handleResponse(r: Notifications.NotificationResponse): void {
  const key = `${r.notification.request.identifier}:${r.actionIdentifier}`;
  if (getRaw('notif:lastHandled') === key) return;
  setRaw('notif:lastHandled', key);

  const water = /^water-(\d+)$/.exec(r.actionIdentifier);
  if (water?.[1]) {
    logWater(Number(water[1]));
    void Notifications.dismissNotificationAsync(r.notification.request.identifier).catch(() => undefined);
    void rescheduleAll();
    return;
  }
  const url = (r.notification.request.content.data as Record<string, unknown> | null)?.url;
  if (typeof url === 'string') {
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
