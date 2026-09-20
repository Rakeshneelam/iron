import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { addDays, fmtDayLabel, todayISO } from '@/lib/date';
import { color, font, hit, radius, space } from '@/theme/tokens';

import { IconButton } from './IconButton';
import { PrimaryButton } from './PrimaryButton';

/**
 * The selected day on a date-based screen, and what happens to it at midnight.
 *
 * Left open overnight, a screen would still be writing into yesterday. On resume,
 * follow the new day only if the user was looking at the current one; a day they
 * chose on purpose is theirs to keep. Lived inline in Food; Water needs the same
 * rule now that its date governs every write (UX-06).
 */
export function useSelectedDate(initial?: string): [string, (iso: string) => void] {
  const [date, setDate] = useState(() => initial ?? todayISO());
  const shownToday = useRef(todayISO());

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      const now = todayISO();
      if (now === shownToday.current) return;
      if (date === shownToday.current) setDate(now);
      shownToday.current = now;
    });
    return () => sub.remove();
  }, [date]);

  return [date, setDate];
}

export interface DateStepperProps {
  value: string;
  onChange: (iso: string) => void;
  max?: string;
}

/**
 * ‹ Yesterday › — the day every control on the screen reads and writes. Never goes
 * past today, and always offers the way back: browsing three days ago and then
 * tapping forward three times is not a way out of anything.
 */
export function DateStepper({ value, onChange, max }: DateStepperProps) {
  const today = todayISO();
  const limit = max ?? today;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <IconButton icon="chevronLeft" accessibilityLabel="Previous day" onPress={() => onChange(addDays(value, -1))} />
        <Text style={styles.label} accessibilityRole="header">
          {fmtDayLabel(value)}
        </Text>
        <IconButton icon="chevronRight" accessibilityLabel="Next day" disabled={value >= limit} onPress={() => onChange(addDays(value, 1))} />
      </View>
      {value !== today ? (
        <PrimaryButton label="Back to today" tone="ghost" accessibilityLabel="Go back to today" onPress={() => onChange(today)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, minHeight: hit.default },
  label: {
    ...font.body,
    color: color.text,
    fontWeight: '600',
    minWidth: 120,
    textAlign: 'center',
    borderRadius: radius.sm,
  },
});
