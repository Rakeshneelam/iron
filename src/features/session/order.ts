/** What the checklist and the dock both need to know about an exercise. */
export type ExState = 'done' | 'partial' | 'todo' | 'skipped';

/** Done or deliberately skipped: either way, there is nothing left to do on it. */
export const isSettled = (s: ExState): boolean => s === 'done' || s === 'skipped';

/**
 * The next exercise with work left, searching the WHOLE session and wrapping past
 * the end. -1 when there is nowhere else to go.
 *
 * The session screen used to search only the slice after the selected exercise, so
 * jumping to the last one, finishing it, and still having three unfinished above
 * left the primary action offering to end the workout — with work visibly left on
 * the checklist (UX-04).
 *
 * `from` itself is never the answer, even when it is unfinished: "next" has to move
 * you. Skipping the exercise you are on would otherwise leave you sitting on it.
 * Use `allSettled` for the separate question of whether anything is left at all.
 */
export function nextPendingIndex(states: readonly ExState[], from: number): number {
  for (let k = 1; k < states.length; k++) {
    const i = (from + k) % states.length;
    const s = states[i];
    if (s !== undefined && !isSettled(s)) return i;
  }
  return -1;
}

/** Nothing left anywhere — the only condition under which Finish is the normal end. */
export function allSettled(states: readonly ExState[]): boolean {
  return states.length > 0 && states.every(isSettled);
}
