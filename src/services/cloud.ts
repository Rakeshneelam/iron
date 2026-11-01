/**
 * Sign in with Google, and cloud sync (AGENTS.md §1.1–1.2, docs/07-BACKUP.md).
 *
 * The account is the user's Google account and the cloud is their own Drive's
 * hidden app folder; Iron runs no server. Signing in is the consent to sync. From
 * then on an encrypted copy goes up after a workout, when the app is put away with
 * new data, and on opening after a long gap (lib/syncPolicy) — in the background,
 * never in front of a tap. A new phone signs in and gets everything back.
 *
 * One phone at a time: the newest copy wins and nothing is merged.
 */
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { getActiveSession } from '@/db/repositories/sessions';
import { deleteRaw, getRaw, setRaw } from '@/db/repositories/settings';
import { isDue, shouldSyncOnBackground } from '@/lib/syncPolicy';

import { backupNow, deleteAllBackups, lastBackupAt, latestBackup, markBackedUp, restoreFromDrive, type DriveFile } from './backup';
import { disconnect, isConfigured, signInAccount, silentAccount, type GoogleAccount } from './drive';

const EMAIL = 'cloud:email';
const NAME = 'cloud:name';
const ERROR = 'cloud:error';

export interface CloudAccount {
  email: string;
  name: string | null;
}

/** False only for a build made without the Google client ID. */
export const cloudAvailable = (): boolean => isConfigured();

/** Who is signed in, read from this phone — synchronous, so a screen can show it on its first frame. */
export function cloudAccount(): CloudAccount | null {
  const email = getRaw(EMAIL);
  return email ? { email, name: getRaw(NAME) ?? null } : null;
}

/** Why the newest sync failed, until one succeeds. */
export const cloudError = (): string | null => getRaw(ERROR) ?? null;

function remember(a: CloudAccount): void {
  setRaw(EMAIL, a.email);
  if (a.name) setRaw(NAME, a.name);
  else deleteRaw(NAME);
}

function forget(): void {
  deleteRaw(EMAIL);
  deleteRaw(NAME);
  deleteRaw(ERROR);
}

/**
 * Runs a restore without letting it change who is signed in here. A copy carries
 * its own settings — including another phone's sign-in, or none — and either would
 * leave this phone claiming an account it has no session for.
 */
export function keepingSignIn<T>(restore: () => T): T {
  const account = cloudAccount();
  try {
    return restore();
  } finally {
    if (account) remember(account);
    else forget();
  }
}

/** Google's errors, in words someone can act on. */
function describe(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string | number }).code;
  if (message.includes('DEVELOPER_ERROR') || code === '10' || code === 10) return "Google sign-in isn't set up for this version of Iron yet.";
  if (/network|failed to fetch|timed? ?out|unable to resolve/i.test(message)) return 'No connection. Iron will try again later.';
  return message || 'Something went wrong with Google.';
}

export type SignIn = { kind: 'cancelled' } | { kind: 'failed'; reason: string } | { kind: 'signed-in'; account: GoogleAccount; backup: DriveFile | null };

/** Google's account picker, then a look for a copy already in the cloud. */
export async function signIn(): Promise<SignIn> {
  try {
    const account = await signInAccount();
    if (!account) return { kind: 'cancelled' };
    remember({ email: account.email, name: account.givenName ?? account.name });
    deleteRaw(ERROR);
    let backup: DriveFile | null = null;
    try {
      backup = await latestBackup();
    } catch {
      /* signed in all the same; the first sync will say if Drive is unreachable */
    }
    return { kind: 'signed-in', account, backup };
  } catch (e) {
    return { kind: 'failed', reason: describe(e) };
  }
}

/** Stops syncing and forgets the account here. Everything on this phone stays. */
export async function signOut(): Promise<void> {
  await disconnect();
  forget();
}

/** Every cloud copy, gone — for "delete all my data". */
export async function deleteCloudCopies(): Promise<void> {
  await deleteAllBackups();
}

/**
 * Replaces this phone's data with a cloud copy. The copy carries its own settings,
 * which would otherwise overwrite who is signed in here, so the sign-in is put back.
 */
export async function restoreLatest(file: DriveFile): Promise<{ ok: true; workouts: number } | { ok: false; reason: string }> {
  const account = cloudAccount();
  const result = await restoreFromDrive(file);
  if (account) remember(account);
  else forget();
  if (result.ok) markBackedUp(file.createdTime);
  return result;
}

export type SyncResult = { ok: true } | { ok: false; reason: string };

let inFlight: Promise<SyncResult> | null = null;
/** Something other than settings changed since the last copy went up. */
let dirty = false;
let lastAttempt: number | null = null;

/** Uploads a fresh copy now. One at a time: a second call joins the one running. */
export function syncNow(): Promise<SyncResult> {
  if (inFlight) return inFlight;
  lastAttempt = Date.now();
  inFlight = (async (): Promise<SyncResult> => {
    if (!cloudAccount()) return { ok: false, reason: 'Not signed in.' };
    try {
      // After a restart the Google session has to be restored before a token can be had.
      if (!(await silentAccount())) throw new Error('Sign in with Google again to keep syncing.');
      await backupNow();
      dirty = false;
      deleteRaw(ERROR);
      return { ok: true };
    } catch (e) {
      const reason = describe(e);
      setRaw(ERROR, reason);
      return { ok: false, reason };
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Sync if signed in. Fire and forget: it never blocks the screen that asked. */
export function requestSync(): void {
  if (cloudAccount()) void syncNow();
}

/**
 * The automatic syncs, mounted once at the root: on opening after a long gap, and
 * when the app is put away with new data — never mid-workout (finishing syncs).
 */
export function useCloudSync(): void {
  useEffect(() => {
    if (!isConfigured()) return;
    const changes = addDatabaseChangeListener((e) => {
      // Settings include sync's own bookkeeping; they ride along with the next copy.
      if (e.tableName !== 'setting' && e.tableName !== 'timer_state') dirty = true;
    });
    const app = AppState.addEventListener('change', (state) => {
      if (state !== 'background' || !cloudAccount()) return;
      if (shouldSyncOnBackground({ dirty, workoutOpen: getActiveSession() !== undefined, lastAttemptMs: lastAttempt, nowMs: Date.now() })) void syncNow();
    });
    if (cloudAccount() && isDue(lastBackupAt(), Date.now())) void syncNow();
    return () => {
      changes.remove();
      app.remove();
    };
  }, []);
}
