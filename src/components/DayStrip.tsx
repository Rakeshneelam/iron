import { StyleSheet, Text, View } from 'react-native';

import { parseISODate } from '@/lib/date';
import { selection } from '@/lib/haptics';
import { color, font, radius } from '@/theme/tokens';

import { Press } from './Press';

const LETTERS = 'SMTWTFS';
const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface StripDay {
  date: string;
  /** A dot under the date: something happened (a workout, a meal logged). */
  marked?: boolean;
  /** Spoken after the date: "trained", "rest day". */
  note?: string;
  /** A day that cannot be chosen — the future, when browsing what you logged. */
  disabled?: boolean;
}

/**
 * A week as a row of pills: the letter, the date, and a dot for a day with
 * something in it. The chosen (or current) day is volt. Tap a day to pick it when
 * the strip is a picker; without `onSelect` it is just the week, at a glance.
 */
export function DayStrip({ days, selected, onSelect }: { days: readonly StripDay[]; selected: string; onSelect?: (date: string) => void }) {
  return (
    <View style={styles.row} accessibilityRole={onSelect ? 'tablist' : undefined}>
      {days.map((d) => {
        const date = parseISODate(d.date);
        const on = d.date === selected;
        const body = (
          <>
            <Text style={[styles.letter, on && styles.letterOn]}>{LETTERS[date.getDay()]}</Text>
            <Text style={[styles.num, on && styles.numOn, d.disabled && styles.numOff]}>{date.getDate()}</Text>
            <View style={[styles.dot, d.marked ? (on ? styles.dotOnSel : styles.dotOn) : null]} />
          </>
        );
        const label = `${NAMES[date.getDay()]} ${date.getDate()}${d.note ? `, ${d.note}` : ''}`;
        return onSelect ? (
          <Press
            key={d.date}
            disabled={d.disabled}
            onPress={() => {
              selection();
              onSelect(d.date);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on, disabled: !!d.disabled }}
            accessibilityLabel={label}
            touchStyle={styles.flex}
            style={[styles.day, on && styles.dayOn]}
          >
            {body}
          </Press>
        ) : (
          <View key={d.date} style={[styles.flex, styles.day, on && styles.dayOn]} accessible accessibilityLabel={label}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  flex: { flex: 1 },
  day: { height: 66, borderRadius: radius.pill, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayOn: { backgroundColor: color.accent },
  letter: { ...font.caption, fontSize: 11, lineHeight: 14, fontWeight: '700', color: color.textMuted },
  letterOn: { color: color.onTileMuted },
  num: { ...font.label, fontSize: 16, lineHeight: 20, fontWeight: '800', color: color.text },
  numOn: { color: color.onAccent },
  numOff: { color: color.textFaint },
  dot: { width: 5, height: 5, borderRadius: radius.pill, marginTop: 2 },
  dotOn: { backgroundColor: color.accent },
  dotOnSel: { backgroundColor: color.onAccent },
});
