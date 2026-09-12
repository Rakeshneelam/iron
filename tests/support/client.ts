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

function migrationFiles(): string[] {
  const dir = join(ROOT, 'drizzle');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(dir, f));
}

function applyMigration(file: string): void {
  for (const stmt of readFileSync(file, 'utf8').split('--> statement-breakpoint')) {
    const sql = stmt.trim();
    if (sql) expoDb.exec(sql);
  }
}

/** Applies every generated migration, in order, exactly as the app would. */
function migrateAll(): void {
  for (const f of migrationFiles()) applyMigration(f);
}

/**
 * Rebuilds the database with only the first `count` migrations applied — the shape an
 * older install would have. `upgrade()` then applies the rest, as an app update does.
 */
export function rollbackTo(count: number): void {
  dropEverything();
  for (const f of migrationFiles().slice(0, count)) applyMigration(f);
}

export function upgrade(from: number): void {
  for (const f of migrationFiles().slice(from)) applyMigration(f);
}

function dropEverything(): void {
  expoDb.execSync('PRAGMA foreign_keys = OFF;');
  for (const t of tableNames()) expoDb.execSync(`DROP TABLE IF EXISTS "${t}"`);
  expoDb.execSync('PRAGMA foreign_keys = ON;');
}

function tableNames(): string[] {
  return expoDb
    .getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .map((r) => r.name);
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
  // A test may have rolled the schema back; put it back before clearing.
  if (tableNames().length < 19) rollbackTo(Number.MAX_SAFE_INTEGER);
  expoDb.execSync('PRAGMA foreign_keys = OFF;');
  for (const t of tableNames()) expoDb.execSync(`DELETE FROM "${t}"`);
  expoDb.execSync('PRAGMA foreign_keys = ON;');
}
