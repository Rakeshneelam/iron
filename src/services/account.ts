/**
 * Accounts: sign up, sign in, the profile document, and deletion.
 *
 * What leaves the device is exactly five fields plus a marketing flag. Nothing else.
 * Height, weight, injuries, workouts, food and measurements are deliberately absent:
 * they are the sensitive category under DPDP, GDPR and Play's Data Safety form, and
 * keeping them local is what makes this a simple "personal info" disclosure instead
 * of a health-data one. Adding a field here changes the app's legal position, so
 * check docs/10-PLAY-STORE.md before you do.
 */
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { firebaseAuth, firestore, isAccountsConfigured } from './firebase';

export type Sex = 'male' | 'female';

/** Everything Iron stores about a person in the cloud. */
export interface Profile {
  name: string;
  email: string;
  occupation: string;
  age: number;
  sex: Sex;
  /**
   * Consent for marketing email, with the moment it was given. Stored as proof:
   * GDPR and DPDP both require a controller to demonstrate consent, and "the box
   * was there" is not a record. Never defaulted to true.
   */
  marketingOptIn: boolean;
  marketingOptInAt: string | null;
}

export const EMPTY_PROFILE: Profile = {
  name: '',
  email: '',
  occupation: '',
  age: 28,
  sex: 'male',
  marketingOptIn: false,
  marketingOptInAt: null,
};

const profileRef = (uid: string) => doc(firestore(), 'users', uid);

export function currentUser(): User | null {
  return isAccountsConfigured() ? firebaseAuth().currentUser : null;
}

/** Fires immediately with the current state, then on every change. */
export function watchAccount(fn: (user: User | null) => void): () => void {
  if (!isAccountsConfigured()) {
    fn(null);
    return () => undefined;
  }
  return onAuthStateChanged(firebaseAuth(), fn);
}

export async function saveProfile(patch: Partial<Profile>): Promise<void> {
  const user = currentUser();
  if (!user) throw new Error('Not signed in.');
  // Stamp the consent moment here rather than trusting a caller to remember.
  const withStamp =
    patch.marketingOptIn === true && !patch.marketingOptInAt
      ? { ...patch, marketingOptInAt: new Date().toISOString() }
      : patch.marketingOptIn === false
        ? { ...patch, marketingOptInAt: null }
        : patch;
  await setDoc(profileRef(user.uid), { ...withStamp, updatedAt: serverTimestamp() }, { merge: true });
}

export async function loadProfile(): Promise<Profile | null> {
  const user = currentUser();
  if (!user) return null;
  const snap = await getDoc(profileRef(user.uid));
  return snap.exists() ? ({ ...EMPTY_PROFILE, ...(snap.data() as Partial<Profile>) } as Profile) : null;
}

export interface SignUpInput extends Omit<Profile, 'marketingOptInAt'> {
  password: string;
}

export async function signUpWithEmail(input: SignUpInput): Promise<void> {
  const auth = firebaseAuth();
  const cred = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
  if (input.name.trim()) await updateProfile(cred.user, { displayName: input.name.trim() });
  await saveProfile({
    name: input.name.trim(),
    email: input.email.trim(),
    occupation: input.occupation.trim(),
    age: input.age,
    sex: input.sex,
    marketingOptIn: input.marketingOptIn,
  });
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(firebaseAuth(), email.trim());
}

/**
 * Google sign-in reuses the native picker already used for Drive, then hands the
 * id token to Firebase. The client ID must be the one Firebase lists under its
 * Google provider, or the token's audience is rejected.
 */
export async function signInWithGoogle(): Promise<{ isNew: boolean; name: string; email: string } | null> {
  await GoogleSignin.hasPlayServices();
  const res = await GoogleSignin.signIn();
  if (res.type !== 'success') return null;
  const idToken = res.data.idToken;
  if (!idToken) throw new Error('Google did not return an identity token.');

  const cred = await signInWithCredential(firebaseAuth(), GoogleAuthProvider.credential(idToken));
  const existing = await getDoc(profileRef(cred.user.uid));
  return {
    isNew: !existing.exists(),
    name: cred.user.displayName ?? res.data.user.name ?? '',
    email: cred.user.email ?? res.data.user.email ?? '',
  };
}

export async function signOutAccount(): Promise<void> {
  await GoogleSignin.signOut().catch(() => undefined);
  await fbSignOut(firebaseAuth());
}

/**
 * Deletes the profile document and then the account itself. Play requires an
 * in-app deletion path for any app with accounts, and it must actually delete —
 * the document goes first so nothing is orphaned if the second step fails.
 *
 * Nothing on the phone is touched: local training data is the user's, and losing
 * it was never what they asked for. "Delete all my data" in Settings does that.
 */
export async function deleteAccount(): Promise<void> {
  const user = currentUser();
  if (!user) throw new Error('Not signed in.');
  await deleteDoc(profileRef(user.uid)).catch(() => undefined);
  await deleteUser(user);
}

export { isAccountsConfigured };
