import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, font, radius, space } from '@/theme/tokens';

export interface IntakeSegment {
  key: string;
  /** "B", "L" — printed under the segment when there is room. */
  short: string;
  /** Spoken: "Breakfast, 520". */
  name: string;
  value: number;
}

/**
 * A day's intake against its target, as composition rather than a gauge.
 *
 * The target is an outline — it is planned, not eaten — and it is dashed while it
 * is still Iron's estimate rather than measured from your own logging or set by
 * you, so the line says how far to trust it (brief §9: distinguish estimates from
 * verified values). What you ate fills it as solid segments, one per meal, in the
 * order of the day, so the bar also answers "where did the calories go".
 *
 * Over the target, the segments simply carry on past the outline's end. No red, no
 * alarm, no shrinking: eating more than a number on one day is information, and
 * this app never scolds (AGENTS §6). The words say "240 over", plainly, once.
 */
export function IntakeBar({
  label,
  unit,
  segments,
  target,
  estimated,
}: {
  label: string;
  unit: string;
  segments: readonly IntakeSegment[];
  target: number;
  estimated: boolean;
}) {
  const [width, setWidth] = useState(0);
  const total = segments.reduce((t, s) => t + s.value, 0);
  const scale = Math.max(target, total, 1);
  const w = (v: number) => (v / scale) * width;
  const over = Math.round(total - target);
  /** Where each meal starts: the sum of the meals before it. */
  const starts = segments.map((_, i) => segments.slice(0, i).reduce((t, s) => t + Math.max(0, s.value), 0));

  const fmt = (n: number) => Math.round(n).toLocaleString();
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`${label}: ${fmt(total)} of ${fmt(target)} ${unit}${estimated ? ', target estimated' : ''}. ${segments
        .filter((s) => s.value > 0)
        .map((s) => `${s.name} ${fmt(s.value)}`)
        .join(', ')}.`}
    >
      <View style={styles.head}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {fmt(total)}
          <Text style={styles.of}>
            {' '}
            of {fmt(target)} {unit}
          </Text>
        </Text>
      </View>
      <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <>
            <View style={[styles.target, estimated && styles.targetEstimated, { width: w(target) }]} />
            {segments.map((s, i) => {
              if (s.value <= 0) return null;
              const left = w(starts[i] ?? 0);
              const segW = Math.max(2, w(s.value) - 2);
              return (
                <View key={s.key} style={[styles.segment, { left: left + 1, width: segW }]}>
                  {segW > 18 ? <Text style={styles.short}>{s.short}</Text> : null}
                </View>
              );
            })}
          </>
        ) : null}
      </View>
      {over > 0 ? <Text style={styles.note}>{fmt(over)} {unit} over the target today.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs + 2 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md },
  label: { ...font.label, fontSize: 14, fontWeight: '600', color: color.text },
  value: { ...font.measure, fontSize: 22, lineHeight: 26, color: color.text },
  of: { ...font.caption, fontSize: 13, fontWeight: '400', letterSpacing: 0, color: color.textMuted },
  track: { height: 26, position: 'relative' },
  target: { position: 'absolute', left: 0, top: 0, bottom: 0, borderWidth: 1.5, borderColor: color.textMuted, borderRadius: radius.sm },
  /** Dashed while it is Iron's estimate: an outline that says how far to trust it. */
  targetEstimated: { borderStyle: 'dashed' },
  segment: { position: 'absolute', top: 4, bottom: 4, backgroundColor: color.text, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  short: { ...font.caption, fontSize: 10, lineHeight: 12, fontWeight: '700', color: color.bg },
  note: { ...font.caption, fontSize: 12, color: color.textMuted },
});
