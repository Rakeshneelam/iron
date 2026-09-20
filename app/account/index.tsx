import { Redirect } from 'expo-router';

/**
 * Iron has no accounts (AGENTS.md §1.2). This route was a working email sign-up
 * screen; it is kept only so an old link, a saved deep link or a back-stack entry
 * lands somewhere sensible instead of crashing — the local profile it was
 * collecting half of (UX-12).
 *
 * It is a redirect, not a hidden login: there is no sign-in code left behind it.
 */
export default function AccountRedirect() {
  return <Redirect href="/settings/profile" />;
}
