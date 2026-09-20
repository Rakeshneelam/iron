import { router } from 'expo-router';

import { Card, PrimaryButton, Screen } from '@/components';
import { ProfileFields } from '@/features/settings/ProfileFields';

/**
 * Profile & goals — the one editor for who you are and what you are aiming at.
 *
 * Body links here, so does the Food target sheet, so does Settings. None of them
 * keeps a second copy of the goal selector: a contextual shortcut opens the
 * canonical editor or it is not a shortcut (UX-03).
 */
export default function ProfileScreen() {
  return (
    <Screen
      title="Profile & goals"
      right={<PrimaryButton label="Back" tone="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))} />}
    >
      <Card>
        <ProfileFields />
      </Card>
    </Screen>
  );
}
