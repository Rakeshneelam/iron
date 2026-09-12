/**
 * Stands in for `@/db/client` under `node --test`: same exports, backed by an
 * in-memory database with the real migrations applied. See `register.ts`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import * as schema from '../../src/db/schema.ts';
import { TestSqlite } from './sqlite.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

export const DB_NAME = 'iron-test.db';
export const expoDb = new TestSqlite();
export const db: BetterSQLite3Database<typeof schema> = drizzle(expoDb as never, { schema });

/** Applies every generated migration, in order, exactly as the app would. */
function migrateAll(): void {
  const dir = join(ROOT, 'drizzle');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    for (const stmt of readFileSync(join(dir, file), 'utf8').split('--> statement-breakpoint')) {
      const sql = stmt.trim();
      if (sql) expoDb.exec(sql);
    }
  }
}

let ready = false;
export async function initDatabase(): Promise<void> {
  if (ready) return;
  ready = true;
  expoDb.execSync('PRAGMA foreign_keys = ON;');
  migrateAll();
}

/** Wipes every table so each test starts from the same place. */
export function resetDatabase(): void {
  const tables = expoDb
    .getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .map((r) => r.name);
  expoDb.execSync('PRAGMA foreign_keys = OFF;');
  for (const t of tables) expoDb.execSync(`DELETE FROM "${t}"`);
  expoDb.execSync('PRAGMA foreign_keys = ON;');
}
