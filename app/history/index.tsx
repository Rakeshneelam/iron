/**
 * Workout history.
 *
 * One list and one search field — no mode switch. People arrive asking either "what
 * did I do on bench" or "what did I do in March", and making them choose a search
 * mode first serves neither. Type a lift and every row shows that lift's top set,
 * because that number is the actual question being asked.
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, EmptyState, PrimaryButton, Screen, SectionHeader, TextField } from '@/components';
import { useLive } from '@/db/live';
import { searchWorkouts } from '@/db/repositories/progress';
import { addDays, fmtDayLabel, todayISO } from '@/lib/date';
import { kg } from '@/lib/format';
import { color, font, space } from '@/theme/tokens';

/** Null = everything. Ranges people actually think in, not a date picker. */
const RANGES = [
  { label: 'All', value: 0 },
  { label: '30 days', value: 30 },
  { label: '3 months', value: 90 },
  { label: 'This year', value: 365 },
] as const;

export default function HistoryScreen() {
  const [text, setText] = useState('');
  const [days, setDays] = useState<number>(0);

  const sinceISO = useMemo(() => (days > 0 ? addDays(todayISO(), -days) : undefined), [days]);
  const rows = useLive(
    () => searchWorkouts({ text, sinceISO, limit: 200 }),
    ['session', 'set_log', 'exercise', 'routine_day'],
    [text, sinceISO],
  );

  const searching = text.trim().length > 0;

  return (
    <Screen
      title="History"
      subtitle={`${rows.length} ${rows.length === 1 ? 'workout' : 'workouts'}`}
      right={<PrimaryButton label="Done" tone="ghost" onPress={() => router.back()} />}
    >
      <TextField
        value={text}
        onCommit={setText}
        placeholder="Search a lift — bench, squat, row"
        accessibilityLabel="Search workouts by exercise"
        style={styles.input}
      />
      <ChipRow options={RANGES} value={days} onChange={setDays} />

      {rows.length === 0 ? (
        <EmptyState
          message={searching ? `Nothing logged for "${text.trim()}" in this period.` : 'No finished workouts yet.'}
          hint={searching ? undefined : 'Finish a workout and it appears here.'}
          actionLabel={searching || days > 0 ? 'Clear filters' : undefined}
          onAction={searching || days > 0 ? () => { setText(''); setDays(0); } : undefined}
        />
      ) : null}

      {rows.map((r) => (
        <Pressable
          key={r.session.id}
          onPress={() => router.push(`/session/summary/${r.session.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`${fmtDayLabel(r.session.date)}, ${r.sets} sets. Open summary.`}
        >
          <Card>
            <View style={styles.row}>
              <Text style={styles.date}>{fmtDayLabel(r.session.date)}</Text>
              {r.session.status === 'cancelled' ? <Text style={styles.muted}>cancelled</Text> : null}
            </View>
            <Text style={styles.muted}>
              {[r.dayLabel, `${r.sets} ${r.sets === 1 ? 'set' : 'sets'}`].filter(Boolean).join(' · ')}
            </Text>
            {/* The reason you searched, on the row itself, so you never have to open it. */}
            {r.top ? (
              <Text style={styles.top}>
                {r.top.name} · {r.top.weight > 0 ? `${kg(r.top.weight)} × ` : ''}
                {r.top.reps}
              </Text>
            ) : null}
          </Card>
        </Pressable>
      ))}

      {rows.length >= 200 ? <SectionHeader title="Showing the most recent 200 — narrow the search to see older ones" /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { ...font.body, color: color.text, fontWeight: '600' },
  muted: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  top: { ...font.body, color: color.accent, marginTop: space.xs },
});
