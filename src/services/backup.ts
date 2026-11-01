/**
 * Drive backup and restore (docs/07-BACKUP.md, and the design spec beside it).
 *
 * The payload is the SQLCipher database file itself, already encrypted with the key
 * derived from the recovery phrase. The phrase rides along in the file's private
 * app properties, so signing in on a new phone restores without typing it: the
 * copy is protected by the Google account that owns the folder, not by a secret
 * that never leaves the phone. Nothing here decrypts the live database.
 */
import { File, Paths } from 'expo-file-system';

import { expoDb, openKeyedDatabaseFile, recoveryPhrase } from '@/db/client';
import { inspectTables, restoreBackup, BACKUP_TABLES, type Inspection } from '@/db/repositories/restore';
import { getRaw, setRaw } from '@/db/repositories/settings';
import { nowISO } from '@/lib/date';
import { normalisePhrase } from '@/lib/recoveryPhrase';

import { deleteBackup, downloadBackup, listBackups, uploadBackup, type DriveFile } from './drive';

/** Keep the last five, per docs/07. Older ones are pruned after a successful upload. */
const KEEP = 5;
const LAST_BACKUP_KEY = 'backup:lastAt';

export const lastBackupAt = (): string | null => getRaw(LAST_BACKUP_KEY) ?? null;
/** After a restore, this phone matches the copy it came from. */
export const markBackedUp = (iso: string): void => setRaw(LAST_BACKUP_KEY, iso);

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
  const phrase = recoveryPhrase();
  try {
    await uploadBackup(name, bytes, phrase ? { phrase: normalisePhrase(phrase) } : undefined);
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

/*
 * When a backup runs is decided by services/cloud: signing in with Google is the
 * consent to sync, and it syncs after a workout, when the app is put away with new
 * data, and on opening if the last copy is old (AGENTS.md §1.1).
 */

export type { DriveFile };
export { listBackups };

/** The newest copy in the cloud, or null when there is none. */
export async function latestBackup(): Promise<DriveFile | null> {
  return (await listBackups())[0] ?? null;
}

/**
 * Puts a cloud copy onto this phone in one step, for a sign-in on a new phone. Only
 * for a copy that carries its phrase; older ones go through the Restore screen,
 * which asks for it. Validates before writing, and writes in one transaction.
 */
export async function restoreFromDrive(file: DriveFile): Promise<{ ok: true; workouts: number } | { ok: false; reason: string }> {
  if (!file.phrase) return { ok: false, reason: 'This copy predates sign-in. Restore it from You → Backup & data with its recovery phrase.' };
  const found = await inspectDriveBackup(file, file.phrase);
  if (!found.ok) return found;
  try {
    return { ok: true, workouts: restoreBackup(found.tables) };
  } catch {
    return { ok: false, reason: 'The restore failed part-way and was undone. Nothing on this phone changed.' };
  }
}

/** Removes every copy from the cloud — part of deleting everything. */
export async function deleteAllBackups(): Promise<void> {
  for (const f of await listBackups()) await deleteBackup(f.id);
}

/**
 * Downloads a Drive backup and reads it with the phrase the user typed. Changes
 * NOTHING: it stages the file in the cache, opens it on its own connection, copies
 * the rows out, validates them against the live schema and hands back a preview.
 *
 * This is the whole of UX-13. Restore advertised "put it back on another phone" and
 * then opened the staged file with the key THIS install holds — which by definition
 * is not the key that encrypted a backup from another phone — so the one case the
 * feature existed for could not work, and the screen only said so afterwards. The
 * phrase now decrypts the staged copy and nothing else: the live database and the
 * key in this phone's keystore are untouched whatever happens here.
 *
 * There is no new crypto. `openKeyedDatabaseFile` is the same helper the app opens
 * itself with, and SQLCipher does its own PBKDF2 over the phrase.
 */
export async function inspectDriveBackup(file: DriveFile, phrase: string): Promise<Inspection> {
  const staged = new File(Paths.cache, 'iron-restore-staging.db');
  const clear = () => {
    try {
      staged.delete();
    } catch {
      /* cache; nothing there, or it will go anyway */
    }
  };

  let bytes: Uint8Array;
  try {
    bytes = await downloadBackup(file.id);
  } catch {
    return { ok: false, reason: 'That backup could not be downloaded. Nothing on this phone was touched.' };
  }

  clear();
  staged.create();
  staged.write(bytes);
  try {
    // A wrong phrase throws on the first read, not on open: SQLCipher cannot tell a
    // bad key from a corrupt file until it tries to decrypt a page.
    const tables = readTables(staged, phrase);
    return inspectTables(tables, { exportedAt: file.createdTime });
  } catch (e) {
    return { ok: false, reason: phraseProblem(e) };
  } finally {
    clear();
  }
}

/** decodePhrase's messages are already written for the person typing. */
function phraseProblem(e: unknown): string {
  const message = e instanceof Error ? e.message : '';
  if (message.includes('recovery phrase')) return message;
  return 'That phrase does not open this backup. Check it against the one shown on the phone that made it.';
}

type Row = Record<string, unknown>;

/**
 * Reads every backed-up table out of a database file, with the given phrase or —
 * when none is supplied — this install's own key.
 */
function readTables(file: File, phrase?: string): Record<string, Row[]> {
  const handle = openKeyedDatabaseFile(file.uri.replace('file://', ''), phrase);
  try {
    const out: Record<string, Row[]> = {};
    for (const t of BACKUP_TABLES) out[t] = handle.getAllSync<Row>(`SELECT * FROM "${t}"`);
    return out;
  } finally {
    handle.closeSync();
  }
}
