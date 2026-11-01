/**
 * Google sign-in and the Drive appDataFolder (docs/07-BACKUP.md).
 *
 * Signing in with Google is Iron's account, and the user's own Drive is its cloud:
 * everything here is scoped to `drive.appdata`, a hidden per-application folder
 * that no other app can read, that does not appear in the user's Drive, and that
 * Google classifies as non-sensitive — so the project never needs OAuth
 * verification review. There is no Iron server.
 *
 * Nothing in this file decrypts anything. What gets uploaded is the SQLCipher
 * database file, already ciphertext.
 */
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

import { configureGoogleSignin, DRIVE_SCOPE, isGoogleConfigured } from './googleSignin';

export { DRIVE_SCOPE };
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export interface DriveFile {
  id: string;
  name: string;
  size: number;
  createdTime: string;
  /**
   * The phrase that opens this file, kept in the file's private app properties so a
   * sign-in on a new phone can restore without typing it. Absent on backups made
   * before sign-in existed; those still need the phrase typed.
   */
  phrase?: string;
}

/** Who is signed in, as Google reports it. */
export interface GoogleAccount {
  email: string;
  name: string | null;
  givenName: string | null;
}

/** Missing only if the build was made without the client ID in .env. */
export function isConfigured(): boolean {
  return isGoogleConfigured();
}

/** Drive needs its scope; the shared helper keeps the client ID in one place. */
const configure = () => configureGoogleSignin([DRIVE_SCOPE]);

type SignedIn = { user: { email: string; name: string | null; givenName: string | null } };
const toAccount = (data: SignedIn): GoogleAccount => ({ email: data.user.email, name: data.user.name ?? null, givenName: data.user.givenName ?? null });

/** The signed-in account, restored without any prompt — or null. */
export async function silentAccount(): Promise<GoogleAccount | null> {
  if (!isConfigured()) return null;
  configure();
  try {
    const res = await GoogleSignin.signInSilently();
    return res.type === 'success' ? toAccount(res.data) : null;
  } catch {
    return null;
  }
}

/** Shows the account picker. Returns null if the user backs out. */
export async function signInAccount(): Promise<GoogleAccount | null> {
  configure();
  try {
    await GoogleSignin.hasPlayServices();
    const res = await GoogleSignin.signIn();
    return res.type === 'success' ? toAccount(res.data) : null;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === statusCodes.SIGN_IN_CANCELLED) return null;
    throw e;
  }
}

/** The signed-in address, or null. Never triggers a sign-in prompt. */
export async function currentAccount(): Promise<string | null> {
  return (await silentAccount())?.email ?? null;
}

/** Shows the account picker. Returns the address, or null if the user backs out. */
export async function connect(): Promise<string | null> {
  return (await signInAccount())?.email ?? null;
}

export async function disconnect(): Promise<void> {
  configure();
  // Revokes the token as well as signing out: "disconnect" in Settings should mean
  // Iron can no longer reach Drive, not merely that it has forgotten who you are.
  await GoogleSignin.revokeAccess().catch(() => undefined);
  await GoogleSignin.signOut().catch(() => undefined);
}

async function authHeader(): Promise<Record<string, string>> {
  configure();
  const { accessToken } = await GoogleSignin.getTokens();
  return { Authorization: `Bearer ${accessToken}` };
}

async function ok(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  throw new Error(`${what} failed (${res.status})`);
}

/** Newest first. */
export async function listBackups(): Promise<DriveFile[]> {
  const auth = await authHeader();
  const url =
    `${API}/files?spaces=appDataFolder&orderBy=createdTime desc&pageSize=20` +
    `&fields=${encodeURIComponent('files(id,name,size,createdTime,appProperties)')}`;
  const res = await ok(await fetch(url, { headers: auth }), 'Listing backups');
  const body = (await res.json()) as { files?: { id: string; name: string; size?: string; createdTime: string; appProperties?: Record<string, string> }[] };
  return (body.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    size: Number(f.size ?? 0),
    createdTime: f.createdTime,
    ...(f.appProperties?.phrase ? { phrase: f.appProperties.phrase } : {}),
  }));
}

/**
 * Resumable upload. Simple and multipart uploads cap at 5 MB, which a few years of
 * training plus a food table will pass — and resumable is the only sane choice on
 * mobile data anyway.
 */
export async function uploadBackup(name: string, bytes: Uint8Array, appProperties?: Record<string, string>): Promise<void> {
  const auth = await authHeader();
  const start = await ok(
    await fetch(`${UPLOAD}?uploadType=resumable`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ name, parents: ['appDataFolder'], ...(appProperties ? { appProperties } : {}) }),
    }),
    'Starting the upload',
  );
  const location = start.headers.get('location');
  if (!location) throw new Error('Drive did not offer an upload URL.');

  await ok(
    await fetch(location, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.byteLength) },
      body: bytes as unknown as BodyInit,
    }),
    'Uploading the backup',
  );
}

export async function downloadBackup(id: string): Promise<Uint8Array> {
  const auth = await authHeader();
  const res = await ok(await fetch(`${API}/files/${id}?alt=media`, { headers: auth }), 'Downloading the backup');
  return new Uint8Array(await res.arrayBuffer());
}

export async function deleteBackup(id: string): Promise<void> {
  const auth = await authHeader();
  await ok(await fetch(`${API}/files/${id}`, { method: 'DELETE', headers: auth }), 'Deleting an old backup');
}
