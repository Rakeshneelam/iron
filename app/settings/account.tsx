import { Redirect } from 'expo-router';

/** Accounts are gone (AGENTS.md §1.2). Old link, local destination — see app/account/index.tsx. */
export default function AccountSettingsRedirect() {
  return <Redirect href="/settings/profile" />;
}
