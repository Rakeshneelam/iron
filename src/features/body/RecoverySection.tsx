import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, Icon, MiniBars, PrimaryButton, SectionHeader } from '@/components';
import { useLive } from '@/db/live';
import { listCheckIns, recentCheckIns } from '@/db/repositories/body';
import { CheckInSheet, sleepLabel } from '@/features/checkin/CheckInSheet';
import { addDays, fmtDayLabel, lastNDays, parseISODate, todayISO } from '@/lib/date';
import { color, font, hit, space } from '@/theme/tokens';

const WEEKDAY = 'SMTWTFS';
/** Where a night's bar turns green: seven hours is the floor for most adults. */
const SLEEP_GOAL_H = 7;

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Body → Recovery. How you have been feeling: the check-in, sleep, and the answers
 * you have already given — each of which can be corrected.
 *
 * Daily's sleep half, moved (UX-01), plus the thing it never had: a way back into a
 * past check-in. The action opens the same CheckInSheet Today does; there is no
 * second form here (UX-03).
 */
export function RecoverySection() {
  const today = todayISO();
  const checkIns = useLive(() => listCheckIns(addDays(today, -13)), ['check_in'], [today]);
  const recorded = useLive(() => recentCheckIns(14), ['check_in']);
  const [editing, setEditing] = useState<string | null>(null);

  const sleepByDate = new Map(checkIns.map((c) => [c.date, c.sleepHours ?? 0]));
  const nights = lastNDays(14, today).map((d) => ({ label: WEEKDAY[parseISODate(d).getDay()] ?? '', value: sleepByDate.get(d) ?? 0 }));
  const slept = checkIns.flatMap((c) => (c.sleepHours === null ? [] : [c.sleepHours]));
  const sore = checkIns.flatMap((c) => (c.soreness === null ? [] : [c.soreness]));
  const stressed = checkIns.flatMap((c) => (c.stress === null ? [] : [c.stress]));
  const felt = [sore.length ? `soreness ${mean(sore).toFixed(1)}` : '', stressed.length ? `stress ${mean(stressed).toFixed(1)}` : ''].filter(Boolean);
  const checkedInToday = recorded.some((c) => c.date === today);

  return (
    <>
      <PrimaryButton
        label={checkedInToday ? "Edit today's check-in" : 'Check in'}
        size="gym"
        icon={<Icon name="pulse" size={18} color={color.onAccent} />}
        style={styles.primary}
        onPress={() => setEditing(today)}
      />

      <SectionHeader title="Sleep" hint="Last 14 nights, from your check-ins." />
      <Card>
        {slept.length ? (
          <>
            <MiniBars data={nights} target={SLEEP_GOAL_H} highlight={nights.length - 1} />
            <Text style={styles.hint}>
              Average {mean(slept).toFixed(1)} h across {slept.length} {slept.length === 1 ? 'night' : 'nights'}.
            </Text>
            {felt.length ? <Text style={styles.hint}>Feeling on average: {felt.join(', ')} out of 5.</Text> : null}
          </>
        ) : (
          <EmptyState message="No sleep logged yet." hint="Add last night's sleep when you check in." actionLabel="Check in" onAction={() => setEditing(today)} />
        )}
      </Card>

      {recorded.length ? (
        <>
          <SectionHeader title="Check-ins" hint="Tap one to correct it. A missed day is just a missed day." />
          <Card style={styles.list}>
            {recorded.map((c, i) => {
              const parts = [
                c.sleepHours !== null ? sleepLabel(c.sleepHours) : null,
                c.soreness !== null ? `soreness ${c.soreness}` : null,
                c.stress !== null ? `stress ${c.stress}` : null,
              ].filter(Boolean);
              return (
                <Pressable
                  key={c.date}
                  style={[styles.row, i > 0 && styles.divider]}
                  onPress={() => setEditing(c.date)}
                  accessibilityRole="button"
                  accessibilityLabel={`Check-in for ${fmtDayLabel(c.date)}: ${parts.length ? parts.join(', ') : 'nothing recorded'}. Tap to correct.`}
                >
                  <Text style={styles.body}>{fmtDayLabel(c.date)}</Text>
                  <Text style={styles.value} numberOfLines={1}>
                    {parts.length ? parts.join(' · ') : 'Not recorded'}
                  </Text>
                </Pressable>
              );
            })}
          </Card>
        </>
      ) : null}

      {/* Keyed by day so each opening reads that day's answers. */}
      <CheckInSheet visible={editing !== null} date={editing ?? today} datePicker onClose={() => setEditing(null)} />
      <View style={styles.tail} />
    </>
  );
}

const styles = StyleSheet.create({
  primary: { marginBottom: space.lg },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  list: { paddingVertical: 0 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, minHeight: hit.default },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  body: { ...font.body, color: color.text },
  value: { ...font.caption, color: color.textMuted, flexShrink: 1 },
  tail: { height: space.lg },
});
