import { StyleSheet, Text, View } from 'react-native';

import { Bar } from '@/components/Bar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { fmtClock } from '@/lib/date';
import type { RestTimerView } from '@/services/restTimer';
import { color, font, radius, space } from '@/theme/tokens';

/**
 * Visible, never blocking. The number is endsAt - now, recomputed every render.
 *
 * The timer is passed in rather than subscribed to here: the bar has to survive the
 * current exercise being skipped, removed or absent, so the screen owns the one
 * subscription and decides where the bar is mounted.
 */
export function RestTimerBar({ timer: t }: { timer: RestTimerView }) {
  if (!t.running) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.clock}>{fmtClock(Math.ceil(t.remainingMs / 1000))}</Text>
        {/* "rest · Lying L…" — the exercise name never fit beside four controls, and
            the screen above already says which lift you are resting from. */}
        <Text style={styles.label} numberOfLines={1}>
          rest
        </Text>
        <PrimaryButton label="−15s" tone="neutral" onPress={() => t.add(-15)} />
        <PrimaryButton label="+30s" tone="neutral" onPress={() => t.add(30)} />
        <PrimaryButton label="Skip" accessibilityLabel="Skip rest" tone="ghost" onPress={t.cancel} />
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
