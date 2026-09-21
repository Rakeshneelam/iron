import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Icon, IconButton, MiniBars, PrimaryButton, Ring, Screen, SectionHeader, Sheet, Stepper, toast } from '@/components';
import { DateStepper, useSelectedDate } from '@/components/DateStepper';
import { useLive } from '@/db/live';
import { deleteEntry, getDayEntries, getDayTotal, historyMl, logWater, restoreEntry, updateEntry, type WaterEntry } from '@/db/repositories/water';
import { fmtClockOfDay } from '@/features/settings/time';
import { fmtDayLabel, minutesSinceMidnight, parseISODate, todayISO } from '@/lib/date';
import { success } from '@/lib/haptics';
import { ml } from '@/lib/format';
import { hydrationPlan } from '@/services/hydration';
import { rescheduleAll } from '@/services/notifications';
import { WaterTargetSheet } from '@/features/water/TargetSheet';
import { color, font, hit, space } from '@/theme/tokens';

const QUICK = [250, 500, 750, 1000] as const;
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
  const status = !isToday
    ? `${ml(dayTotal)} logged · current target ${ml(target)}`
    : reached
      ? 'Target reached — no more reminders today.'
      : next
        ? `Next reminder ${fmtClockOfDay(next.atMinutes)}${plan.ahead ? ' · you’re ahead of pace' : ''}`
        : plan.ahead
          ? 'Ahead of pace. Nothing scheduled.'
          : 'No more reminders today.';

  const logged = history.filter((d) => d.ml > 0);
  const daysHit = history.filter((d) => d.ml >= target).length;
  const avg = logged.length ? logged.reduce((a, d) => a + d.ml, 0) / logged.length : 0;

  return (
    <Screen
      title="Water"
      subtitle={`${isToday ? 'Target' : 'Current target'} ${ml(target)}`}
      right={
        <View style={styles.headerBtns}>
          <IconButton icon="edit" tone="neutral" accessibilityLabel="Change your daily water target" onPress={() => setTargetSheet(true)} />
          <PrimaryButton label="Done" tone="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </View>
      }
    >
      <DateStepper value={date} onChange={setDate} />

      <View style={styles.center}>
        <Ring
          progress={target > 0 ? dayTotal / target : 0}
          size={148}
          label={ml(dayTotal)}
          sublabel={reached ? 'done' : `${ml(Math.max(0, target - dayTotal))} to go`}
          tone={reached ? 'positive' : 'accent'}
        />
      </View>
      <Text style={styles.status}>{status}</Text>

      <View style={styles.grid}>
        {QUICK.map((q) => (
          <PrimaryButton
            key={q}
            label={`+${ml(q)}`}
            size="gym"
            tone="neutral"
            style={styles.quick}
            accessibilityLabel={`Add ${ml(q)} to ${isToday ? 'today' : fmtDayLabel(date)}`}
            onPress={() => log(q)}
          />
        ))}
      </View>
      <PrimaryButton label="Custom amount" tone="ghost" icon={<Icon name="edit" size={16} />} style={styles.gapTop} onPress={() => setSheet({ mode: 'add' })} />

      <SectionHeader title={isToday ? 'Entries today' : `Entries on ${fmtDayLabel(date)}`} />
      <Card>
        {entries.length === 0 ? <Text style={styles.empty}>Nothing logged {isToday ? 'yet today' : 'this day'}.</Text> : null}
        {entries.map((e) => (
          <Pressable key={e.id} style={styles.entry} onPress={() => setSheet({ mode: 'edit', entry: e })} accessibilityHint="Tap to edit or delete">
            <Text style={styles.time}>{fmtClockOfDay(minutesSinceMidnight(new Date(e.loggedAt)))}</Text>
            <Text style={styles.amount}>{ml(e.ml)}</Text>
          </Pressable>
        ))}
        {entries.length ? (
          <View style={styles.entry}>
            <Text style={styles.time}>Total</Text>
            <Text style={styles.amount}>{ml(dayTotal)}</Text>
          </View>
        ) : null}
      </Card>

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
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  center: { alignItems: 'center', marginVertical: space.md },
  status: { ...font.label, color: color.textMuted, textAlign: 'center', marginBottom: space.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  quick: { width: '48.5%' },
  gapTop: { marginTop: space.sm },
  empty: { ...font.label, color: color.textMuted, textAlign: 'center', paddingVertical: space.md },
  entry: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: hit.default, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  time: { ...font.body, ...font.numeric, color: color.textMuted },
  amount: { ...font.body, ...font.numeric, color: color.text, fontWeight: '600' },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  stack: { gap: space.md, paddingBottom: space.lg },
  row: { flexDirection: 'row', justifyContent: 'center' },
});
