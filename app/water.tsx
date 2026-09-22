import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Icon, IconButton, ListCard, ListRow, MiniBars, Pill, PrimaryButton, Ring, Screen, SectionHeader, Sheet, Stepper, toast } from '@/components';
import { DateStepper, useSelectedDate } from '@/components/DateStepper';
import { useLive } from '@/db/live';
import { useSettings } from '@/db/repositories/settings';
import { deleteEntry, getDayEntries, getDayTotal, historyMl, logWater, restoreEntry, updateEntry, type WaterEntry } from '@/db/repositories/water';
import { fmtClockOfDay } from '@/features/settings/time';
import { fmtDayLabel, minutesSinceMidnight, parseISODate, todayISO } from '@/lib/date';
import { success } from '@/lib/haptics';
import { ml } from '@/lib/format';
import { hydrationPlan } from '@/services/hydration';
import { rescheduleAll } from '@/services/notifications';
import { WaterTargetSheet } from '@/features/water/TargetSheet';
import { color, font, radius, space } from '@/theme/tokens';

const QUICK = [
  { ml: 250, label: 'glass' },
  { ml: 500, label: 'bottle' },
  { ml: 750, label: 'shaker' },
] as const;
const WEEKDAY = 'SMTWTFS';

type AmountTarget = { mode: 'add' } | { mode: 'edit'; entry: WaterEntry };

/**
 * Debt-based: the schedule is recomputed after every log, and it stays quiet when
 * you're ahead.
 *
 * One date governs the whole screen. It used to govern only the Entries list while
 * the ring, the quick-add buttons and the custom sheet each picked their own day,
 * so two buttons that looked identical wrote to different dates (UX-06). Everything
 * below reads `date`, and every write is handed it explicitly.
 */
export default function WaterScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const today = todayISO();
  // Food hands its own selected day over, so browsing yesterday's meals and tapping
  // through to Water does not silently land on today.
  const [date, setDate] = useSelectedDate(typeof params.date === 'string' && params.date <= today ? params.date : undefined);
  const isToday = date === today;
  const settings = useSettings();

  const [targetSheet, setTargetSheet] = useState(false);
  const [sheet, setSheet] = useState<AmountTarget | null>(null);

  const entries = useLive(() => getDayEntries(date), ['water_log'], [date]);
  const dayTotal = useLive(() => getDayTotal(date), ['water_log'], [date]);
  const plan = useLive(() => hydrationPlan(), ['water_log', 'setting', 'weigh_in', 'session']);
  const history = useLive(() => historyMl(14), ['water_log']);
  const next = plan.slots[0];

  const log = (amount: number) => {
    const row = logWater(amount, date);
    success();
    // Only today's total can move today's schedule; a back-dated drink cannot.
    if (isToday) void rescheduleAll();
    if (!row) return;
    toast(`Added ${ml(amount)}${isToday ? '' : ` to ${fmtDayLabel(date)}`}`, {
      label: 'Undo',
      onPress: () => {
        deleteEntry(row.id);
        if (isToday) void rescheduleAll();
      },
    });
  };

  // The target is today's. There is no historical snapshot, so a past day is never
  // told it hit or missed "its" target — it is compared with the current one, said
  // out loud, or just shown as the total it was.
  const target = plan.targetMl;
  const reached = dayTotal >= target;
  const logged = history.filter((d) => d.ml > 0);
  const daysHit = history.filter((d) => d.ml >= target).length;
  const avg = logged.length ? logged.reduce((a, d) => a + d.ml, 0) / logged.length : 0;
  const litres = dayTotal >= 1000 ? { n: (Math.round(dayTotal / 100) / 10).toString(), u: 'L' } : { n: String(Math.round(dayTotal)), u: 'ml' };
  const pace = !isToday ? null : reached ? { label: 'Target reached', tone: 'positive' as const } : plan.ahead ? { label: 'Ahead of pace', tone: 'positive' as const } : { label: 'Behind pace', tone: 'muted' as const };
  const gapMl = Math.round(Math.abs(plan.consumedMl - plan.expectedByNowMl) / 10) * 10;
  const remindersOn = settings.reminders.water.on;
  const reminderTitle = !remindersOn ? 'Reminders are off' : reached || plan.ahead ? 'Reminders are quiet' : next ? `Next reminder ${fmtClockOfDay(next.atMinutes)}` : 'No more reminders today';
  const reminderText = !remindersOn
    ? 'Turn them on in Settings → Reminders. They only ever nudge when you fall behind.'
    : reached
      ? 'Target reached — nothing more will buzz today.'
      : plan.ahead
        ? `You are ${ml(gapMl)} ahead of where the day expects you to be, so nothing will buzz until you fall behind.`
        : `You are ${ml(gapMl)} behind where the day expects you to be. One reminder at a time, never on a timer.`;

  return (
    <Screen
      title="Water"
      subtitle={isToday ? new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : fmtDayLabel(date)}
      back
      right={
        <View style={styles.headerBtns}>
          <IconButton icon="target" accessibilityLabel={`Daily target ${ml(target)}. Change it.`} onPress={() => setTargetSheet(true)} />
          <IconButton icon="bell" accessibilityLabel="Reminder settings" onPress={() => router.push('/settings/reminders')} />
        </View>
      }
      dock={<PrimaryButton label="Log another amount" size="gym" icon={<Icon name="plus" size={18} color={color.onAccent} />} onPress={() => setSheet({ mode: 'add' })} />}
    >
      <DateStepper value={date} onChange={setDate} />

      <View style={styles.center}>
        <Ring progress={target > 0 ? dayTotal / target : 0} size={248} thickness={16} tone={isToday && reached ? 'positive' : 'accent'}>
          <Text style={styles.big} numberOfLines={1}>
            {litres.n}
            <Text style={styles.bigUnit}> {litres.u}</Text>
          </Text>
          <Text style={styles.of}>
            of {ml(target)} {isToday ? 'today' : '(current target)'}
          </Text>
          {pace ? (
            <View style={styles.pace}>
              <Pill label={pace.label} tone={pace.tone} />
            </View>
          ) : null}
        </Ring>
      </View>

      <View style={styles.quickRow}>
        {QUICK.map((q) => (
          <Pressable
            key={q.ml}
            onPress={() => log(q.ml)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${ml(q.ml)} to ${isToday ? 'today' : fmtDayLabel(date)}`}
            style={({ pressed }) => [styles.quick, pressed && styles.pressed]}
          >
            <Text style={styles.quickAmount}>{q.ml}</Text>
            <Text style={styles.quickLabel}>ml · {q.label}</Text>
          </Pressable>
        ))}
      </View>

      {isToday ? (
        <Card style={styles.reminders}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>{reminderTitle}</Text>
            <Text style={styles.faint}>{remindersOn ? 'On' : 'Off'}</Text>
          </View>
          <Text style={styles.hint}>{reminderText}</Text>
        </Card>
      ) : null}

      <SectionHeader title={isToday ? 'Today' : fmtDayLabel(date)} />
      <ListCard>
        {entries.length === 0 ? <ListRow title={`Nothing logged ${isToday ? 'yet today' : 'this day'}.`} tone="muted" /> : null}
        {entries.map((e, i) => (
          <ListRow
            key={e.id}
            divider={i > 0}
            title={fmtClockOfDay(minutesSinceMidnight(new Date(e.loggedAt)))}
            tone="muted"
            chevron={false}
            right={<Text style={styles.amount}>{ml(e.ml)}</Text>}
            onPress={() => setSheet({ mode: 'edit', entry: e })}
            accessibilityLabel={`${ml(e.ml)} at ${fmtClockOfDay(minutesSinceMidnight(new Date(e.loggedAt)))}. Tap to edit or delete.`}
          />
        ))}
      </ListCard>

      <SectionHeader title="Last 14 days" hint={plan.breakdown} />
      <Card>
        <MiniBars
          data={history.map((d) => ({ label: WEEKDAY[parseISODate(d.date).getDay()] ?? '', value: d.ml }))}
          target={target}
          highlight={history.length - 1}
        />
        <Text style={styles.hint}>
          {daysHit} of 14 days at or above the current target{logged.length ? ` · average ${ml(avg)} on days you logged` : ''}
        </Text>
      </Card>

      <AmountSheet sheet={sheet} date={date} onClose={() => setSheet(null)} onAdd={log} />
      <WaterTargetSheet visible={targetSheet} onClose={() => setTargetSheet(false)} />
    </Screen>
  );
}

interface AmountProps {
  onClose: () => void;
  onAdd: (amount: number) => void;
  date: string;
}

function AmountSheet({ sheet, ...rest }: AmountProps & { sheet: AmountTarget | null }) {
  return (
    <Sheet visible={sheet !== null} onClose={rest.onClose} title={sheet?.mode === 'edit' ? 'Edit entry' : 'Custom amount'}>
      {/* Mounted per opening, so it starts from the entry without an effect. */}
      {sheet ? <AmountForm key={sheet.mode === 'edit' ? sheet.entry.id : 'add'} sheet={sheet} {...rest} /> : null}
    </Sheet>
  );
}

function AmountForm({ sheet, onClose, onAdd, date }: AmountProps & { sheet: AmountTarget }) {
  const [amount, setAmount] = useState(sheet.mode === 'edit' ? sheet.entry.ml : 300);
  const day = sheet.mode === 'edit' ? sheet.entry.date : date;
  const isToday = day === todayISO();

  return (
    <View style={styles.stack}>
      <Stepper suffix="ml" size="gym" value={amount} step={50} min={50} max={3000} onChange={setAmount} />
      <Text style={styles.hint}>Long-press the number to type an exact amount.</Text>
      <PrimaryButton
        label={sheet.mode === 'edit' ? 'Save' : `Add ${ml(amount)}${isToday ? '' : ` to ${fmtDayLabel(day)}`}`}
        size="gym"
        onPress={() => {
          if (sheet.mode === 'edit') {
            updateEntry(sheet.entry.id, amount);
            if (isToday) void rescheduleAll();
          } else {
            // The screen's date, not one this sheet keeps for itself.
            onAdd(amount);
          }
          onClose();
        }}
      />
      {sheet.mode === 'edit' ? (
        <View style={styles.row}>
          <IconButton
            icon="trash"
            label="Delete"
            tone="neutral"
            accessibilityLabel="Delete entry"
            onPress={() => {
              const e = sheet.entry;
              deleteEntry(e.id);
              if (isToday) void rescheduleAll();
              toast(`Deleted ${ml(e.ml)}`, {
                label: 'Undo',
                onPress: () => {
                  restoreEntry(e);
                  if (isToday) void rescheduleAll();
                },
              });
              onClose();
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerBtns: { flexDirection: 'row', alignItems: 'center' },
  center: { alignItems: 'center', marginVertical: space.lg },
  big: { ...font.hero, fontSize: 56, lineHeight: 60, ...font.numeric, color: color.text },
  bigUnit: { ...font.title, fontSize: 26, color: color.textMuted, letterSpacing: 0 },
  of: { ...font.caption, fontSize: 14, color: color.textMuted },
  pace: { marginTop: space.sm },
  quickRow: { flexDirection: 'row', gap: space.md - 2 },
  quick: {
    flex: 1,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
  },
  pressed: { backgroundColor: color.surfaceHigh },
  quickAmount: { ...font.heading, fontWeight: '700', ...font.numeric, color: color.text },
  quickLabel: { ...font.caption, fontSize: 12, color: color.textFaint },
  reminders: { marginTop: space.lg, marginBottom: 0, gap: space.xs },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  cardTitle: { ...font.label, fontSize: 14, fontWeight: '600', color: color.text, flex: 1 },
  faint: { ...font.caption, color: color.textFaint },
  amount: { ...font.label, fontSize: 14, fontWeight: '700', ...font.numeric, color: color.text },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  stack: { gap: space.md, paddingBottom: space.lg },
  row: { flexDirection: 'row', justifyContent: 'center' },
});
