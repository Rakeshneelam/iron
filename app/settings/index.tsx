import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Screen, SegmentTabs } from '@/components';
import { AlertsTab, DataTab, ProfileTab, TrainingTab, WorkoutTab } from '@/features/settings/tabs';

const TABS = [
  { label: 'Profile', value: 'profile' as const },
  { label: 'Training', value: 'training' as const },
  { label: 'Workout', value: 'workout' as const },
  { label: 'Alerts', value: 'alerts' as const },
  { label: 'Data', value: 'data' as const },
];
export type SettingsTab = (typeof TABS)[number]['value'];
const isTab = (v: unknown): v is SettingsTab => TABS.some((t) => t.value === v);

/**
 * Settings: five tabs of one screen, grouped by the task you came to do, with the
 * other four always in view. Links from elsewhere name the tab (/settings?tab=
 * alerts); the old per-page routes redirect here, so every saved link still lands.
 */
export default function SettingsScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<SettingsTab>(isTab(params.tab) ? params.tab : 'profile');
  const select = (next: SettingsTab) => {
    setTab(next);
    if (params.tab !== undefined) router.setParams({ tab: undefined });
  };

  return (
    <Screen title="Settings" subtitle="Saves as you change it" back strip={<SegmentTabs options={TABS} value={tab} onChange={select} />}>
      {tab === 'profile' ? <ProfileTab /> : null}
      {tab === 'training' ? <TrainingTab /> : null}
      {tab === 'workout' ? <WorkoutTab /> : null}
      {tab === 'alerts' ? <AlertsTab /> : null}
      {tab === 'data' ? <DataTab /> : null}
    </Screen>
  );
}
