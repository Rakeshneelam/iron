/**
 * Rotation length and scheduled weekdays are two different numbers (UX-10).
 *
 * Plans printed the rotation as "N days a week", plan/[id] separately edited
 * daysPerWeek, and Progress resolved its weekly target from the selected weekdays
 * — so the same person could read three different answers on three screens.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { rotationLabel, scheduleLabel, weeklyTarget } from '../src/features/program/schedule.ts';

describe('the weekly target', () => {
  test('is the scheduled weekdays when any are chosen', () => {
    assert.equal(weeklyTarget({ rotation: 4, scheduledDays: 3 }), 3);
  });

  test('falls back to the rotation when no weekdays are chosen', () => {
    assert.equal(weeklyTarget({ rotation: 4, scheduledDays: 0 }), 4);
  });

  test('a rotation longer than the week is left alone, not clamped', () => {
    // Six workouts on three days is a fortnight's cycle, not an error.
    assert.equal(weeklyTarget({ rotation: 6, scheduledDays: 3 }), 3);
  });
});

describe('saying both numbers out loud', () => {
  test('a four-workout rotation on three weekdays says exactly that', () => {
    assert.equal(scheduleLabel({ rotation: 4, scheduledDays: 3 }), '4 workouts in rotation · 3 scheduled days per week');
  });

  test('singulars read as singulars', () => {
    assert.equal(scheduleLabel({ rotation: 1, scheduledDays: 1 }), '1 workout in rotation · 1 scheduled day per week');
  });

  test('no weekdays chosen says so rather than implying a number', () => {
    assert.equal(scheduleLabel({ rotation: 3, scheduledDays: 0 }), '3 workouts in rotation · no days scheduled yet');
  });

  test('the short form never calls a rotation "days a week"', () => {
    assert.equal(rotationLabel(4), '4 workouts in rotation');
    assert.equal(rotationLabel(1), '1 workout in rotation');
    assert.equal(rotationLabel(0), 'No workouts yet');
  });
});
