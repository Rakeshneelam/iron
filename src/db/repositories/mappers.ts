/** Small shared converters — kept apart so repositories never import each other in a cycle. */
import type { SetLog } from '@/engine/progression';
import type * as schema from '@/db/schema';

type SetRow = typeof schema.setLog.$inferSelect;

/** DB row -> engine SetLog. `ratio` scales load for history inherited over an exercise_link. */
export function toEngineSet(r: SetRow, ratio = 1): SetLog {
  return {
    weight: r.weight * ratio,
    reps: r.reps,
    rir: r.rir,
    isWarmup: r.isWarmup === 1,
    painFlag: r.painFlag === 1,
  };
}

/** Parse a JSON string[] stored in a text column; anything malformed reads as empty. */
export function parseIdList(text: string | undefined): string[] {
  if (text === undefined) return [];
  try {
    const v: unknown = JSON.parse(text);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function groupBy<T, K>(items: readonly T[], key: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const bucket = out.get(k);
    if (bucket) bucket.push(it);
    else out.set(k, [it]);
  }
  return out;
}
