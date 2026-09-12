/**
 * Google Drive appDataFolder (docs/07-BACKUP.md).
 *
 * The only network feature in the app, and the only network call AGENTS.md §1
 * permits. Everything here is scoped to `drive.appdata`: a hidden per-application
 * folder that no other app can read, that does not appear in the user's Drive, and
 * that Google classifies as non-sensitive — so the project never needs OAuth
 * verification review.
 *
 * Nothing in this file decrypts anything. What gets uploaded is the SQLCipher
 * database file, already ciphertext, readable only with the recovery phrase.
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
}

/** Missing only if the build was made without the client ID in .env. */
export function isConfigured(): boolean {
  return isGoogleConfigured();
}

/** Drive needs its scope; the shared helper keeps the client ID in one place. */
const configure = () => configureGoogleSignin([DRIVE_SCOPE]);

/** The signed-in address, or null. Never triggers a sign-in prompt. */
export async function currentAccount(): Promise<string | null> {
  if (!isConfigured()) return null;
  configure();
  try {
    const res = await GoogleSignin.signInSilently();
    return res.type === 'success' ? (res.data.user.email ?? null) : null;
  } catch {
    return null;
  }
}

/** Shows the account picker. Returns null if the user backs out. */
export async function connect(): Promise<string | null> {
  configure();
  try {
    await GoogleSignin.hasPlayServices();
    const res = await GoogleSignin.signIn();
    return res.type === 'success' ? (res.data.user.email ?? null) : null;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === statusCodes.SIGN_IN_CANCELLED) return null;
    throw e;
  }
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
    `&fields=${encodeURIComponent('files(id,name,size,createdTime)')}`;
  const res = await ok(await fetch(url, { headers: auth }), 'Listing backups');
  const body = (await res.json()) as { files?: { id: string; name: string; size?: string; createdTime: string }[] };
  return (body.files ?? []).map((f) => ({ id: f.id, name: f.name, size: Number(f.size ?? 0), createdTime: f.createdTime }));
}

/**
 * Resumable upload. Simple and multipart uploads cap at 5 MB, which a few years of
 * training plus a food table will pass — and resumable is the only sane choice on
 * mobile data anyway.
 */
export async function uploadBackup(name: string, bytes: Uint8Array): Promise<void> {
  const auth = await authHeader();
  const start = await ok(
    await fetch(`${UPLOAD}?uploadType=resumable`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ name, parents: ['appDataFolder'] }),
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
