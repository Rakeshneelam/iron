import { StyleSheet, View } from 'react-native';

import { color, radius, space } from '@/theme/tokens';

export type BarTone = 'accent' | 'positive' | 'warning' | 'danger' | 'muted';

export interface BarProps {
  value: number;
  max: number;
  tone?: BarTone;
  /** Tick marks in the same units as value — e.g. MEV / MAV / MRV. */
  markers?: number[];
}

const FILL: Record<BarTone, string> = {
  accent: color.accent,
  positive: color.positive,
  warning: color.warning,
  danger: color.danger,
  muted: color.textFaint,
};

export function Bar({ value, max, tone = 'accent', markers = [] }: BarProps) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(1, value / safeMax));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: FILL[tone] }]} />
      {markers.map((m) => (
        <View key={m} style={[styles.marker, { left: `${Math.max(0, Math.min(1, m / safeMax)) * 100}%` }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: space.sm + space.xs,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceHigh,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
  marker: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: color.textMuted },
});
