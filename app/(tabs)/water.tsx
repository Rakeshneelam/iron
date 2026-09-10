import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, PrimaryButton, Ring, Screen, SectionHeader } from '@/components';
import { useLive } from '@/db/live';
import { deleteEntry, getDayEntries, logWater, undoLast } from '@/db/repositories/water';
import { fmtClockOfDay } from '@/features/settings/time';
import { minutesSinceMidnight, todayISO } from '@/lib/date';
import { ml } from '@/lib/format';
import { hydrationPlan } from '@/services/hydration';
import { rescheduleAll } from '@/services/notifications';
import { color, font, hit, space } from '@/theme/tokens';

const QUICK = [250, 500, 1000] as const;

/** Debt-based: the schedule is recomputed after every log, and it stays quiet when he's ahead. */
export default function WaterScreen() {
  const today = todayISO();
  const entries = useLive(() => getDayEntries(today), ['water_log'], [today]);
  const plan = useLive(() => hydrationPlan(), ['water_log', 'setting', 'weigh_in', 'session']);
  const next = plan.slots[0];

  const log = (amount: number) => {
    logWater(amount, today);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void rescheduleAll();
  };

  const status =
    plan.consumedMl >= plan.targetMl
      ? 'Target reached. Nothing scheduled.'
      : next
        ? `Next nudge ${fmtClockOfDay(next.atMinutes)} · ${next.amountMl} ml${plan.ahead ? ' — you’re ahead, so it waits until you aren’t.' : ''}`
        : plan.ahead
          ? 'You’re ahead of pace. Nothing scheduled.'
          : 'No more reminders today — outside your waking hours.';

  return (
    <Screen title="Water" subtitle={plan.breakdown}>
      <View style={styles.center}>
        <Ring
          progress={plan.targetMl > 0 ? plan.consumedMl / plan.targetMl : 0}
          size={220}
          label={ml(plan.consumedMl)}
          sublabel={`of ${ml(plan.targetMl)}`}
          tone={plan.consumedMl >= plan.targetMl ? 'positive' : 'accent'}
        />
      </View>
      <Text style={styles.status}>{status}</Text>

      <View style={styles.row}>
        {QUICK.map((q) => (
          <PrimaryButton key={q} label={`+${ml(q)}`} size="gym" style={styles.flex} onPress={() => log(q)} />
        ))}
      </View>
      {entries.length ? (
        <PrimaryButton
          label="Undo last"
          tone="ghost"
          style={styles.gap}
          onPress={() => {
            undoLast(today);
            void rescheduleAll();
          }}
        />
      ) : null}

      <SectionHeader title="Today" />
      <Card>
        {entries.length === 0 ? <Text style={styles.muted}>Tap a glass above when you drink.</Text> : null}
        {entries.map((e) => (
          <Pressable
            key={e.id}
            style={styles.entry}
            onLongPress={() => {
              deleteEntry(e.id);
              void rescheduleAll();
            }}
          >
            <Text style={styles.time}>{fmtClockOfDay(minutesSinceMidnight(new Date(e.loggedAt)))}</Text>
            <Text style={styles.amount}>{ml(e.ml)}</Text>
          </Pressable>
        ))}
        {entries.length ? <Text style={styles.muted}>Long-press an entry to remove it.</Text> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', marginVertical: space.lg },
  status: { ...font.label, color: color.textMuted, textAlign: 'center', marginBottom: space.lg },
  row: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  gap: { marginTop: space.sm },
  entry: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: hit.default },
  time: { ...font.body, ...font.numeric, color: color.textMuted },
  amount: { ...font.body, ...font.numeric, color: color.text },
  muted: { ...font.caption, color: color.textMuted, marginTop: space.xs },
});
