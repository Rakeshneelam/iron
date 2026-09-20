import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, Icon, Screen } from '@/components';
import { useSettings } from '@/db/repositories/settings';
import { MeasurementsSection } from '@/features/body/MeasurementsSection';
import { RecoverySection } from '@/features/body/RecoverySection';
import { WeightSection } from '@/features/body/WeightSection';
import { color, font, gap, space } from '@/theme/tokens';

const SECTIONS = [
  { label: 'Weight', value: 'weight' as const },
  { label: 'Recovery', value: 'recovery' as const },
  { label: 'Measurements', value: 'measurements' as const },
];
export type BodySection = (typeof SECTIONS)[number]['value'];

const SUBTITLE: Record<BodySection, string> = {
  weight: 'Your trend, not this morning’s number',
  recovery: 'Sleep, soreness and stress',
  measurements: 'Every 2–4 weeks',
};

const isSection = (v: unknown): v is BodySection => SECTIONS.some((s) => s.value === v);

/**
 * Body: how your body is changing, and how you feel.
 *
 * Three sections in one tab rather than three tabs, because they are asked at
 * completely different rates — weight most mornings, recovery most days,
 * measurements every few weeks — and each has exactly one primary action: Log
 * weight, Check in, Log measurements (UX-01).
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

  return (
    <Screen title="Body" subtitle={SUBTITLE[section]}>
      <View style={styles.selector}>
        <ChipRow options={SECTIONS} value={section} onChange={select} />
      </View>

      {section === 'weight' ? <WeightSection /> : null}
      {section === 'recovery' ? <RecoverySection /> : null}
      {section === 'measurements' ? <MeasurementsSection /> : null}

      {/* A link, not a second profile editor. Profile & goals owns these (UX-03). */}
      <Card onPress={() => router.push('/settings/profile')}>
        <View style={styles.linkRow}>
          <View style={styles.flex1}>
            <Text style={styles.body}>Profile & goals</Text>
            <Text style={styles.hint}>
              {settings.name || 'Your details'} · {settings.age}, {settings.heightCm} cm — used for calorie and water targets.
            </Text>
          </View>
          <Icon name="chevronRight" size={20} color={color.textMuted} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  selector: { marginBottom: gap.between },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  body: { ...font.body, color: color.text },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
});
