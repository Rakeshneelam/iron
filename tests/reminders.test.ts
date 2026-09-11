import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_REMINDERS, inQuietHours, planReminders, type ReminderState } from '../src/engine/reminders.ts';

const state = (over: Partial<ReminderState> = {}): ReminderState => ({
  weekday: 1, nowMinutes: 8 * 60, wake: 6 * 60 + 30, sleep: 22 * 60 + 30,
  trainingDays: [1, 3, 5], trainedToday: false, activeWorkout: false, missedYesterday: false,
  weighedToday: false, daysSinceMeasurement: 3, waterBehind: false, usesFood: false, foodLoggedToday: false,
  nextDayLabel: 'Upper A', ...over,
});

describe('reminders', () => {
  test('workout reminders only on training days, and not once you have trained', () => {
    const r = planReminders(DEFAULT_REMINDERS, state()).filter((x) => x.type === 'workout');
    assert.deepEqual(r.map((x) => x.dayOffset), [0, 2, 4]);
    const done = planReminders(DEFAULT_REMINDERS, state({ trainedToday: true })).filter((x) => x.type === 'workout');
    assert.ok(!done.some((x) => x.dayOffset === 0));
  });

  test('changing training days moves the reminders', () => {
    const r = planReminders(DEFAULT_REMINDERS, state({ trainingDays: [2, 4] })).filter((x) => x.type === 'workout');
    assert.deepEqual(r.map((x) => x.dayOffset), [1, 3]);
  });

  test('never inside quiet hours, never in the past', () => {
    const late = planReminders({ ...DEFAULT_REMINDERS, workout: { on: true, minutes: 23 * 60 + 30 } }, state({ nowMinutes: 21 * 60 }));
    for (const r of late) {
      assert.ok(!inQuietHours(r.minutes, 6 * 60 + 30, 22 * 60 + 30));
      if (r.dayOffset === 0) assert.ok(r.minutes > 21 * 60);
    }
  });

  test('missed yesterday: one calm nudge that does not ask to double up', () => {
    const r = planReminders(DEFAULT_REMINDERS, state({ weekday: 2, missedYesterday: true }));
    const m = r.find((x) => x.type === 'missedWorkout');
    assert.ok(m);
    assert.match(m.body, /no need to double up/);
  });

  test('evening check-in lists only what is missing, and is silent when nothing is', () => {
    const prefs = { ...DEFAULT_REMINDERS, eveningCheckIn: { on: true, minutes: 20 * 60 } };
    const r = planReminders(prefs, state({ waterBehind: true, weighedToday: true, trainedToday: true })).find((x) => x.type === 'eveningCheckIn');
    assert.equal(r?.body, "Want to log today's water?");
    const none = planReminders(prefs, state({ weighedToday: true, trainedToday: true })).find((x) => x.type === 'eveningCheckIn');
    assert.equal(none, undefined);
  });

  test('switched-off types never appear; at most three a day', () => {
    const off = { ...DEFAULT_REMINDERS, workout: { on: false, minutes: 1050 }, weight: { on: false, frequency: 'daily' as const } };
    const r = planReminders(off, state());
    assert.ok(!r.some((x) => x.type === 'workout' || x.type === 'weight'));
    const all = planReminders({ ...DEFAULT_REMINDERS, recovery: { on: true }, weight: { on: true, frequency: 'daily' } }, state({ weekday: 0, daysSinceMeasurement: null }));
    for (let d = 0; d < 7; d++) assert.ok(all.filter((x) => x.dayOffset === d).length <= 3);
  });

  test('measurements only when due', () => {
    const due = planReminders(DEFAULT_REMINDERS, state({ weekday: 0, daysSinceMeasurement: 20 })).filter((x) => x.type === 'measurements');
    assert.ok(due.some((x) => x.dayOffset === 0));
    const recent = planReminders(DEFAULT_REMINDERS, state({ weekday: 0, daysSinceMeasurement: 2 })).filter((x) => x.type === 'measurements' && x.dayOffset === 0);
    assert.equal(recent.length, 0);
  });
});
