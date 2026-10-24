import { useFocusEffect } from 'expo-router';
import { type ReactNode, useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, font, space } from '@/theme/tokens';

import { FitText } from './FitText';

export interface TitleCell {
  label: string;
  value: ReactNode;
  unit?: string;
  /** `heat` only for something live (elapsed time of an open workout); `positive` for a best. */
  tone?: 'heat' | 'positive';
}

/**
 * A drawing's title block: the handful of facts that identify what you are
 * looking at, in ruled cells — label over figure, figures in the measuring face.
 *
 * It replaces the row of floating stat tiles that every dashboard has. The cells
 * share one frame and one baseline, divided by hairlines rather than boxed one by
 * one, so four numbers read as one statement about one thing (this workout, this
 * lift) instead of four widgets competing for the eye.
 */
export function TitleBlock({ cells }: { cells: readonly TitleCell[] }) {
  return (
    <View style={styles.block}>
      {cells.map((c, i) => (
        <View
          key={c.label}
          style={[styles.cell, i > 0 && styles.divided]}
          accessible
          accessibilityLabel={`${c.label}: ${typeof c.value === 'string' || typeof c.value === 'number' ? c.value : ''}${c.unit ? ` ${c.unit}` : ''}`}
        >
          <Text style={styles.label} numberOfLines={1}>
            {c.label}
          </Text>
          <FitText style={[styles.value, c.tone === 'heat' && styles.heat, c.tone === 'positive' && styles.positive]} numberOfLines={1} minimumFontScale={0.7}>
            {c.value}
            {c.unit ? <Text style={styles.unit}> {c.unit}</Text> : null}
          </FitText>
        </View>
      ))}
    </View>
  );
}

/**
 * The time, re-read once a minute while the screen is in view and not at all
 * otherwise. Enough for a needle that marks "now" on a day-long axis; a per-second
 * clock would redraw a whole instrument sixty times as often to move it a pixel.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      const t = setInterval(() => setNow(new Date()), 60_000);
      return () => clearInterval(t);
    }, []),
  );
  return now;
}

const styles = StyleSheet.create({
  block: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },
  cell: { flex: 1, minWidth: 0, paddingVertical: space.sm + 2, paddingHorizontal: space.sm, gap: 2 },
  divided: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: color.border },
  label: { ...font.caption, fontSize: 12, lineHeight: 15, color: color.textMuted },
  value: { ...font.measure, fontSize: 26, lineHeight: 30, color: color.text },
  unit: { ...font.caption, fontSize: 13, fontWeight: '400', color: color.textFaint, letterSpacing: 0 },
  heat: { color: color.accent },
  positive: { color: color.positive },
});
