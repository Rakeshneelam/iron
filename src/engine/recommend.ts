/**
 * Plan-level recommendations. PURE: plain objects in, plain objects out — no I/O.
 *
 * prescribe() already decides each set's load/reps inside a workout (add load, add
 * a rep, hold, back off). This layer looks across weeks and proposes changes to the
 * PLAN — sets per exercise, exercise swaps, training frequency, recovery. It never
 * applies anything: a recommendation with `change` is a proposal the user approves.
 *
 * Deliberately rule-based and explainable (AGENTS.md §1.5). A smarter model can
 * replace `recommend()` later as long as it returns the same shape.
 */

export interface RecExercise {
  exerciseId: string;
  name: string;
  primaryMuscle: string;
  /** The active plan's slot for this exercise (first occurrence). */
  slotId: string;
  targetSets: number;
  /** Workouts in the look-back window where it was on the list. */
  planned: number;
  /** ...of those, how many times it was skipped. */
  skipped: number;
  /** Workouts in the window with at least one working set. */
  trained: number;
  /** Workouts in the window where a set was flagged for pain. */
  painSessions: number;
  /** e1RM slope per session over its last ≤5 sessions (any time). */
  trend: number;
  /** How many sessions that slope is based on. */
  trendSessions: number;
  consecutiveResets: number;
}

export interface RecInput {
  exercises: RecExercise[];
  /** Planned weekly hard sets per muscle for the active plan. */
  plannedWeeklySets: Record<string, number>;
  landmarks: Record<string, { mev: number; mav: number; mrv: number }>;
  consistency: {
    /** Weeks in the window that had a plan (≥1). */
    weeks: number;
    daysPerWeek: number;
    /** Workouts finished (completed or partial). */
    done: number;
    skippedDays: number;
  };
  /** Mean post-workout effort (session RPE 1–10) in the window, if logged. */
  avgSessionRpe: number | null;
}

export type RecKind = 'add_set' | 'remove_set' | 'replace_exercise' | 'fewer_days' | 'recovery' | 'keep_going';

export interface Recommendation {
  /** Stable for the same rule + target, so a dismissal sticks. */
  id: string;
  kind: RecKind;
  title: string;
  reason: string;
  exerciseId?: string;
  /** The plan slot it concerns — lets the UI open the right day. */
  slotId?: string;
  /** A concrete plan edit the user can approve with one tap. Absent = advice only. */
  change?: { slotId: string; targetSets: number };
  /** Lower sorts first. */
  priority: number;
}

const MAX_SETS = 6;

export function recommend(input: RecInput): Recommendation[] {
  const out: Recommendation[] = [];
  const touched = new Set<string>();

  // 1. Pain wins: a movement that keeps hurting should be replaced, not loaded.
  for (const e of input.exercises) {
    if (e.painSessions >= 2) {
      touched.add(e.exerciseId);
      out.push({
        id: `pain:${e.exerciseId}`,
        kind: 'replace_exercise',
        title: `Replace ${e.name}?`,
        reason: `Pain was flagged in ${e.painSessions} recent workouts. Swap to a variation that doesn't hurt — history carries over.`,
        exerciseId: e.exerciseId,
        slotId: e.slotId,
        priority: 0,
      });
    }
  }

  // 2. Repeatedly skipped: the plan isn't matching reality.
  for (const e of input.exercises) {
    if (touched.has(e.exerciseId)) continue;
    if (e.planned >= 3 && e.skipped >= 2 && e.skipped / e.planned >= 0.5) {
      touched.add(e.exerciseId);
      out.push({
        id: `skipped:${e.exerciseId}`,
        kind: 'replace_exercise',
        title: `${e.name} keeps getting skipped`,
        reason: `Skipped ${e.skipped} of the last ${e.planned} times. Replace it with something you'll actually do, or remove it.`,
        exerciseId: e.exerciseId,
        slotId: e.slotId,
        priority: 1,
      });
    }
  }

  // 3. Stalled lifts: add volume if the muscle has room, otherwise a different stimulus.
  for (const e of input.exercises) {
    if (touched.has(e.exerciseId)) continue;
    const stalled = e.trendSessions >= 3 && e.trend <= 0;
    if (!stalled) continue;
    const l = input.landmarks[e.primaryMuscle];
    const weekly = input.plannedWeeklySets[e.primaryMuscle] ?? 0;
    touched.add(e.exerciseId);
    if (e.consecutiveResets >= 2) {
      out.push({
        id: `stalled-swap:${e.exerciseId}`,
        kind: 'replace_exercise',
        title: `Try a new variation of ${e.name}`,
        reason: `Flat for ${e.trendSessions} sessions even after resets. A different ${e.primaryMuscle} movement usually restarts progress.`,
        exerciseId: e.exerciseId,
        slotId: e.slotId,
        priority: 2,
      });
    } else if (l && weekly < l.mav && e.targetSets < MAX_SETS) {
      out.push({
        id: `stalled-set:${e.exerciseId}`,
        kind: 'add_set',
        title: `Add a set to ${e.name}`,
        reason: `Flat for ${e.trendSessions} sessions, and ${e.primaryMuscle} gets ${weekly} sets a week — room to grow. ${e.targetSets} → ${e.targetSets + 1} sets.`,
        exerciseId: e.exerciseId,
        slotId: e.slotId,
        change: { slotId: e.slotId, targetSets: e.targetSets + 1 },
        priority: 2,
      });
    }
  }

  // 4. Weekly volume per muscle against the landmarks.
  for (const [muscle, l] of Object.entries(input.landmarks)) {
    const weekly = input.plannedWeeklySets[muscle] ?? 0;
    const slots = input.exercises.filter((e) => e.primaryMuscle === muscle && !touched.has(e.exerciseId));
    if (weekly > l.mrv) {
      const biggest = [...slots].sort((a, b) => b.targetSets - a.targetSets)[0];
      if (biggest && biggest.targetSets > 1) {
        touched.add(biggest.exerciseId);
        out.push({
          id: `over:${muscle}:${biggest.exerciseId}`,
          kind: 'remove_set',
          title: `Trim ${muscle} volume`,
          reason: `${weekly} sets a week is above what most people recover from (${l.mrv}). Drop a set from ${biggest.name}.`,
          exerciseId: biggest.exerciseId,
          slotId: biggest.slotId,
          change: { slotId: biggest.slotId, targetSets: biggest.targetSets - 1 },
          priority: 3,
        });
      }
    } else if (weekly > 0 && weekly < l.mev) {
      const smallest = [...slots].sort((a, b) => a.targetSets - b.targetSets)[0];
      if (smallest && smallest.targetSets < MAX_SETS) {
        touched.add(smallest.exerciseId);
        out.push({
          id: `under:${muscle}:${smallest.exerciseId}`,
          kind: 'add_set',
          title: `More ${muscle} work`,
          reason: `${weekly} sets a week is below the usual minimum for growth (${l.mev}). Add a set to ${smallest.name}.`,
          exerciseId: smallest.exerciseId,
          slotId: smallest.slotId,
          change: { slotId: smallest.slotId, targetSets: smallest.targetSets + 1 },
          priority: 4,
        });
      }
    }
  }

  // 5. Consistency: a plan that fits the week beats one that gets skipped.
  const c = input.consistency;
  const expected = c.weeks * c.daysPerWeek;
  if (c.weeks >= 2 && expected > 0 && c.done / expected < 0.6 && c.daysPerWeek > 2) {
    const perWeek = Math.round((c.done / c.weeks) * 10) / 10;
    out.push({
      id: `fewer-days:${c.daysPerWeek}`,
      kind: 'fewer_days',
      title: 'Fit the plan to your week',
      reason: `You're averaging ${perWeek} of ${c.daysPerWeek} planned workouts. A ${Math.max(2, Math.round(perWeek))}-day plan you finish will beat a ${c.daysPerWeek}-day plan you skip.`,
      priority: 5,
    });
  }

  // 6. Recovery: workouts rated near-max effort, week after week.
  if (input.avgSessionRpe !== null && input.avgSessionRpe >= 9) {
    out.push({
      id: 'recovery:rpe',
      kind: 'recovery',
      title: 'Build in some recovery',
      reason: `Your workouts have averaged ${input.avgSessionRpe.toFixed(1)}/10 effort. Leave a rep or two more in the tank, or take a lighter week.`,
      priority: 6,
    });
  }

  // 7. Reassurance when things are working — the most useful advice is "don't change it".
  const progressing = input.exercises.filter((e) => e.trendSessions >= 2 && e.trend > 0).length;
  if (out.length === 0 && progressing > 0) {
    out.push({
      id: `keep-going:${progressing}`,
      kind: 'keep_going',
      title: 'Keep going',
      reason: `${progressing} ${progressing === 1 ? 'lift is' : 'lifts are'} trending up and nothing needs changing. Stick with the plan.`,
      priority: 9,
    });
  }

  return out.sort((a, b) => a.priority - b.priority);
}
