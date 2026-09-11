import { StyleSheet, Text, View } from 'react-native';

import { color, font, radius, space } from '@/theme/tokens';

export type PillTone = 'accent' | 'positive' | 'warning' | 'danger' | 'muted';

const FG: Record<PillTone, string> = {
  accent: color.accent,
  positive: color.positive,
  warning: color.warning,
  danger: color.danger,
  muted: color.textMuted,
};

/** A short status tag: "Active", "Skipped", "Add load". Colour carries meaning, never decoration. */
export function Pill({ label, tone = 'muted' }: { label: string; tone?: PillTone }) {
  return (
    <View style={[styles.pill, { borderColor: FG[tone] }]}>
      <Text style={[styles.text, { color: FG[tone] }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2, alignSelf: 'flex-start' },
  text: { ...font.caption, fontWeight: '600' },
});
