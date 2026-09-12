import { StyleSheet, Text, View } from 'react-native';

import { Bar } from '@/components/Bar';
import { color, font, radius, space } from '@/theme/tokens';

import { STATUS_TONE, volumeRows } from './volume';

const cap = (s: string) => (s ? s[0]?.toUpperCase() + s.slice(1) : s);

/** Only the exceptions get words. "On track" is the absence of a problem. */
const STATUS_WORD = { under: 'needs more', optimal: '', high: 'high', over: 'too much' } as const;

/** Attention first: the list exists to answer "what should I change?". */
const ORDER = { over: 0, under: 1, high: 2, optimal: 3 } as const;

/**
 * Weekly volume per muscle.
 *
 * Eleven full-width rows each reading "0 sets · below minimum" told the user nothing
 * eleven times over, so the shape now follows the question being asked. Nothing
 * logged is one line. Otherwise the muscles needing attention come first with a bar
 * apiece, and the ones that are fine collapse into a single row of chips — present,
 * checkable, not competing for attention.
 */
export function VolumeList({ weekly }: { weekly: Record<string, number> }) {
  const rows = volumeRows(weekly);
  const total = rows.reduce((n, r) => n + r.sets, 0);

  if (total === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.empty}>Nothing logged yet this week. Volume per muscle appears once you train.</Text>
      </View>
    );
  }

  const attention = rows.filter((r) => r.status !== 'optimal' && r.sets > 0).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const fine = rows.filter((r) => r.status === 'optimal');
  const untouched = rows.filter((r) => r.sets === 0);

  return (
    <View style={styles.card}>
      {attention.map((r) => (
        <View key={r.muscle} style={styles.row}>
          <View style={styles.head}>
            <Text style={styles.name}>{cap(r.muscle)}</Text>
            <Text style={styles.count}>
              {r.sets}
              <Text style={styles.meta}>
                {' '}
                / {r.mev}–{r.mrv} · {STATUS_WORD[r.status]}
              </Text>
            </Text>
          </View>
          <Bar value={r.sets} max={r.mrv * 1.15} tone={STATUS_TONE[r.status]} markers={[r.mev, r.mav, r.mrv]} />
        </View>
      ))}

      {fine.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupLabel}>ON TRACK</Text>
          <View style={styles.chips}>
            {fine.map((r) => (
              <View key={r.muscle} style={styles.chip}>
                <Text style={styles.chipText}>
                  {cap(r.muscle)} <Text style={styles.chipNum}>{r.sets}</Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {untouched.length > 0 ? (
        <Text style={styles.untouched}>
          Not trained this week: {untouched.map((r) => cap(r.muscle)).join(', ')}.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.lg,
    gap: space.md,
  },
  row: { gap: space.xs },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm },
  name: { ...font.label, color: color.text },
  count: { ...font.label, ...font.numeric, color: color.text, fontWeight: '700' },
  meta: { ...font.caption, color: color.textMuted, fontWeight: '400' },
  group: { gap: space.sm },
  groupLabel: { ...font.caption, color: color.textMuted, letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    backgroundColor: color.surfaceHigh,
  },
  chipText: { ...font.caption, color: color.textMuted },
  chipNum: { ...font.caption, ...font.numeric, color: color.text, fontWeight: '700' },
  untouched: { ...font.caption, color: color.textFaint },
  empty: { ...font.body, color: color.textMuted },
});
