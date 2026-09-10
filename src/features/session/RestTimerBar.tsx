import { StyleSheet, Text, View } from 'react-native';

import { Bar } from '@/components/Bar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { fmtClock } from '@/lib/date';
import { useRestTimer } from '@/services/restTimer';
import { color, font, radius, space } from '@/theme/tokens';

/** Visible, never blocking. The number is endsAt - now, recomputed every render. */
export function RestTimerBar({ sessionId }: { sessionId: string }) {
  const t = useRestTimer(sessionId);
  if (!t.running) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.clock}>{fmtClock(Math.ceil(t.remainingMs / 1000))}</Text>
        <Text style={styles.label} numberOfLines={1}>
          rest · {t.label ?? ''}
        </Text>
        <PrimaryButton label="+30s" tone="neutral" onPress={() => t.add(30)} />
        <PrimaryButton label="Skip" tone="ghost" onPress={t.cancel} />
      </View>
      <Bar value={t.remainingMs} max={t.totalMs || t.remainingMs} tone="accent" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: color.surfaceHigh, borderRadius: radius.md, padding: space.sm, gap: space.sm, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  clock: { ...font.title, ...font.numeric, color: color.text },
  label: { ...font.caption, color: color.textMuted, flex: 1 },
});
