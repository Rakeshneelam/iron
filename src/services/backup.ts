/**
 * Drive backup and restore (docs/07-BACKUP.md, and the design spec beside it).
 *
 * The payload is the SQLCipher database file itself, already encrypted with the key
 * derived from the recovery phrase. Nothing here handles the phrase, and nothing
 * here decrypts: the bytes leave the phone unreadable and come back unreadable.
 */
import { File, Paths } from 'expo-file-system';

import { expoDb, openKeyedDatabaseFile } from '@/db/client';
import { restoreBackup, BACKUP_TABLES } from '@/db/repositories/restore';
import { getRaw, setRaw } from '@/db/repositories/settings';
import { nowISO } from '@/lib/date';

import { deleteBackup, downloadBackup, listBackups, uploadBackup, type DriveFile } from './drive';

/** Keep the last five, per docs/07. Older ones are pruned after a successful upload. */
const KEEP = 5;
const LAST_BACKUP_KEY = 'backup:lastAt';
const AUTO_KEY = 'backup:auto';

export const lastBackupAt = (): string | null => getRaw(LAST_BACKUP_KEY) ?? null;
export const autoBackupOn = (): boolean => getRaw(AUTO_KEY) === 'true';
export const setAutoBackup = (on: boolean): void => setRaw(AUTO_KEY, String(on));

function stamp(): string {
  // iron-2026-09-12-1614.db.enc — sorts chronologically as a plain string.
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `iron-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.db.enc`;
}

/**
 * A consistent copy of the database. The checkpoint is not optional: without it the
 * most recent writes are still sitting in the -wal file and the copy is stale or torn.
 */
async function snapshot(): Promise<{ file: File; bytes: Uint8Array }> {
  expoDb.execSync('PRAGMA wal_checkpoint(FULL);');
  const source = new File(`file://${expoDb.databasePath}`);
  const copy = new File(Paths.cache, 'iron-backup-staging.db');
  try {
    copy.delete();
  } catch {
    /* nothing there */
  }
  await source.copy(copy);
  return { file: copy, bytes: await copy.bytes() };
}

/** Uploads a fresh backup and prunes old ones. Returns the name written. */
export async function backupNow(): Promise<string> {
  const { file, bytes } = await snapshot();
  const name = stamp();
  try {
    await uploadBackup(name, bytes);
  } finally {
    try {
      file.delete();
    } catch {
      /* cache, it will go anyway */
    }
  }
  setRaw(LAST_BACKUP_KEY, nowISO());

  // Pruning failures are not backup failures: the new copy is already safe.
  try {
    const old = (await listBackups()).slice(KEEP);
    for (const f of old) await deleteBackup(f.id);
  } catch {
    /* try again next time */
  }
  return name;
}

/**
 * Backs up at most once a day, and only when asked to. Called on app start; any
 * failure is swallowed, because a backup must never be something the user waits for
 * or gets interrupted by (AGENTS.md §1.4).
 */
export async function backupIfDue(): Promise<void> {
  if (!autoBackupOn()) return;
  const last = lastBackupAt();
  if (last && Date.now() - Date.parse(last) < 24 * 60 * 60 * 1000) return;
  await backupNow().catch(() => undefined);
}

export type { DriveFile };
export { listBackups };

/**
 * Restores a Drive backup into the live database.
 *
 * The downloaded file is encrypted with the key this install already holds, so it is
 * opened as its own keyed connection and its rows are copied across — rather than
 * swapped in as a file, which would need a restart the app has no way to perform.
 * Everything below reuses the same validated, transactional apply as a file restore.
 */
export async function restoreFromDrive(fileId: string): Promise<number> {
  const bytes = await downloadBackup(fileId);
  const staged = new File(Paths.cache, 'iron-restore-staging.db');
  try {
    staged.delete();
  } catch {
    /* nothing there */
  }
  staged.create();
  staged.write(bytes);

  const tables = readTables(staged);
  const n = restoreBackup(tables);
  try {
    staged.delete();
  } catch {
    /* cache */
  }
  return n;
}

type Row = Record<string, unknown>;

/**
 * Reads every backed-up table out of a database file. Opened through the same keyed
 * path the app uses, so a file from another install — encrypted with a different
 * phrase — simply fails to read rather than importing nonsense.
 */
function readTables(file: File): Record<string, Row[]> {
  const handle = openKeyedDatabaseFile(file.uri.replace('file://', ''));
  try {
    const out: Record<string, Row[]> = {};
    for (const t of BACKUP_TABLES) out[t] = handle.getAllSync<Row>(`SELECT * FROM "${t}"`);
    return out;
  } finally {
    handle.closeSync();
  }
}

