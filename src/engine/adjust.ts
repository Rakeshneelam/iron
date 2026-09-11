/**
 * Real-life adjustments on top of prescribe(). PURE.
 *
 * prescribe() reads the last session as if it were yesterday. People are not that
 * consistent, so:
 *   - after ~1½–3 weeks away: no load increase until one session repeats the old weight;
 *   - after 3+ weeks: start lighter — strength measurably drops after 3–4 weeks of
 *     detraining, and it returns quickly, so a lighter restart costs little;
 *   - timed exercises and bands can't "add 2.5 kg", so the advice changes instead.
 * Each adjustment rewrites the reason so the user always sees why.
 */
import type { Prescription, Verdict } from './progression.ts';

export type Adjustment = 'hold-gap' | 'return' | 'timed' | 'band';
export interface Adjusted extends Prescription {
  adjustment?: Adjustment;
}

const snap = (kg: number, step: number) => (step > 0 ? Math.max(0, Math.round(kg / step) * step) : kg);

export function adjustForGap(p: Prescription, daysSinceLast: number | null, lastTopKg: number | null, loadStep: number): Adjusted {
  if (daysSinceLast === null || lastTopKg === null || p.verdict === 'CALIBRATE' || daysSinceLast < 11) return p;
  if (daysSinceLast < 21) {
    if (p.verdict !== 'ADD_LOAD' && p.verdict !== 'ADD_SET') return p;
    return {
      ...p,
      verdict: 'HOLD',
      weight: lastTopKg,
      adjustment: 'hold-gap',
      reason: `${daysSinceLast} days since you last did this — repeat ${lastTopKg} kg once before adding more.`,
    };
  }
  const long = daysSinceLast >= 42;
  const factor = long ? 0.8 : 0.9;
  const weeks = Math.round(daysSinceLast / 7);
  return {
    ...p,
    verdict: 'BACKOFF',
    weight: snap(lastTopKg * factor, loadStep),
    repTarget: [p.repTarget[0], p.repTarget[1]],
    adjustment: 'return',
    reason: `About ${weeks} weeks since you last did this. Starting ~${long ? 20 : 10}% lighter — strength usually comes back within a few sessions.`,
  };
}

/** Timed sets: reps are seconds, and "add load" becomes "harder variation or longer". */
export function adaptForTime(p: Prescription, lastTopKg: number | null, harderName?: string): Adjusted {
  const reason = p.reason.replace(/(\d+)-rep\b/g, '$1-second').replace(/\breps\b/g, 's').replace(/\brep\b/g, 's');
  if (p.verdict !== 'ADD_LOAD') return { ...p, reason, adjustment: 'timed' };
  return {
    ...p,
    verdict: 'HOLD',
    weight: lastTopKg ?? 0,
    adjustment: 'timed',
    reason: `You held the top of the range on every set. ${harderName ? `Try ${harderName} next, or` : 'Add a little load, or'} keep the time and slow it down.`,
  };
}

/** Bands: the "weight" is the band you use; progress = a stronger band. */
export function adaptForBand(p: Prescription, lastTopKg: number | null): Adjusted {
  if (p.verdict !== 'ADD_LOAD') return { ...p, weight: lastTopKg ?? p.weight, adjustment: 'band' };
  return {
    ...p,
    weight: lastTopKg ?? p.weight,
    adjustment: 'band',
    reason: 'Every set reached the top of the range. Use a stronger band (or step further from the anchor) and start again at the bottom of the range.',
  };
}

/** The general rule behind each verdict — shown under "Why this?". */
export const RULE_TEXT: Record<Verdict, string> = {
  CALIBRATE: 'No history yet. Pick a weight you could lift a few more times than the top of the range, and log how many reps you had left — the next session builds on it.',
  ADD_LOAD: 'Every working set reached the top of the rep range at or below your target effort, so the weight goes up by the smallest step and the reps restart at the bottom of the range.',
  ADD_REPS: 'You are inside the rep range: same weight, one more rep on each set until every set reaches the top.',
  ADD_SET: 'Estimated strength has been flat for 3+ sessions and this muscle has room for more weekly volume, so one extra set comes before any cut in load.',
  HOLD: 'You were just short of the target (or it took more effort than planned), so the weight stays until the sets are clean.',
  BACKOFF: 'Reps fell well below the range, pain was flagged, or you are coming back after time off, so the load drops to rebuild with good reps.',
  RESET: 'Flat for several sessions with plenty of volume already: drop about 10% and work back up — you usually pass the old best within a few sessions.',
  SWAP: 'Still flat after two resets: a different variation for the same muscle usually restarts progress, with your numbers carried over.',
  DELOAD: 'You accepted a lighter week: fewer sets and lighter loads so fatigue can clear.',
};
