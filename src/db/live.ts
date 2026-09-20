/**
 * Synchronous reactive reads.
 *
 * Drizzle's `useLiveQuery` starts every mount with `data = []` and fills it in an
 * effect, so each screen would flash empty on open — the skeleton docs/05 bans.
 * This hook reads synchronously on the first render (expo-sqlite is sync, reads
 * are sub-frame) and re-reads when expo-sqlite reports a write to a watched table.
 * Requires `enableChangeListener: true`, set in `@/db/client`.
 */
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect, useMemo, useReducer } from 'react';

/** SQLite table names (snake_case), as reported by the change listener. */
export type TableName =
  | 'exercise' | 'exercise_link' | 'equipment' | 'routine' | 'routine_day' | 'routine_slot'
  | 'session' | 'session_exercise' | 'set_log' | 'exercise_session_stat' | 'weigh_in' | 'check_in' | 'measurement' | 'food'
  | 'recipe' | 'recipe_item' | 'meal_log' | 'water_log' | 'setting' | 'timer_state';

export function useLive<T>(read: () => T, tables: readonly TableName[], deps: readonly unknown[] = []): T {
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  const key = tables.join('|');

  useEffect(() => {
    const watched = new Set(key.split('|'));
    const sub = addDatabaseChangeListener((event) => {
      if (watched.has(event.tableName)) bump();
    });
    return () => sub.remove();
  }, [key]);

  // `read` is an inline closure; what it depends on is `deps` plus the DB version.
  // Deps are a handful of ids and dates, so one string key stands in for the list.
  const depsKey = JSON.stringify(deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => read(), [version, key, depsKey]);
}
