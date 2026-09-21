/**
 * Drive backup and restore (docs/07-BACKUP.md, and the design spec beside it).
 *
 * The payload is the SQLCipher database file itself, already encrypted with the key
 * derived from the recovery phrase. Nothing here handles the phrase, and nothing
 * here decrypts: the bytes leave the phone unreadable and come back unreadable.
 */
import { File, Paths } from 'expo-file-system';

import { expoDb, openKeyedDatabaseFile } from '@/db/client';
import { inspectTables, BACKUP_TABLES, type Inspection } from '@/db/repositories/restore';
import { getRaw, setRaw } from '@/db/repositories/settings';
import { nowISO } from '@/lib/date';

import { deleteBackup, downloadBackup, listBackups, uploadBackup, type DriveFile } from './drive';

/** Keep the last five, per docs/07. Older ones are pruned after a successful upload. */
const KEEP = 5;
const LAST_BACKUP_KEY = 'backup:lastAt';

export const lastBackupAt = (): string | null => getRaw(LAST_BACKUP_KEY) ?? null;

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

/*
 * There is deliberately no backupIfDue() here any more.
 *
 * AGENTS.md §1 allows exactly one network call, "an optional, USER-INITIATED
 * encrypted backup". A daily upload fired from the root layout on every cold start
 * is not user-initiated, and connecting Drive used to switch it on by itself — so
 * ticking a box to reach a restore also signed you up to a background upload.
 * The switch, the startup call and the "on Wi-Fi, in the background" copy that
 * described a Wi-Fi check nothing implemented are all gone (UX-12, UX-13).
 *
 * Backing up is Back up now. If scheduled backups are wanted later they need a real
 * design — a constraint-aware job, a visible state, and words that match it.
 */

export type { DriveFile };
export { listBackups };

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
