/**
 * Two different numbers that were being used as one.
 *
 * A plan holds a ROTATION: Day A, Day B, Day C, run in order, whatever the
 * calendar says. `trainingDays` holds the WEEKDAYS you intend to train on, which
 * is what reminders fire against and what "planned this week" counts.
 *
 * A four-workout rotation trained three days a week is perfectly ordinary, and
 * both facts are true at once. Plans printed "4 days a week" for the rotation
 * length, plan/[id] separately edited daysPerWeek, and progress.ts resolved the
 * weekly target from the selected weekdays first — so the same person could read
 * three different answers on three screens (UX-10).
 *
 * Nothing here changes how the engine progresses anything; it is how the two
 * numbers are resolved and said out loud, in one place, for every screen.
 */

export interface ScheduleFacts {
  /** Workouts in the plan's rotation. */
  rotation: number;
  /** Weekdays selected in the training schedule. */
  scheduledDays: number;
}

/**
 * How many workouts a week to expect.
 *
 * The selected weekdays are the answer when there are any — they are the explicit
 * statement of intent. A plan with no weekdays chosen falls back to its rotation
 * length, which is the only other thing we know.
 */
export function weeklyTarget({ rotation, scheduledDays }: ScheduleFacts): number {
  return scheduledDays > 0 ? scheduledDays : rotation;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The sentence every screen uses, so none of them can invent its own.
 * "4 workouts in rotation · 3 scheduled days per week".
 */
export function scheduleLabel({ rotation, scheduledDays }: ScheduleFacts): string {
  const left = `${plural(rotation, 'workout')} in rotation`;
  if (scheduledDays === 0) return `${left} · no days scheduled yet`;
  return `${left} · ${plural(scheduledDays, 'scheduled day')} per week`;
}

/** The shorter form, for a card that already carries the plan's name. */
export function rotationLabel(rotation: number): string {
  return rotation === 0 ? 'No workouts yet' : `${plural(rotation, 'workout')} in rotation`;
}
