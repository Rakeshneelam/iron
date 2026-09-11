/**
 * The weekly summary in words. PURE. Only statements the data supports, most
 * important first, at most three — no generic motivation.
 */

export type LiftRegion = 'push' | 'pull' | 'legs' | 'other';
export type GoalPhase = 'cut' | 'recomp' | 'maintain' | 'bulk';

export interface WeekFacts {
  planned: number;
  done: number;
  skipped: number;
  /** Working sets by body half, this week and last. */
  sets: { upper: number; lower: number };
  prevSets: { upper: number; lower: number };
  lifts: readonly { name: string; region: LiftRegion; e1rmDelta: number | null }[];
  records: number;
  /** Change in smoothed bodyweight across the week, kg. */
  bodyweightChange: number | null;
  goal: GoalPhase;
  water: { hit: number; days: number };
  /** Day labels of plan days skipped this week. */
  skippedLabels: readonly string[];
  /** Food logging for the week; null when the user doesn't track food at all. */
  nutrition: { daysLogged: number; days: number; avgProteinG: number; targetProteinG: number } | null;
}

const REGION_NOUN: Record<LiftRegion, string> = { push: 'pressing', pull: 'pulling', legs: 'lower-body', other: 'overall' };
const GOAL_WORD: Record<GoalPhase, string> = { cut: 'fat-loss', recomp: 'recomp', maintain: 'maintenance', bulk: 'muscle-gain' };
const r1 = (n: number) => Math.round(n * 10) / 10;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(r1(n))}`;

export function weeklyInsights(f: WeekFacts): string[] {
  const out: { text: string; weight: number }[] = [];

  if (f.planned > 0 && f.done === 0) {
    out.push({ text: 'No workouts this week. Your next session is waiting where you left off — no need to catch up.', weight: 5 });
  }

  for (const region of ['push', 'pull', 'legs'] as const) {
    const moved = f.lifts.filter((l) => l.region === region && l.e1rmDelta !== null);
    const ups = moved.filter((l) => (l.e1rmDelta ?? 0) > 0.5).sort((a, b) => (b.e1rmDelta ?? 0) - (a.e1rmDelta ?? 0));
    const downs = moved.filter((l) => (l.e1rmDelta ?? 0) < -0.5);
    const top = ups[0];
    if (top && ups.length >= downs.length) {
      out.push({ text: `Your ${REGION_NOUN[region]} strength improved (${top.name} ${signed(top.e1rmDelta ?? 0)} kg estimated 1RM).`, weight: 3 });
    } else if (downs.length >= 2 && ups.length === 0) {
      out.push({ text: `Several ${REGION_NOUN[region]} lifts dipped — more likely fatigue or a short week than lost strength.`, weight: 2.5 });
    }
  }

  for (const half of ['upper', 'lower'] as const) {
    const prev = f.prevSets[half];
    const now = f.sets[half];
    if (prev >= 6 && now < prev * 0.7) {
      const why = f.skippedLabels.length ? ` — ${f.skippedLabels.join(' and ')} ${f.skippedLabels.length === 1 ? 'was' : 'were'} skipped` : '';
      out.push({ text: `${half === 'upper' ? 'Upper' : 'Lower'}-body volume dropped ${Math.round((1 - now / prev) * 100)}%${why}.`, weight: 3 });
    }
  }

  if (f.planned > 0 && f.done > 0) {
    out.push(
      f.done >= f.planned
        ? { text: `All ${f.planned} planned workouts done.`, weight: 1 }
        : { text: `${f.done} of ${f.planned} planned workouts done.`, weight: 1.5 },
    );
  }

  if (f.records > 0) out.push({ text: `${f.records} personal ${f.records === 1 ? 'record' : 'records'} this week.`, weight: 2 });

  const bw = f.bodyweightChange;
  if (bw !== null && Math.abs(bw) >= 0.1) {
    const onTrack = f.goal === 'cut' ? bw < 0 : f.goal === 'bulk' ? bw > 0 : Math.abs(bw) < 0.3;
    out.push(
      onTrack
        ? { text: `Weight trend ${signed(bw)} kg — in line with your ${GOAL_WORD[f.goal]} goal.`, weight: 1 }
        : { text: `Weight trend ${signed(bw)} kg — moving against your ${GOAL_WORD[f.goal]} goal.`, weight: 2.5 },
    );
  }

  // Protein is the one macro that measurably changes what training does; flag it only
  // when there is enough logging to mean something, and never nag about the rest.
  const n = f.nutrition;
  if (n && n.daysLogged >= 3 && n.targetProteinG > 0) {
    const gap = n.targetProteinG - n.avgProteinG;
    if (gap > n.targetProteinG * 0.15) {
      out.push({ text: `Protein averaged ${Math.round(n.avgProteinG)} g on the days you logged, against a ${Math.round(n.targetProteinG)} g target.`, weight: 2 });
    } else if (n.daysLogged >= 5) {
      out.push({ text: `Protein held at ${Math.round(n.avgProteinG)} g a day across ${n.daysLogged} logged days.`, weight: 1 });
    }
  } else if (n && n.daysLogged > 0 && n.daysLogged < 3 && n.days >= 7) {
    out.push({ text: `Food logged on ${n.daysLogged} of ${n.days} days — a few more and the calorie estimate starts working.`, weight: 1 });
  }

  if (f.water.days >= 3) {
    const ratio = f.water.hit / f.water.days;
    if (ratio < 0.5) out.push({ text: `Water target hit on ${f.water.hit} of ${f.water.days} days — the easiest win this week.`, weight: 2 });
  }

  return out
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((x) => x.text);
}
