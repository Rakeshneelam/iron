import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { selection } from '@/lib/haptics';
import { color, font, radius, space } from '@/theme/tokens';

export interface MiniBarsProps {
  /** `a11y` names a bar for a screen reader when its label is blank or too terse. */
  data: { label: string; value: number; a11y?: string }[];
  /** Optional goal line (same units as value), drawn dashed. */
  target?: number;
  height?: number;
  /** The bar to light up — today, this week — in the tracker's colour. */
  highlight?: number;
  /** The tracker's colour: volt for training, sky for water, lav for body. */
  ink?: string;
  /** A value bubble over the highlighted bar: "21.3k", "1.6 L". */
  bubble?: string;
  /** Makes every bar a button that picks its index — a week, a day. */
  onSelect?: (index: number) => void;
}

/**
 * Rounded pill bars, the rest in dark grey and one lit in its tracker's colour, with
 * the figure that matters in a bubble above it. No axes — the labels, the bubble and
 * the goal line carry the meaning.
 */
export function MiniBars({ data, target, height = 120, highlight, ink = color.accent, bubble, onSelect }: MiniBarsProps) {
  const [width, setWidth] = useState(0);
  const top = bubble ? 30 : 4;
  const max = Math.max(target ?? 0, ...data.map((d) => d.value), 1);
  const plotH = height - top;
  const goalY = target ? top + plotH - (target / max) * plotH : null;
  const colW = width > 0 && data.length ? width / data.length : 0;
  const hi = highlight !== undefined ? data[highlight] : undefined;
  const hiH = hi ? Math.max(hi.value > 0 ? 10 : 0, (hi.value / max) * plotH) : 0;
  return (
    <View>
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={[styles.plot, { top }]}>
          {data.map((d, i) => {
            const bar = <View style={[styles.bar, { height: Math.max(d.value > 0 ? 10 : 6, (d.value / max) * plotH), backgroundColor: i === highlight ? ink : color.border }]} />;
            return onSelect ? (
              <Pressable
                key={`${d.label}-${i}`}
                style={styles.col}
                onPress={() => {
                  selection();
                  onSelect(i);
                }}
                accessibilityRole="button"
                accessibilityLabel={d.a11y ?? d.label}
                accessibilityState={{ selected: i === highlight }}
              >
                {bar}
              </Pressable>
            ) : (
              <View key={`${d.label}-${i}`} style={styles.col}>
                {bar}
              </View>
            );
          })}
        </View>
        {goalY !== null && width > 0 ? (
          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Line x1={0} y1={goalY} x2={width} y2={goalY} stroke={color.textFaint} strokeWidth={1} strokeDasharray="4 4" />
          </Svg>
        ) : null}
        {bubble && hi && highlight !== undefined && colW > 0 ? (
          <View style={[styles.bubble, { backgroundColor: ink, left: Math.max(0, Math.min(width - 72, highlight * colW + colW / 2 - 36)), top: Math.max(0, top + plotH - hiH - 30) }]}>
            <Text style={styles.bubbleText} numberOfLines={1}>
              {bubble}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.labels}>
        {data.map((d, i) => (
          <Text key={`${d.label}-${i}`} style={[styles.label, i === highlight && { color: ink }]} numberOfLines={1}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', gap: space.sm - 2 },
  col: { flex: 1, justifyContent: 'flex-end', height: '100%', alignItems: 'center' },
  bar: { width: '100%', maxWidth: 30, borderRadius: radius.pill },
  labels: { flexDirection: 'row', gap: space.sm - 2, marginTop: space.sm },
  label: { ...font.caption, fontSize: 11, fontWeight: '700', color: color.textFaint, flex: 1, textAlign: 'center' },
  bubble: { position: 'absolute', width: 72, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  bubbleText: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '800', color: color.onTile, fontVariant: ['tabular-nums'] },
});
