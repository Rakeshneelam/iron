/**
 * The one place GoogleSignin gets configured.
 *
 * It used to be private to `drive.ts`, so the account screen called `signIn()` on an
 * unconfigured module: the native account picker opened fine and the handshake then
 * failed with DEVELOPER_ERROR, which reads like a credentials problem and is not one.
 * Both callers come through here now.
 *
 * Scopes are requested per flow rather than all at once. Signing in asks for nothing
 * beyond identity; the Drive scope is only requested when someone actually turns on
 * Drive backup, so nobody is asked for access to their Drive just to make an account.
 */
import { GoogleSignin } from '@react-native-google-signin/google-signin';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/** Missing only if the build was made without the client ID in .env. */
export function isGoogleConfigured(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
}

/**
 * DEVELOPER_ERROR means Google Play Services would not issue a token. It says
 * nothing about why, and the causes are all build-time, so report the build's own
 * configuration rather than making someone guess a third time.
 *
 * The usual cause is a missing google-services.json: added as a bare plugin string,
 * @react-native-google-signin applies the Firebase Gradle plugin and expects that
 * file, whatever the JS SDK needs. Then the package name and SHA-1 of the signing
 * key must match an Android OAuth client in the same Cloud project as the web client.
 */
export function googleConfigReport(): string {
  const id = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!id) return 'This build has no Google client ID: it was never injected at build time.';
  return `Client ID ends …${id.slice(-14)}. Check google-services.json is in the build, and that an Android OAuth client exists for this package and signing key.`;
}

let currentScopes = '';

/**
 * Idempotent per scope set. Calling it again with different scopes reconfigures,
 * which is what lets the account flow and the Drive flow ask for different things.
 */
export function configureGoogleSignin(scopes: string[] = []): void {
  const key = scopes.join(' ');
  if (currentScopes === key && currentScopes !== '') return;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    ...(scopes.length ? { scopes } : {}),
  });
  currentScopes = key;
}
