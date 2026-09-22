import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { addDays, fmtDayLabel, todayISO } from '@/lib/date';
import { color, font, hit, radius, space } from '@/theme/tokens';

import { Icon } from './Icon';
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
        <Arrow icon="chevronLeft" label="Previous day" onPress={() => onChange(addDays(value, -1))} />
        <Text style={styles.label} accessibilityRole="header">
          {fmtDayLabel(value)}
        </Text>
        <Arrow icon="chevronRight" label="Next day" disabled={value >= limit} onPress={() => onChange(addDays(value, 1))} />
      </View>
      {value !== today ? (
        <PrimaryButton label="Back to today" tone="ghost" accessibilityLabel="Go back to today" onPress={() => onChange(today)} />
      ) : null}
    </View>
  );
}

function Arrow({ icon, label, disabled, onPress }: { icon: 'chevronLeft' | 'chevronRight'; label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.arrow, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Icon name={icon} size={20} color={color.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: hit.default },
  arrow: {
    width: hit.default,
    height: hit.default,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: color.surfaceHigh },
  disabled: { opacity: 0.35 },
  label: { ...font.label, fontWeight: '600', color: color.text, flex: 1, textAlign: 'center' },
});
