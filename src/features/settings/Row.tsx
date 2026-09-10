import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fmtClockOfDay } from '@/features/settings/time';
import { color, font, hit, radius, space } from '@/theme/tokens';

export function Row({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** A time of day in minutes-from-midnight, adjusted in 15-minute steps. */
export function TimeAdjuster({ value, onChange, min = 0, max = 1439 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <View style={styles.adjust}>
      <Pressable style={styles.btn} onPress={() => set(value - 15)} accessibilityLabel="Earlier">
        <Text style={styles.btnText}>−</Text>
      </Pressable>
      <Text style={styles.value}>{fmtClockOfDay(value)}</Text>
      <Pressable style={styles.btn} onPress={() => set(value + 15)} accessibilityLabel="Later">
        <Text style={styles.btnText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.sm,
    minHeight: hit.default,
  },
  text: { flex: 1 },
  label: { ...font.body, color: color.text },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  adjust: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  btn: {
    width: hit.default,
    height: hit.default,
    borderRadius: radius.md,
    backgroundColor: color.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { ...font.heading, color: color.text },
  value: { ...font.heading, ...font.numeric, color: color.text, minWidth: 64, textAlign: 'center' },
});
