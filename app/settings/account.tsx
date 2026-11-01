import { Redirect } from 'expo-router';

/** Accounts are gone (AGENTS.md §1.2). Old link, local destination: You. */
export default function AccountSettingsRedirect() {
  return <Redirect href="/you" />;
}
