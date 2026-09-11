import { StyleSheet, Text, View } from 'react-native';

import { color, font, radius, space } from '@/theme/tokens';

export interface MiniBarsProps {
  data: { label: string; value: number }[];
  /** Optional goal line (same units as value); bars reaching it turn positive. */
  target?: number;
  height?: number;
  /** Index to emphasise, e.g. today. */
  highlight?: number;
}

/** Small daily/weekly bars. No axes — the labels and the goal line carry the meaning. */
export function MiniBars({ data, target, height = 96, highlight }: MiniBarsProps) {
  const max = Math.max(target ?? 0, ...data.map((d) => d.value), 1);
  const goalTop = target ? height - (target / max) * height : null;
  return (
    <View>
      <View style={[styles.plot, { height }]}>
        {goalTop !== null ? <View style={[styles.goal, { top: goalTop }]} /> : null}
        {data.map((d, i) => {
          const hit = target !== undefined && d.value >= target;
          return (
            <View key={`${d.label}-${i}`} style={styles.col}>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(d.value > 0 ? 3 : 0, (d.value / max) * height),
                    backgroundColor: hit ? color.positive : i === highlight ? color.accent : color.chartFaint,
                  },
                ]}
              />
            </View>
          );
        })}
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
  bar: { borderRadius: radius.sm, width: '100%' },
  goal: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: color.textFaint },
  labels: { flexDirection: 'row', gap: space.xs, marginTop: space.xs },
  label: { ...font.caption, color: color.textFaint, flex: 1, textAlign: 'center' },
  labelOn: { color: color.text },
});
