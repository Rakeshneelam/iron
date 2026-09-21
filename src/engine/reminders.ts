/**
 * Which reminders to schedule for the coming days. PURE — the notification
 * service turns these into OS notifications.
 *
 * Rules that keep it from becoming spam (the top complaint about fitness apps'
 * notifications): every type can be switched off; nothing fires in quiet hours
 * (sleep → wake); reminders only fire when there is something left to do; at most
 * three non-water reminders a day. Water is handled separately (debt-based).
 */

export type ReminderType = 'workout' | 'missedWorkout' | 'weight' | 'measurements' | 'weeklySummary' | 'eveningCheckIn' | 'recovery';

export interface ReminderPrefs {
  workout: { on: boolean; minutes: number };
  missedWorkout: { on: boolean };
  weight: { on: boolean; frequency: 'daily' | 'training' | 'weekly' };
  measurements: { on: boolean; weekday: number; everyWeeks: number };
  weeklySummary: { on: boolean };
  eveningCheckIn: { on: boolean; minutes: number };
  recovery: { on: boolean };
  water: { on: boolean; minGapMinutes: number };
}

export const DEFAULT_REMINDERS: ReminderPrefs = {
  workout: { on: true, minutes: 17 * 60 + 30 },
  missedWorkout: { on: true },
  weight: { on: true, frequency: 'training' },
  measurements: { on: true, weekday: 0, everyWeeks: 2 },
  weeklySummary: { on: true },
  eveningCheckIn: { on: false, minutes: 20 * 60 + 30 },
  recovery: { on: false },
  water: { on: true, minGapMinutes: 90 },
};

export interface ReminderState {
  /** Day of week today, 0 = Sunday. */
  weekday: number;
  nowMinutes: number;
  wake: number;
  sleep: number;
  trainingDays: readonly number[];
  trainedToday: boolean;
  activeWorkout: boolean;
  /** A planned training day yesterday passed without a workout. */
  missedYesterday: boolean;
  weighedToday: boolean;
  /** Whole days since the last measurement, null if never. */
  daysSinceMeasurement: number | null;
  waterBehind: boolean;
  /** The user logs food at all (last 7 days) — only then do we ask about it. */
  usesFood: boolean;
  foodLoggedToday: boolean;
  nextDayLabel: string | null;
}

export interface Reminder {
  type: ReminderType;
  dayOffset: number;
  minutes: number;
  title: string;
  body: string;
  url?: string;
}

const PRIORITY: Record<ReminderType, number> = {
  workout: 0,
  missedWorkout: 1,
  eveningCheckIn: 2,
  weight: 3,
  weeklySummary: 4,
  measurements: 5,
  recovery: 6,
};

export function inQuietHours(minutes: number, wake: number, sleep: number): boolean {
  return minutes < wake || minutes >= sleep;
}

export function planReminders(p: ReminderPrefs, s: ReminderState, days = 7): Reminder[] {
  const out: Reminder[] = [];
  const push = (r: Reminder) => {
    const minutes = Math.min(Math.max(r.minutes, s.wake), s.sleep - 15);
    if (inQuietHours(minutes, s.wake, s.sleep)) return;
    if (r.dayOffset === 0 && minutes <= s.nowMinutes) return;
    out.push({ ...r, minutes });
  };

  for (let d = 0; d < days; d++) {
    const weekday = (s.weekday + d) % 7;
    const training = s.trainingDays.includes(weekday);
    const today = d === 0;

    if (p.workout.on && training && !(today && (s.trainedToday || s.activeWorkout))) {
      push({
        type: 'workout',
        dayOffset: d,
        minutes: p.workout.minutes,
        title: 'Workout today',
        body: s.nextDayLabel ? `${s.nextDayLabel} is next. The warm-up is ready when you are.` : 'Your next session is ready.',
        url: '/',
      });
    }
    if (today && p.missedWorkout.on && s.missedYesterday && !s.trainedToday && !training) {
      push({
        type: 'missedWorkout',
        dayOffset: 0,
        minutes: p.workout.minutes,
        title: 'Pick up where you left off',
        body: `${s.nextDayLabel ?? 'Your next session'} is still next — no need to double up.`,
        url: '/',
      });
    }
    const weighDay = p.weight.frequency === 'daily' || (p.weight.frequency === 'training' ? training : weekday === 1);
    if (p.weight.on && weighDay && !(today && s.weighedToday)) {
      push({ type: 'weight', dayOffset: d, minutes: s.wake + 15, title: 'Morning weigh-in', body: 'Before breakfast. One number — the trend does the rest.', url: '/daily' });
    }
    if (p.measurements.on && weekday === p.measurements.weekday) {
      const since = s.daysSinceMeasurement === null ? null : s.daysSinceMeasurement + d;
      if (since === null || since >= p.measurements.everyWeeks * 7 - 1) {
        push({ type: 'measurements', dayOffset: d, minutes: 19 * 60, title: 'Measurement check-in', body: 'Waist and a few others — two minutes, every couple of weeks.', url: '/body' });
      }
    }
    if (p.weeklySummary.on && weekday === 0) {
      push({ type: 'weeklySummary', dayOffset: d, minutes: 19 * 60 + 15, title: 'Your week', body: 'What improved, what slipped, and what to focus on.', url: '/review' });
    }
    if (p.recovery.on && !training && !(today && s.trainedToday)) {
      push({ type: 'recovery', dayOffset: d, minutes: s.wake + 120, title: 'Rest day', body: '8 minutes of easy mobility if you feel stiff — optional.', url: '/' });
    }
    if (today && p.eveningCheckIn.on) {
      const missing: string[] = [];
      if (p.weight.on && weighDay && !s.weighedToday) missing.push('weight');
      if (s.waterBehind) missing.push('water');
      if (s.usesFood && !s.foodLoggedToday) missing.push('food');
      if (training && !s.trainedToday && !s.activeWorkout) missing.push('workout');
      if (missing.length) {
        const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} or ${missing[missing.length - 1]}`;
        push({ type: 'eveningCheckIn', dayOffset: 0, minutes: p.eveningCheckIn.minutes, title: 'Evening check-in', body: `Want to log today's ${list}?`, url: '/' });
      }
    }
  }

  // At most three a day, most important first; no two at the same minute.
  const kept: Reminder[] = [];
  for (let d = 0; d < days; d++) {
    const day = out.filter((r) => r.dayOffset === d).sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type]).slice(0, 3);
    const taken = new Set<number>();
    for (const r of day.sort((a, b) => a.minutes - b.minutes)) {
      let m = r.minutes;
      while (taken.has(m)) m += 10;
      if (inQuietHours(m, s.wake, s.sleep)) continue;
      taken.add(m);
      kept.push({ ...r, minutes: m });
    }
  }
  return kept;
}
