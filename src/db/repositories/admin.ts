/**
 * "Delete all my data". Everything personal goes; the built-in exercise and food
 * catalogues stay (they are part of the app, not the user's data) and the seed puts
 * back default equipment. The next launch shows first-run setup again.
 */
import { expoDb } from '@/db/client';
import { seedIfNeeded } from '@/db/seed';

/** Child tables first, so foreign keys never block a delete. */
const USER_TABLES = [
  'set_log', 'exercise_session_stat', 'session_exercise', 'timer_state', 'session',
  'routine_slot', 'routine_day', 'routine', 'weigh_in', 'check_in', 'measurement',
  'meal_log', 'recipe_item', 'recipe', 'water_log', 'exercise_link', 'setting', 'equipment',
] as const;

export function wipeAllData(): void {
  expoDb.withTransactionSync(() => {
    for (const t of USER_TABLES) expoDb.execSync(`DELETE FROM "${t}"`);
    expoDb.execSync('DELETE FROM "exercise" WHERE is_custom = 1');
    expoDb.execSync('DELETE FROM "food" WHERE is_custom = 1');
    expoDb.execSync('UPDATE "food" SET times_used = 0');
  });
  seedIfNeeded();
}
