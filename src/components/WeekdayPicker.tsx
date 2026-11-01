import { StyleSheet, Text, View } from 'react-native';

import { selection } from '@/lib/haptics';
import { color, font, radius, space } from '@/theme/tokens';

import { Press } from './Press';

/** Monday first. `value` is JavaScript's getDay(): Sunday is 0. */
const DAYS = [
  { value: 1, short: 'M', name: 'Monday' },
  { value: 2, short: 'T', name: 'Tuesday' },
  { value: 3, short: 'W', name: 'Wednesday' },
  { value: 4, short: 'T', name: 'Thursday' },
  { value: 5, short: 'F', name: 'Friday' },
  { value: 6, short: 'S', name: 'Saturday' },
  { value: 0, short: 'S', name: 'Sunday' },
] as const;

/**
 * The week as seven equal circles, one letter each, so a narrow phone never wraps
 * "Mon" into "Mo / n". Several can be chosen; `single` makes it a pick-one.
 */
export function WeekdayPicker({ values, onToggle, single = false }: { values: readonly number[]; onToggle: (day: number) => void; single?: boolean }) {
  return (
    <View style={styles.row}>
      {DAYS.map((d) => {
        const on = values.includes(d.value);
        return (
          <Press
            key={d.value}
            onPress={() => {
              selection();
              onToggle(d.value);
            }}
            accessibilityRole={single ? 'radio' : 'checkbox'}
            accessibilityState={single ? { selected: on } : { checked: on }}
            accessibilityLabel={d.name}
            hitSlop={3}
            touchStyle={styles.cell}
            style={[styles.day, on && styles.dayOn]}
            pressedStyle={on ? undefined : styles.pressed}
          >
            <Text style={[styles.letter, on && styles.letterOn]}>{d.short}</Text>
          </Press>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm - 2 },
  cell: { flex: 1 },
  day: { aspectRatio: 1, maxHeight: 52, borderRadius: radius.pill, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: color.text },
  pressed: { backgroundColor: color.surfaceHigh },
  letter: { ...font.label, fontWeight: '800', color: color.textMuted },
  letterOn: { color: color.onAccent },
});
