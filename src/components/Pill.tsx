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

const BG: Record<PillTone, string> = {
  accent: color.accentWash,
  positive: color.accentWash,
  warning: color.warningWash,
  danger: color.dangerWash,
  muted: color.surfaceHigh,
};

/** A short status tag: "Active", "+2.5 kg". A tinted pill; colour carries meaning, never decoration. */
export function Pill({ label, tone = 'muted' }: { label: string; tone?: PillTone }) {
  return (
    <View style={[styles.pill, { backgroundColor: BG[tone] }]}>
      <Text style={[styles.text, { color: FG[tone] }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: radius.pill, paddingHorizontal: space.md - 2, paddingVertical: 5, alignSelf: 'flex-start' },
  text: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '700' },
});
