/**
 * Restore (docs/superpowers/specs/2026-09-12-backup-and-restore-design.md).
 *
 * Reads a backup, checks it fits this build, and replaces everything. Two rules
 * shape the whole file:
 *
 *   1. Nothing is touched until validation has passed, and the replacement itself
 *      runs in one transaction — so a bad row, a failed constraint or the app being
 *      killed mid-restore all leave the database exactly as it was. That is why
 *      there is no safety copy to manage and no recovery path to get wrong.
 *   2. A backup file is untrusted input. Table and column names are checked against
 *      the live schema before they reach any SQL, and every value is bound, never
 *      interpolated.
 */
import { expoDb } from '@/db/client';
import { seedIfNeeded } from '@/db/seed';

type Row = Record<string, unknown>;

/**
 * What a backup contains, parents before children so inserts satisfy foreign keys
 * even without the deferral below. `services/export.ts` writes exactly this list.
 */
export const BACKUP_TABLES = [
  'exercise', 'exercise_link', 'equipment', 'routine', 'routine_day', 'routine_slot', 'session', 'session_exercise', 'set_log',
  'exercise_session_stat', 'weigh_in', 'check_in', 'measurement', 'food', 'recipe', 'recipe_item', 'meal_log', 'water_log', 'setting',
] as const;

/** Built-in exercises and foods are app data, not the user's — the same line wipeAllData draws. */
const CATALOGUE = new Set(['exercise', 'food']);

export interface BackupSummary {
  exportedAt: string | null;
  appVersion: string | null;
  workouts: number;
  weighIns: number;
  foodDays: number;
  /** Span of the training history inside the backup. */
  from: string | null;
  to: string | null;
  /** What this phone has logged since the backup, i.e. what restoring would remove. */
  losesWorkouts: number;
  losesWeighIns: number;
}

export type Inspection = { ok: true; summary: BackupSummary; tables: Record<string, Row[]> } | { ok: false; reason: string };

interface ColumnInfo {
  name: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

function columnsOf(table: string): ColumnInfo[] {
  return expoDb.getAllSync<ColumnInfo>(`PRAGMA table_info("${table}")`);
}

const isObject = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Structural validation against the live schema, which is what makes it safe to
 * accept the backups written before the format carried a version at all.
 */
function checkShape(tables: Record<string, unknown>): string | null {
  for (const [name, rows] of Object.entries(tables)) {
    if (!BACKUP_TABLES.includes(name as (typeof BACKUP_TABLES)[number])) {
      return 'This backup is from a newer version of Iron. Update the app, then restore.';
    }
    if (!Array.isArray(rows)) return "This file isn't an Iron backup.";

    const live = columnsOf(name);
    if (live.length === 0) return "This file isn't an Iron backup.";
    const known = new Set(live.map((c) => c.name));
    const required = live.filter((c) => c.notnull === 1 && c.dflt_value === null && c.pk === 0).map((c) => c.name);

    for (const row of rows as unknown[]) {
      if (!isObject(row)) return "This file isn't an Iron backup.";
      for (const key of Object.keys(row)) {
        if (!known.has(key)) {
          return 'This backup is from a newer version of Iron. Update the app, then restore.';
        }
      }
      // A column added after the backup was taken is fine when it is nullable or has
      // a default; a required one means the file simply cannot be represented here.
      for (const col of required) {
        if (!(col in row)) {
          return `This backup is missing "${col}", which this version of Iron needs. It may be from a much older build.`;
        }
      }
    }
  }
  return null;
}

const countRows = (sql: string): number => Number((expoDb.getAllSync<{ n: number }>(sql)[0]?.n ?? 0));

function summarise(tables: Record<string, Row[]>, envelope: Row): BackupSummary {
  const sessions = tables.session ?? [];
  const dates = sessions.map((s) => String(s.date ?? '')).filter(Boolean).sort();
  const mealDays = new Set((tables.meal_log ?? []).map((m) => String(m.date ?? '')));
  const to = dates[dates.length - 1] ?? null;

  // "Since the backup" is what the user actually stands to lose, so it is measured
  // against the newest thing in the file rather than against its export timestamp.
  const after = to ? `'${to.replace(/'/g, "''")}'` : null;
  return {
    exportedAt: typeof envelope.exportedAt === 'string' ? envelope.exportedAt : null,
    appVersion: typeof envelope.appVersion === 'string' ? envelope.appVersion : null,
    workouts: sessions.length,
    weighIns: (tables.weigh_in ?? []).length,
    foodDays: mealDays.size,
    from: dates[0] ?? null,
    to,
    losesWorkouts: after ? countRows(`SELECT count(*) AS n FROM "session" WHERE date > ${after}`) : countRows(`SELECT count(*) AS n FROM "session"`),
    losesWeighIns: after ? countRows(`SELECT count(*) AS n FROM "weigh_in" WHERE date > ${after}`) : countRows(`SELECT count(*) AS n FROM "weigh_in"`),
  };
}

/** Reads a backup and reports what is in it. Changes nothing. */
export function inspectBackup(text: string): Inspection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "This file isn't an Iron backup." };
  }
  if (!isObject(parsed)) return { ok: false, reason: "This file isn't an Iron backup." };

  // The readable summary export sits in the same folder as the backup, so picking it
  // is the likeliest mistake anyone will make. Name the right file rather than refuse.
  if (typeof parsed.schema === 'string' && parsed.schema.startsWith('iron.export')) {
    return { ok: false, reason: "That's the readable summary export. The one you want is named iron-backup-<date>.json." };
  }
  if (parsed.app !== 'iron' || !isObject(parsed.tables)) {
    return { ok: false, reason: "This file isn't an Iron backup." };
  }

  const problem = checkShape(parsed.tables);
  if (problem) return { ok: false, reason: problem };

  const tables = parsed.tables as Record<string, Row[]>;
  return { ok: true, summary: summarise(tables, parsed), tables };
}

function insert(table: string, row: Row, orIgnore: boolean): void {
  const cols = Object.keys(row);
  if (cols.length === 0) return;
  const quoted = cols.map((c) => `"${c}"`).join(', ');
  const holes = cols.map(() => '?').join(', ');
  const verb = orIgnore ? 'INSERT OR IGNORE' : 'INSERT';
  expoDb.runSync(
    `${verb} INTO "${table}" (${quoted}) VALUES (${holes})`,
    cols.map((c) => row[c] as never),
  );
}

/**
 * Replaces everything with the backup. Returns the number of workouts restored.
 * Throws if anything goes wrong, having changed nothing.
 */
export function restoreBackup(tables: Record<string, Row[]>): number {
  expoDb.withTransactionSync(() => {
    // Deferring means insert order cannot break a foreign key mid-restore; integrity
    // is still checked, once, at commit.
    expoDb.execSync('PRAGMA defer_foreign_keys = ON');

    for (const t of [...BACKUP_TABLES].reverse()) {
      if (CATALOGUE.has(t)) expoDb.execSync(`DELETE FROM "${t}" WHERE is_custom = 1`);
      else expoDb.execSync(`DELETE FROM "${t}"`);
    }

    for (const t of BACKUP_TABLES) {
      for (const row of tables[t] ?? []) {
        // A built-in the current catalogue already has is left alone; one it has since
        // dropped is put back, because the backup's meals and sets still point at it.
        insert(t, row, CATALOGUE.has(t) && row.is_custom === 0);
      }
    }
  });
  seedIfNeeded();
  return (tables.session ?? []).length;
}
