import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Screen, SegmentTabs } from '@/components';
import { BodyTab, TrainingTab, WorkoutTab } from '@/features/settings/tabs';

const TABS = [
  { label: 'Body', value: 'body' as const },
  { label: 'Training', value: 'training' as const },
  { label: 'Workout', value: 'workout' as const },
];
export type SettingsTab = (typeof TABS)[number]['value'];
const isTab = (v: unknown): v is SettingsTab => TABS.some((t) => t.value === v);

/**
 * Body & training: the settings that shape the plan and the targets — goal and
 * daily targets, how and where you train, and how a workout runs. The sliders on
 * Today open it. Profile, reminders and backup belong to You, behind the avatar.
 * Links from elsewhere name the tab (/settings?tab=training).
 */
export default function SettingsScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<SettingsTab>(isTab(params.tab) ? params.tab : 'body');
  const select = (next: SettingsTab) => {
    setTab(next);
    if (params.tab !== undefined) router.setParams({ tab: undefined });
  };

  return (
    <Screen title="Body & training" back strip={<SegmentTabs options={TABS} value={tab} onChange={select} />}>
      {tab === 'body' ? <BodyTab /> : null}
      {tab === 'training' ? <TrainingTab /> : null}
      {tab === 'workout' ? <WorkoutTab /> : null}
    </Screen>
  );
}
