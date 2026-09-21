/**
 * Rest timer (docs/06 Rule 1). The truth is `endsAt` in SQLite, written BEFORE
 * anything is scheduled, so a force-quit mid-rest resumes exactly. The displayed
 * countdown is always `endsAt - now`; the interval below only asks React to
 * re-render — no tick is ever accumulated. Firing is owned by the native
 * foreground service + exact alarm when compiled in, else an expo-notifications
 * date trigger.
 */
import { and, eq } from 'drizzle-orm';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import * as NativeTimer from '../../modules/rest-timer';

import { db } from '@/db/client';
import { useLive } from '@/db/live';
import { getRaw, setRaw } from '@/db/repositories/settings';
import * as schema from '@/db/schema';
import { toISOInstant } from '@/lib/date';
import { success } from '@/lib/haptics';

import { CHANNELS } from './notifications';

const ROW_ID = 'rest';
const FALLBACK_ID = 'iron-rest-timer';
const TOTAL_KEY = 'timer:totalMs';

export type TimerRow = typeof schema.timerState.$inferSelect;

export function getTimer(): TimerRow | undefined {
  return db.select().from(schema.timerState).where(eq(schema.timerState.id, ROW_ID)).get();
}

export function getPersistedEndsAt(): string | null {
  return getTimer()?.endsAt ?? null;
}

/**
 * Arming is async, so a cancel can land in the middle of one. Two guards:
 * `epoch` marks a start as stale the moment anything else happens, and `serial`
 * keeps the native calls in the order they were asked for — without it a cancel's
 * NativeTimer.cancel() could run before the start it was meant to undo.
 * The SQLite write stays outside both: truth is written before any await.
 */
let epoch = 0;
let queue: Promise<unknown> = Promise.resolve();

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

async function arm(endsAtMs: number, label: string, gen: number): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(FALLBACK_ID).catch(() => undefined);
  if (gen !== epoch) return;
  if (NativeTimer.isNativeRestTimerAvailable) {
    try {
      NativeTimer.start(endsAtMs, label);
      return;
    } catch {
      /* native refused — fall through to the notification path */
    }
  }
  await Notifications.scheduleNotificationAsync({
    identifier: FALLBACK_ID,
    content: { title: 'Rest over', body: `${label} — next set`, data: { tag: 'rest' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: endsAtMs, channelId: CHANNELS.rest },
  });
  // Cancelled while that was in flight: take it back down again.
  if (gen !== epoch) await Notifications.cancelScheduledNotificationAsync(FALLBACK_ID).catch(() => undefined);
}

function persist(sessionId: string | null, endsAtMs: number, label: string, totalMs: number): void {
  const endsAt = toISOInstant(new Date(endsAtMs));
  db.insert(schema.timerState)
    .values({ id: ROW_ID, sessionId, endsAt, label })
    .onConflictDoUpdate({ target: schema.timerState.id, set: { sessionId, endsAt, label } })
    .run();
  setRaw(TOTAL_KEY, String(totalMs));
}

export async function startRest(sessionId: string | null, seconds: number, label = 'Rest'): Promise<void> {
  const totalMs = Math.max(1, Math.round(seconds)) * 1000;
  const endsAtMs = Date.now() + totalMs;
  const gen = ++epoch;
  persist(sessionId, endsAtMs, label, totalMs); // truth first
  await serial(() => arm(endsAtMs, label, gen)).catch(() => undefined);
}

export async function cancelRest(): Promise<void> {
  epoch++;
  db.delete(schema.timerState).where(eq(schema.timerState.id, ROW_ID)).run(); // truth first
  await serial(async () => {
    try {
      NativeTimer.cancel();
    } catch {
      /* not compiled in */
    }
    await Notifications.cancelScheduledNotificationAsync(FALLBACK_ID).catch(() => undefined);
  }).catch(() => undefined);
}

export async function addSeconds(delta: number): Promise<void> {
  const t = getTimer();
  if (!t) return;
  const endsAtMs = Math.max(Date.now() + 1000, Date.parse(t.endsAt) + delta * 1000);
  const totalMs = Math.max(1000, Number(getRaw(TOTAL_KEY) ?? 0) + delta * 1000);
  const label = t.label ?? 'Rest';
  const gen = ++epoch;
  persist(t.sessionId, endsAtMs, label, totalMs);
  await serial(() => arm(endsAtMs, label, gen)).catch(() => undefined);
}

/** Clears only the timer that actually expired, never a newer one. */
function expire(endsAt: string, freshlyExpired: boolean): void {
  db.delete(schema.timerState).where(and(eq(schema.timerState.id, ROW_ID), eq(schema.timerState.endsAt, endsAt))).run();
  // Rest ending is a commit like any other: one switch silences it too (UX-11).
  if (freshlyExpired) success();
}

export interface RestTimerView {
  running: boolean;
  endsAt: string | null;
  remainingMs: number;
  totalMs: number;
  label: string | null;
  start(seconds: number, label?: string): void;
  cancel(): void;
  add(delta: number): void;
}

export function useRestTimer(sessionId: string | null = null): RestTimerView {
  const timer = useLive(getTimer, ['timer_state']);
  const [now, setNow] = useState(() => Date.now());
  const endsAtMs = timer ? Date.parse(timer.endsAt) : null;

  useEffect(() => {
    if (endsAtMs === null) return;
    const tick = () => setNow(Date.now());
    // First tick straight away rather than 250 ms late, but from a callback, not the effect body.
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 250);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    return () => {
      clearTimeout(first);
      clearInterval(id);
      sub.remove();
    };
  }, [endsAtMs]);

  const remainingMs = endsAtMs === null ? 0 : Math.max(0, endsAtMs - now);

  useEffect(() => {
    if (timer && endsAtMs !== null && remainingMs === 0) expire(timer.endsAt, Date.now() - endsAtMs < 5000);
  }, [timer, endsAtMs, remainingMs]);

  const totalMs = timer ? Number(getRaw(TOTAL_KEY) ?? 0) || remainingMs : 0;
  return {
    running: endsAtMs !== null && remainingMs > 0,
    endsAt: timer?.endsAt ?? null,
    remainingMs,
    totalMs,
    label: timer?.label ?? null,
    start: (seconds, label) => void startRest(sessionId, seconds, label),
    cancel: () => void cancelRest(),
    add: (delta) => void addSeconds(delta),
  };
}
