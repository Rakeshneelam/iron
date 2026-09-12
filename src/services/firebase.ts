/**
 * Firebase init (docs/10-PLAY-STORE.md §5).
 *
 * Scope is deliberately narrow: Auth, plus one Firestore document per user holding
 * five fields. Training data — sets, weigh-ins, food, measurements — never comes
 * here. It stays in the encrypted database on the device, and the only cloud copy of
 * it is the one the user chooses to put in their own Google Drive.
 *
 * The config values are public. They ship inside the APK by design; `firestore.rules`
 * is what actually protects the data, not the secrecy of these strings.
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

/**
 * False when the build has no Firebase config, which is the normal state for a
 * local-only build. Every account affordance checks this, so the app stays whole
 * rather than showing buttons that cannot work.
 */
export function isAccountsConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.appId);
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let store: Firestore | null = null;

/** Lazy: nothing is initialised on a build with no config, or before first use. */
export function firebaseAuth(): Auth {
  if (auth) return auth;
  if (!isAccountsConfigured()) throw new Error('This build has no Firebase configuration.');
  app = getApps().length ? getApp() : initializeApp(config);
  // getAuth() is enough here: the React Native build of firebase/auth wires
  // AsyncStorage persistence itself, which is why v12 dropped the old
  // getReactNativePersistence export. @react-native-async-storage/async-storage
  // is therefore a REQUIRED dependency even though nothing imports it directly —
  // without it a signed-in user is signed out on every cold start.
  auth = getAuth(app);
  return auth;
}

export function firestore(): Firestore {
  if (store) return store;
  firebaseAuth(); // initialises the app
  store = getFirestore(app ?? getApp());
  return store;
}
