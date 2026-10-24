import { StyleSheet, View } from 'react-native';

import { color, radius } from '@/theme/tokens';

export type BarTone = 'accent' | 'positive' | 'warning' | 'danger' | 'muted';

export interface BarProps {
  value: number;
  max: number;
  tone?: BarTone;
  /**
   * Landmarks in the same units as value — e.g. MEV / MAV / MRV. The first and last
   * bound a planned range, drawn as an outline; any between them are ticks inside it.
   */
  markers?: number[];
}

const FILL: Record<BarTone, string> = {
  accent: color.accent,
  positive: color.positive,
  warning: color.warning,
  danger: color.danger,
  muted: color.textMuted,
};

/**
 * A logged amount against a planned range, in the app's marks (docs/13): what you
 * did is a solid bar, the range you are aiming for is an outline around the part
 * of the scale it covers. Nothing here fills a pill to "complete" it — over the
 * range simply runs past the outline, and the words beside it say so.
 */
export function Bar({ value, max, tone = 'accent', markers = [] }: BarProps) {
  const safeMax = max > 0 ? max : 1;
  const at = (v: number) => `${Math.max(0, Math.min(1, v / safeMax)) * 100}%` as const;
  const sorted = [...markers].sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  return (
    <View style={styles.track}>
      <View style={styles.floor} />
      {lo !== undefined && hi !== undefined && hi > lo ? (
        <View style={[styles.band, { left: at(lo), width: `${((Math.min(hi, safeMax) - lo) / safeMax) * 100}%` }]} />
      ) : null}
      {sorted.slice(1, -1).map((m) => (
        <View key={m} style={[styles.tick, { left: at(m) }]} />
      ))}
      <View style={[styles.fill, { width: at(value), backgroundColor: FILL[tone] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 16, justifyContent: 'center' },
  floor: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: color.border },
  band: { position: 'absolute', top: 0, bottom: 0, borderWidth: 1, borderColor: color.textFaint, borderRadius: radius.sm },
  tick: { position: 'absolute', top: 3, bottom: 3, width: 1, backgroundColor: color.textFaint },
  fill: { height: 6, borderRadius: 1.5 },
});
