import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { color, font, radius, space } from '@/theme/tokens';

export interface MiniBarsProps {
  data: { label: string; value: number }[];
  /** Optional goal line (same units as value), drawn dashed: a goal is planned, not done. */
  target?: number;
  height?: number;
  /** Index to emphasise, e.g. today — the column still filling in. */
  highlight?: number;
  /** Which record this is: water draws in its own ink, everything else in chalk. */
  ink?: string;
}

/**
 * Small daily bars. No axes — the labels and the goal line carry the meaning.
 *
 * Every bar is a logged total, so every bar is solid, in the record's own ink.
 * Reaching the goal is not coloured: the dashed line already says which days
 * crossed it, and a column of green ticks would turn a habit into a score.
 */
export function MiniBars({ data, target, height = 96, highlight, ink = color.text }: MiniBarsProps) {
  const [width, setWidth] = useState(0);
  const max = Math.max(target ?? 0, ...data.map((d) => d.value), 1);
  const goalY = target ? height - (target / max) * height : null;
  return (
    <View>
      <View style={[styles.plot, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {data.map((d, i) => (
          <View key={`${d.label}-${i}`} style={styles.col}>
            <View
              style={[
                styles.bar,
                {
                  height: Math.max(d.value > 0 ? 3 : 0, (d.value / max) * height),
                  backgroundColor: ink,
                  opacity: i === highlight ? 1 : 0.62,
                },
              ]}
            />
          </View>
        ))}
        {goalY !== null && width > 0 ? (
          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Line x1={0} y1={goalY} x2={width} y2={goalY} stroke={color.textMuted} strokeWidth={1} strokeDasharray="4 3" />
          </Svg>
        ) : null}
      </View>
      <View style={styles.labels}>
        {data.map((d, i) => (
          <Text key={`${d.label}-${i}`} style={[styles.label, i === highlight && styles.labelOn]} numberOfLines={1}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs },
  col: { flex: 1, justifyContent: 'flex-end', height: '100%' },
  bar: { borderRadius: radius.sm / 2, width: '100%' },
  labels: { flexDirection: 'row', gap: space.xs, marginTop: space.xs },
  label: { ...font.caption, color: color.textFaint, flex: 1, textAlign: 'center' },
  labelOn: { color: color.text },
});
