import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { addDays, fmtDayLabel, todayISO, weekStartISO } from '@/lib/date';
import { color, font, radius, space } from '@/theme/tokens';

import { DayStrip } from './DayStrip';
import { Icon } from './Icon';
import { Press } from './Press';

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
 * The day every control on the screen reads and writes: its name, the week it sits
 * in as a strip of days to tap, and round arrows a week at a time for further back.
 * Never goes past today, and always offers the way back — a "Today" pill appears the
 * moment you are anywhere else.
 */
export function DateStepper({ value, onChange, max }: DateStepperProps) {
  const today = todayISO();
  const limit = max ?? today;
  const start = weekStartISO(value);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, disabled: date > limit };
  });
  const lastWeek = addDays(start, 7) > limit;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label} accessibilityRole="header" numberOfLines={1}>
          {fmtDayLabel(value)}
        </Text>
        {value !== today ? (
          <Press onPress={() => onChange(today)} accessibilityRole="button" accessibilityLabel="Go back to today" hitSlop={8} style={styles.today}>
            <Text style={styles.todayText}>Today</Text>
          </Press>
        ) : null}
        <View style={styles.flex} />
        <Arrow icon="chevronLeft" label="Previous week" onPress={() => onChange(addDays(value, -7))} />
        <Arrow icon="chevronRight" label="Next week" disabled={lastWeek} onPress={() => onChange(addDays(value, 7) > limit ? limit : addDays(value, 7))} />
      </View>
      <DayStrip days={days} selected={value} onSelect={onChange} />
    </View>
  );
}

function Arrow({ icon, label, disabled, onPress }: { icon: 'chevronLeft' | 'chevronRight'; label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={4}
      style={[styles.arrow, disabled && styles.disabled]}
      pressedStyle={styles.pressed}
    >
      <Icon name={icon} size={18} color={color.text} />
    </Press>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  label: { ...font.heading, color: color.text, flexShrink: 1 },
  today: { height: 30, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.accentWash, justifyContent: 'center' },
  todayText: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '800', color: color.accent },
  arrow: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: color.surfaceHigh },
  disabled: { opacity: 0.35 },
});
