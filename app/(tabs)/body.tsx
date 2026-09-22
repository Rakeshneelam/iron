import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Icon, ListCard, ListRow, SegmentTabs } from '@/components';
import { useSettings } from '@/db/repositories/settings';
import { MeasurementsSection } from '@/features/body/MeasurementsSection';
import { RecoverySection } from '@/features/body/RecoverySection';
import { WeightSection } from '@/features/body/WeightSection';
import { color } from '@/theme/tokens';

const SECTIONS = [
  { label: 'Weight', value: 'weight' as const },
  { label: 'Measures', value: 'measurements' as const },
  { label: 'Recovery', value: 'recovery' as const },
];
export type BodySection = (typeof SECTIONS)[number]['value'];

const SUBTITLE: Record<BodySection, string> = {
  weight: 'Your trend, not this morning’s number',
  recovery: 'Readiness from your check-in',
  measurements: 'Every 2–4 weeks',
};

const isSection = (v: unknown): v is BodySection => SECTIONS.some((s) => s.value === v);

/**
 * Body: how your body is changing, and how you feel.
 *
 * Three sections in one tab rather than three tabs, because they are asked at
 * completely different rates — weight most mornings, recovery most days,
 * measurements every few weeks — and each has exactly one primary action, in the
 * dock: Log weight, Log measurements, Check in (UX-01). Each section renders the
 * screen itself, so its dock and its sheets live together.
 *
 * The section can come from the route, so a notification or deep link lands on the
 * thing it was about (/body?section=measurements). Without a parameter the tab
 * opens on Weight the first time and then stays where it was left, because an
 * ordinary tab switch is not a request to go back to the start.
 */
export default function BodyScreen() {
  const params = useLocalSearchParams<{ section?: string }>();
  const settings = useSettings();
  const [chosen, setChosen] = useState<BodySection>('weight');
  // The parameter wins while it is on the URL; clearing it returns to the
  // remembered section rather than snapping back to Weight.
  const section = isSection(params.section) ? params.section : chosen;

  const select = (next: BodySection) => {
    setChosen(next);
    // Drop the parameter, or it would keep overriding the taps that follow it.
    if (params.section !== undefined) router.setParams({ section: undefined });
  };

  const frame = { title: 'Body', subtitle: SUBTITLE[section], strip: <SegmentTabs options={SECTIONS} value={section} onChange={select} /> };
  // A link, not a second profile editor. Profile & goals owns these (UX-03).
  const tail = (
    <ListCard>
      <ListRow
        left={<Icon name="body" size={20} color={color.textMuted} />}
        title="Profile & goals"
        sub={`${settings.name || 'Your details'} · ${settings.age}, ${settings.heightCm} cm — used for calorie and water targets.`}
        onPress={() => router.push('/settings/profile')}
      />
    </ListCard>
  );

  if (section === 'recovery') return <RecoverySection frame={frame} tail={tail} />;
  if (section === 'measurements') return <MeasurementsSection frame={frame} tail={tail} />;
  return <WeightSection frame={frame} tail={tail} onMeasurements={() => select('measurements')} />;
}
