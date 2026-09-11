import { StyleSheet, Text, View } from 'react-native';

import { Bar } from '@/components/Bar';
import { color, font, space } from '@/theme/tokens';

import { STATUS_TONE, volumeRows } from './volume';

const cap = (s: string) => (s ? s[0]?.toUpperCase() + s.slice(1) : s);
const STATUS_WORD = { under: 'below minimum', optimal: 'good', high: 'high', over: 'too much' } as const;

export function VolumeList({ weekly }: { weekly: Record<string, number> }) {
  return (
    <View>
      {volumeRows(weekly).map((r) => (
        <View key={r.muscle} style={styles.row}>
          <View style={styles.head}>
            <Text style={styles.name}>{cap(r.muscle)}</Text>
            <Text style={styles.meta}>
              {r.sets} sets · {STATUS_WORD[r.status]}
            </Text>
          </View>
          <Bar value={r.sets} max={r.mrv * 1.15} tone={STATUS_TONE[r.status]} markers={[r.mev, r.mav, r.mrv]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: space.md },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.xs, gap: space.sm },
  name: { ...font.label, color: color.text },
  meta: { ...font.caption, ...font.numeric, color: color.textMuted },
});
