import { useFocusEffect } from 'expo-router';
import { type ReactNode, useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, font, radius, space } from '@/theme/tokens';

import { FitText } from './FitText';

export interface TitleCell {
  label: string;
  value: ReactNode;
  unit?: string;
  /** `heat` only for something live (elapsed time of an open workout); `positive` for a best. */
  tone?: 'heat' | 'positive';
}

/**
 * A row of stat tiles: a small label over a big italic figure, one dark tile each.
 * The handful of facts that say what you are looking at — this workout, this lift.
 */
export function TitleBlock({ cells }: { cells: readonly TitleCell[] }) {
  return (
    <View style={styles.block}>
      {cells.map((c) => (
        <View
          key={c.label}
          style={styles.cell}
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
  block: { flexDirection: 'row', gap: space.sm + 2 },
  cell: { flex: 1, minWidth: 0, paddingVertical: space.md, paddingHorizontal: space.md, gap: 4, backgroundColor: color.surface, borderRadius: radius.md + 4 },
  label: { ...font.caption, fontSize: 12, lineHeight: 15, fontWeight: '700', color: color.textMuted },
  value: { ...font.measure, fontWeight: '900', fontSize: 30, lineHeight: 34, color: color.text },
  unit: { fontFamily: font.caption.fontFamily, fontStyle: 'normal', fontSize: 13, fontWeight: '700', color: color.textMuted, letterSpacing: 0 },
  heat: { color: color.accent },
  positive: { color: color.positive },
});
