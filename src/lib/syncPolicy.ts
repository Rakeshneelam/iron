/**
 * When Iron syncs to the cloud on its own. Pure, so the rules are testable.
 *
 * Syncing is a whole-database upload of a few megabytes, so it happens at the
 * moments that matter — a workout finished, the app put away with new data, or an
 * open after a long gap — and never on every tap.
 */

const HOUR = 3_600_000;

/** On opening: catch up when there is no copy yet, or the newest is this many hours old. */
export const OPEN_AFTER_HOURS = 12;
/** Putting the app away syncs at most this often, so switching apps mid-day is not an upload each time. */
export const BACKGROUND_EVERY_MINUTES = 15;

/** True when the last sync is missing, unreadable, or older than `hours`. */
export function isDue(lastISO: string | null, nowMs: number, hours = OPEN_AFTER_HOURS): boolean {
  if (!lastISO) return true;
  const at = Date.parse(lastISO);
  return !Number.isFinite(at) || nowMs - at >= hours * HOUR;
}

/**
 * Whether putting the app away should sync now: only with new data, never in the
 * middle of a workout (finishing it syncs), and not again within a few minutes.
 */
export function shouldSyncOnBackground(opts: { dirty: boolean; workoutOpen: boolean; lastAttemptMs: number | null; nowMs: number }): boolean {
  if (!opts.dirty || opts.workoutOpen) return false;
  return opts.lastAttemptMs === null || opts.nowMs - opts.lastAttemptMs >= BACKGROUND_EVERY_MINUTES * 60_000;
}
