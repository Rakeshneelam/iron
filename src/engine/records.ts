/**
 * Personal records. PURE. Subtle on purpose — facts, no confetti.
 * A first-ever session is never a "record"; there is nothing to beat yet.
 */

export interface LoggedSet {
  weight: number;
  reps: number;
  e1rm: number;
}

export type RecordKind = 'weight' | 'reps' | 'e1rm' | 'volume';

export interface RecordEvent {
  kind: RecordKind;
  value: number;
  previous: number;
  label: string;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/**
 * @param prior   working sets from earlier sessions, grouped per session
 * @param current working sets from this session
 */
export function detectRecords(prior: readonly (readonly LoggedSet[])[], current: readonly LoggedSet[], timed = false): RecordEvent[] {
  const before = prior.flat();
  if (before.length === 0 || current.length === 0) return [];
  const out: RecordEvent[] = [];

  if (timed) {
    const best = Math.max(...before.map((s) => s.reps));
    const now = Math.max(...current.map((s) => s.reps));
    if (now > best) out.push({ kind: 'reps', value: now, previous: best, label: `Longest: ${now} s` });
    return out;
  }

  const maxW = Math.max(...before.map((s) => s.weight));
  const curW = Math.max(...current.map((s) => s.weight));
  if (curW > maxW + 1e-6) out.push({ kind: 'weight', value: curW, previous: maxW, label: `Heaviest: ${fmt(curW)} kg` });

  const maxE = Math.max(...before.map((s) => s.e1rm));
  const curE = Math.max(...current.map((s) => s.e1rm));
  if (curE > maxE + 0.5) out.push({ kind: 'e1rm', value: curE, previous: maxE, label: `Best estimated 1-rep max: ${fmt(Math.round(curE * 10) / 10)} kg` });

  // Most reps at a weight you had lifted before (a weight PR already covers new weights).
  let best: RecordEvent | null = null;
  for (const s of current) {
    if (s.weight > maxW + 1e-6) continue;
    const atOrAbove = before.filter((b) => b.weight >= s.weight - 1e-6);
    if (atOrAbove.length === 0) continue;
    const prev = Math.max(...atOrAbove.map((b) => b.reps));
    if (s.reps > prev && (!best || s.reps - prev > best.value - best.previous)) {
      best = { kind: 'reps', value: s.reps, previous: prev, label: `${s.reps} reps at ${fmt(s.weight)} kg — most ever` };
    }
  }
  if (best) out.push(best);

  const vol = (sets: readonly LoggedSet[]) => sets.reduce((t, s) => t + s.weight * s.reps, 0);
  const maxVol = Math.max(...prior.map(vol));
  const curVol = vol(current);
  if (maxVol > 0 && curVol > maxVol * 1.02) out.push({ kind: 'volume', value: curVol, previous: maxVol, label: `Most volume in one session: ${Math.round(curVol)} kg` });
  return out;
}

const MILESTONES = [10, 25, 50, 100, 150, 200, 300, 400, 500, 750, 1000];

/** "25 workouts logged" when a round number is crossed; otherwise null. */
export function workoutMilestone(total: number): string | null {
  return MILESTONES.includes(total) ? `${total} workouts logged` : null;
}
