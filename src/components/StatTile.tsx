import { StyleSheet, Text, View } from 'react-native';

import { color, font, radius, space } from '@/theme/tokens';

export type StatTone = 'default' | 'accent' | 'positive' | 'warning' | 'danger' | 'muted';

export interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
}

const TONE: Record<StatTone, string> = {
  default: color.text,
  accent: color.accent,
  positive: color.positive,
  warning: color.warning,
  danger: color.danger,
  muted: color.textMuted,
};

/**
 * A number and what it is.
 *
 * The value leads and the label follows it. Before, the label sat on top in muted
 * grey and the number came second at heading size — which reads the wrong way round,
 * because the number is the thing being looked for and the label is only there to
 * say which number it is.
 */
export function StatTile({ label, value, hint, tone = 'default' }: StatTileProps) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.value, { color: TONE[tone] }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {hint ? (
        <Text style={styles.hint} numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.md,
  },
  value: { ...font.heading, ...font.numeric, fontWeight: '700' },
  label: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  hint: { ...font.caption, color: color.textFaint, marginTop: space.xs },
});
