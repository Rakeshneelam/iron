import { StyleSheet, Text, View } from 'react-native';

import { addDays, fmtDayLabel, todayISO } from '@/lib/date';
import { color, font, space } from '@/theme/tokens';

import { IconButton } from './IconButton';

/** ‹ Yesterday › — for back-dating an entry. Never goes past today. */
export function DateStepper({ value, onChange, max }: { value: string; onChange: (iso: string) => void; max?: string }) {
  const limit = max ?? todayISO();
  return (
    <View style={styles.row}>
      <IconButton icon="chevronLeft" accessibilityLabel="Previous day" onPress={() => onChange(addDays(value, -1))} />
      <Text style={styles.label}>{fmtDayLabel(value)}</Text>
      <IconButton icon="chevronRight" accessibilityLabel="Next day" disabled={value >= limit} onPress={() => onChange(addDays(value, 1))} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md },
  label: { ...font.body, color: color.text, fontWeight: '600', minWidth: 120, textAlign: 'center' },
});
