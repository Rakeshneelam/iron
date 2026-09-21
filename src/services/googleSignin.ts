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
 * DEVELOPER_ERROR means Google Play Services would not issue a token, and it says
 * nothing about why. It is not the JS config and not google-services.json (the plugin
 * is a no-op without `android.googleServicesFile`, and webClientId is passed here).
 * It is server-side: the project behind the web client has no Android OAuth client
 * whose package and SHA-1 match the APK. Adding the fingerprint to the Firebase
 * Android app creates that client, and no rebuild is needed.
 *
 * The old report printed the last 14 characters of the ID — always
 * "sercontent.com" — so it named nothing. The project number is the useful part.
 */
export function googleConfigReport(): string {
  const id = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!id) return 'This build has no Google client ID: it was never injected at build time.';
  return `Project ${id.split('-')[0]} has no Android OAuth client for this app's signing key. Add the APK's SHA-1 to the Android app in Firebase (Project settings, Your apps).`;
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
