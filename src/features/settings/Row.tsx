import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { fmtClockOfDay } from '@/features/settings/time';
import { color, font, hit, radius } from '@/theme/tokens';

/** A time of day in minutes-from-midnight, adjusted in 15-minute steps. */
export function TimeAdjuster({ value, onChange, min = 0, max = 1439 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <View style={styles.adjust}>
      <Pressable style={({ pressed }) => [styles.btn, pressed && styles.pressed]} onPress={() => set(value - 15)} accessibilityRole="button" accessibilityLabel="Earlier">
        <Icon name="minus" size={18} color={color.textMuted} />
      </Pressable>
      <Text style={styles.value}>{fmtClockOfDay(value)}</Text>
      <Pressable style={({ pressed }) => [styles.btn, pressed && styles.pressed]} onPress={() => set(value + 15)} accessibilityRole="button" accessibilityLabel="Later">
        <Icon name="plus" size={18} color={color.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // The same bordered − value + field as Stepper, so a time reads as one more number.
  adjust: { flexDirection: 'row', alignItems: 'center', height: hit.default, backgroundColor: color.surfaceHigh, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, overflow: 'hidden' },
  btn: { width: hit.default, height: hit.default, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: color.border },
  value: { ...font.label, fontSize: 17, fontWeight: '700', ...font.numeric, color: color.text, minWidth: 64, textAlign: 'center' },
});
