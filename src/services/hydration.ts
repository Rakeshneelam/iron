/**
 * Hydration target and today's debt-based reminder plan. Shared by the Water screen
 * (to show the next nudge) and the notification service (to schedule it).
 */
import { getLatestWeight } from '@/db/repositories/body';
import { getActiveSession, listSessions } from '@/db/repositories/sessions';
import { getSettings } from '@/db/repositories/settings';
import { getDayTotal } from '@/db/repositories/water';
import { hydrationTargetMl, scheduleHydration, type ReminderSlot } from '@/engine/metabolic';
import { minutesSinceMidnight, todayISO } from '@/lib/date';

/** docs/01: 84 kg. Used only until the first weigh-in exists. */
export const DEFAULT_WEIGHT_KG = 84;

export function trainedToday(): boolean {
  const today = todayISO();
  return getActiveSession()?.date === today || listSessions(3).some((s) => s.date === today);
}

export function hydrationTarget(): { ml: number; breakdown: string } {
  const s = getSettings();
  if (s.hydrationOverrideMl !== null && s.hydrationOverrideMl > 0) {
    return { ml: s.hydrationOverrideMl, breakdown: 'Fixed target from Settings' };
  }
  const weightKg = getLatestWeight() ?? DEFAULT_WEIGHT_KG;
  const training = trainedToday();
  const ml = hydrationTargetMl({
    weightKg,
    trainingToday: training,
    trainingMinutes: s.trainingMinutes,
    ambientTempC: s.ambientTempC ?? undefined,
  });
  const parts = [`33 ml × ${Math.round(weightKg)} kg`];
  if (training) parts.push(`+ ${s.trainingMinutes} min training`);
  if (s.ambientTempC !== null && s.ambientTempC > 30) parts.push(`+ heat (${s.ambientTempC}°C)`);
  return { ml, breakdown: parts.join(' ') };
}

export interface HydrationPlan {
  targetMl: number;
  consumedMl: number;
  expectedByNowMl: number;
  ahead: boolean;
  slots: ReminderSlot[];
  breakdown: string;
  wakeMinutes: number;
  sleepMinutes: number;
}

/**
 * Debt-based plan for the rest of today (docs/06).
 *
 * Silent while ahead: the earliest a nudge may land is the moment pro-rata pace
 * catches up with what he has actually drunk. Taken literally, "schedule nothing
 * when ahead" would mean no reminder at all for the rest of a day he is ahead at
 * 10:00 — this keeps the silence and still nudges once he genuinely falls behind.
 * Every slot is also clipped to [wake, sleep) as defence in depth.
 */
export function hydrationPlan(now: Date = new Date()): HydrationPlan {
  const s = getSettings();
  const { ml: targetMl, breakdown } = hydrationTarget();
  const consumedMl = getDayTotal(todayISO());
  const nowMin = minutesSinceMidnight(now);
  const wake = s.wakeMinutes;
  const sleep = s.sleepMinutes;
  const span = Math.max(1, sleep - wake);
  const fraction = Math.min(1, Math.max(0, (nowMin - wake) / span));
  const expectedByNowMl = targetMl * fraction;
  const ahead = consumedMl >= expectedByNowMl;

  const caughtUpAt = wake + Math.min(1, consumedMl / Math.max(1, targetMl)) * span;
  const from = Math.max(nowMin, Math.ceil(caughtUpAt));
  const slots = scheduleHydration({ targetMl, consumedMl, nowMinutes: from, wakeMinutes: wake, sleepMinutes: sleep }).filter(
    (slot) => slot.atMinutes > nowMin && slot.atMinutes >= wake && slot.atMinutes < sleep,
  );
  return { targetMl, consumedMl, expectedByNowMl, ahead, slots, breakdown, wakeMinutes: wake, sleepMinutes: sleep };
}
