/**
 * Levels, XP and badges. PURE.
 *
 * Loss-free by construction: every input is a lifetime count that only grows, so XP
 * never falls, a level is never lost and a badge, once earned, stays earned. A missed
 * day costs nothing and there is no streak to break (AGENTS §6). Every point has a
 * visible source (`xpOf(...).parts`), so the score explains itself.
 */

export interface LifetimeStats {
  /** Finished workouts, completed or partly. */
  workouts: number;
  /** Working sets in those workouts. */
  sets: number;
  /** Kilograms moved in those sets: weight × reps. */
  tonnage: number;
  /** Sessions in which a lift beat every earlier session of it. */
  bests: number;
  /** Weeks whose workouts reached the weekly goal. */
  goalWeeks: number;
  /** Days the water target was reached. */
  waterDays: number;
  /** Days with any food logged. */
  foodDays: number;
  /** Days with a weigh-in. */
  weighIns: number;
  /** Workouts finished before 08:00. */
  earlyWorkouts: number;
  /** Workouts finished at 21:00 or later. */
  lateWorkouts: number;
}

export const EMPTY_STATS: LifetimeStats = {
  workouts: 0,
  sets: 0,
  tonnage: 0,
  bests: 0,
  goalWeeks: 0,
  waterDays: 0,
  foodDays: 0,
  weighIns: 0,
  earlyWorkouts: 0,
  lateWorkouts: 0,
};

/** Points per counted thing. Training earns most; the daily habits add a little. */
export const XP = { workout: 100, set: 3, best: 40, goalWeek: 150, waterDay: 10, foodDay: 10, weighIn: 5 } as const;
export type XpSource = keyof typeof XP;

const SOURCES: readonly { key: XpSource; stat: keyof LifetimeStats; label: string }[] = [
  { key: 'workout', stat: 'workouts', label: 'Workouts' },
  { key: 'set', stat: 'sets', label: 'Working sets' },
  { key: 'best', stat: 'bests', label: 'Personal bests' },
  { key: 'goalWeek', stat: 'goalWeeks', label: 'Weekly goals reached' },
  { key: 'waterDay', stat: 'waterDays', label: 'Water target days' },
  { key: 'foodDay', stat: 'foodDays', label: 'Days with food logged' },
  { key: 'weighIn', stat: 'weighIns', label: 'Weigh-ins' },
];

export interface XpPart {
  key: XpSource;
  label: string;
  count: number;
  each: number;
  xp: number;
}

export function xpOf(s: LifetimeStats): { total: number; parts: XpPart[] } {
  const parts = SOURCES.map(({ key, stat, label }) => {
    const count = Math.max(0, Math.floor(s[stat]));
    return { key, label, count, each: XP[key], xp: count * XP[key] };
  });
  return { total: parts.reduce((t, p) => t + p.xp, 0), parts };
}

/** Cumulative XP that reaches `level` (1-based): 0, 500, 1500, 3000, 5000, 7500… */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return 250 * l * (l - 1);
}

export const TITLES = ['Rookie', 'Starter', 'Regular', 'Committed', 'Grinder', 'Iron', 'Steel', 'Titanium', 'Titan', 'Legend'] as const;

export interface Level {
  level: number;
  title: string;
  xp: number;
  /** XP at which this level began, and at which the next one starts. */
  floor: number;
  next: number;
  /** 0..1 of the way from `floor` to `next`. */
  progress: number;
}

export function levelOf(xp: number): Level {
  const x = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  // The largest L with 250·L·(L−1) ≤ x, solved directly, then nudged past rounding.
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * x) / 250)) / 2));
  while (xpForLevel(level + 1) <= x) level++;
  while (level > 1 && xpForLevel(level) > x) level--;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, title: TITLES[Math.min(level, TITLES.length) - 1] ?? 'Legend', xp: x, floor, next, progress: (x - floor) / (next - floor) };
}

export type BadgeId =
  | 'first-workout'
  | 'workouts-10'
  | 'workouts-50'
  | 'workouts-100'
  | 'first-best'
  | 'bests-25'
  | 'tonnes-1'
  | 'tonnes-10'
  | 'tonnes-100'
  | 'goal-week'
  | 'goal-weeks-4'
  | 'hydrated'
  | 'fuelled'
  | 'on-the-scale'
  | 'early-bird'
  | 'night-owl';

export interface Badge {
  id: BadgeId;
  name: string;
  description: string;
  stat: keyof LifetimeStats;
  goal: number;
}

/** Counts, never runs: "on 7 days", not "7 days in a row". Nothing here can be broken. */
export const BADGES: readonly Badge[] = [
  { id: 'first-workout', name: 'First rep', description: 'Finish your first workout.', stat: 'workouts', goal: 1 },
  { id: 'workouts-10', name: 'Ten down', description: 'Finish 10 workouts.', stat: 'workouts', goal: 10 },
  { id: 'workouts-50', name: 'Fifty', description: 'Finish 50 workouts.', stat: 'workouts', goal: 50 },
  { id: 'workouts-100', name: 'Century', description: 'Finish 100 workouts.', stat: 'workouts', goal: 100 },
  { id: 'first-best', name: 'New best', description: 'Beat your best on any lift.', stat: 'bests', goal: 1 },
  { id: 'bests-25', name: 'Record breaker', description: 'Set 25 personal bests.', stat: 'bests', goal: 25 },
  { id: 'tonnes-1', name: 'One tonne', description: 'Lift 1,000 kg in total.', stat: 'tonnage', goal: 1000 },
  { id: 'tonnes-10', name: 'Ten tonnes', description: 'Lift 10,000 kg in total.', stat: 'tonnage', goal: 10_000 },
  { id: 'tonnes-100', name: 'Hundred tonnes', description: 'Lift 100,000 kg in total.', stat: 'tonnage', goal: 100_000 },
  { id: 'goal-week', name: 'Full week', description: 'Reach your weekly workout goal.', stat: 'goalWeeks', goal: 1 },
  { id: 'goal-weeks-4', name: 'Four good weeks', description: 'Reach your weekly goal in any four weeks.', stat: 'goalWeeks', goal: 4 },
  { id: 'hydrated', name: 'Hydrated', description: 'Reach your water target on 7 days.', stat: 'waterDays', goal: 7 },
  { id: 'fuelled', name: 'Fuelled', description: 'Log food on 14 days.', stat: 'foodDays', goal: 14 },
  { id: 'on-the-scale', name: 'On the scale', description: 'Weigh in on 10 mornings.', stat: 'weighIns', goal: 10 },
  { id: 'early-bird', name: 'Early bird', description: 'Finish a workout before 8 am.', stat: 'earlyWorkouts', goal: 1 },
  { id: 'night-owl', name: 'Night owl', description: 'Finish a workout after 9 pm.', stat: 'lateWorkouts', goal: 1 },
];

export interface BadgeState {
  badge: Badge;
  value: number;
  earned: boolean;
  /** 0..1 toward the goal. */
  progress: number;
}

export function badgeStates(s: LifetimeStats): BadgeState[] {
  return BADGES.map((badge) => {
    const value = Math.max(0, s[badge.stat]);
    return { badge, value, earned: value >= badge.goal, progress: Math.min(1, value / badge.goal) };
  });
}

/** The badges a change in stats crossed into — what a just-finished workout unlocked. */
export function newlyEarned(before: LifetimeStats, after: LifetimeStats): Badge[] {
  return BADGES.filter((b) => before[b.stat] < b.goal && after[b.stat] >= b.goal);
}
