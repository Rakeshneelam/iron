import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Icon, IconButton, MiniBars, PrimaryButton, Ring, Screen, SectionHeader, Sheet, Stepper, toast } from '@/components';
import { DateStepper } from '@/components/DateStepper';
import { useLive } from '@/db/live';
import { deleteEntry, getDayEntries, historyMl, logWater, restoreEntry, updateEntry, type WaterEntry } from '@/db/repositories/water';
import { fmtClockOfDay } from '@/features/settings/time';
import { fmtDayLabel, minutesSinceMidnight, parseISODate, todayISO } from '@/lib/date';
import { ml } from '@/lib/format';
import { hydrationPlan } from '@/services/hydration';
import { rescheduleAll } from '@/services/notifications';
import { WaterTargetSheet } from '@/features/water/TargetSheet';
import { color, font, hit, space } from '@/theme/tokens';

const QUICK = [250, 500, 750, 1000] as const;
const WEEKDAY = 'SMTWTFS';

type AmountTarget = { mode: 'add' } | { mode: 'edit'; entry: WaterEntry };

/** Debt-based: the schedule is recomputed after every log, and it stays quiet when you're ahead. */
export default function WaterScreen() {
  const today = todayISO();
  const [viewDate, setViewDate] = useState(today);
  const [targetSheet, setTargetSheet] = useState(false);
  const entries = useLive(() => getDayEntries(viewDate), ['water_log'], [viewDate]);
  const plan = useLive(() => hydrationPlan(), ['water_log', 'setting', 'weigh_in', 'session']);
  const history = useLive(() => historyMl(14), ['water_log']);
  const [sheet, setSheet] = useState<AmountTarget | null>(null);
  const next = plan.slots[0];

  const log = (amount: number, date = today) => {
    const row = logWater(amount, date);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void rescheduleAll();
    if (row) {
      toast(`+${ml(amount)}${date === today ? '' : ` on ${fmtDayLabel(date)}`}`, {
        label: 'Undo',
        onPress: () => {
          deleteEntry(row.id);
          void rescheduleAll();
        },
      });
    }
  };

  const reached = plan.consumedMl >= plan.targetMl;
  const status = reached
    ? 'Target reached — no more reminders today.'
    : next
      ? `Next reminder ${fmtClockOfDay(next.atMinutes)}${plan.ahead ? ' · you’re ahead of pace' : ''}`
      : plan.ahead
        ? 'Ahead of pace. Nothing scheduled.'
        : 'No more reminders today.';

  const logged = history.filter((d) => d.ml > 0);
  const daysHit = history.filter((d) => d.ml >= plan.targetMl).length;
  const avg = logged.length ? logged.reduce((a, d) => a + d.ml, 0) / logged.length : 0;
  const dayTotal = entries.reduce((a, e) => a + e.ml, 0);

  return (
    <Screen
      title="Water"
      subtitle={`Target ${ml(plan.targetMl)}`}
      right={
        <View style={styles.headerBtns}>
          <IconButton
            icon="edit"
            tone="neutral"
            accessibilityLabel="Change your daily water target"
            onPress={() => setTargetSheet(true)}
          />
          <PrimaryButton label="Done" tone="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </View>
      }
    >
      <View style={styles.center}>
        <Ring
          progress={plan.targetMl > 0 ? plan.consumedMl / plan.targetMl : 0}
          size={148}
          label={ml(plan.consumedMl)}
          sublabel={reached ? 'done' : `${ml(Math.max(0, plan.targetMl - plan.consumedMl))} to go`}
          tone={reached ? 'positive' : 'accent'}
        />
      </View>
      {/* Only when there is something to say. "No more reminders today" under an
          empty ring is noise standing between the user and the log buttons. */}
      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={styles.grid}>
        {QUICK.map((q) => (
          <PrimaryButton key={q} label={`+${ml(q)}`} size="gym" tone="neutral" style={styles.quick} onPress={() => log(q)} />
        ))}
      </View>
      <PrimaryButton label="Custom amount" tone="ghost" icon={<Icon name="edit" size={16} />} style={styles.gapTop} onPress={() => setSheet({ mode: 'add' })} />

      <SectionHeader title="Entries" />
      <Card>
        <DateStepper value={viewDate} onChange={setViewDate} />
        {entries.length === 0 ? <Text style={styles.empty}>Nothing logged {viewDate === today ? 'yet today' : 'this day'}.</Text> : null}
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
          target={plan.targetMl}
          highlight={history.length - 1}
        />
        <Text style={styles.hint}>
          Target hit {daysHit} of 14 days{logged.length ? ` · average ${ml(avg)} on days you logged` : ''}
        </Text>
      </Card>

      <AmountSheet sheet={sheet} onClose={() => setSheet(null)} onAdd={log} viewDate={viewDate} />
      <WaterTargetSheet visible={targetSheet} onClose={() => setTargetSheet(false)} />
    </Screen>
  );
}

interface AmountProps {
  onClose: () => void;
  onAdd: (amount: number, date: string) => void;
  viewDate: string;
}

function AmountSheet({ sheet, ...rest }: AmountProps & { sheet: AmountTarget | null }) {
  return (
    <Sheet visible={sheet !== null} onClose={rest.onClose} title={sheet?.mode === 'edit' ? 'Edit entry' : 'Custom amount'}>
      {/* Mounted per opening, so it starts from the entry without an effect. */}
      {sheet ? <AmountForm key={sheet.mode === 'edit' ? sheet.entry.id : 'add'} sheet={sheet} {...rest} /> : null}
    </Sheet>
  );
}

function AmountForm({ sheet, onClose, onAdd, viewDate }: AmountProps & { sheet: AmountTarget }) {
  const [amount, setAmount] = useState(sheet.mode === 'edit' ? sheet.entry.ml : 300);
  const [date, setDate] = useState(viewDate);

  return (
        <View style={styles.stack}>
          {sheet.mode === 'add' ? <DateStepper value={date} onChange={setDate} /> : null}
          <Stepper suffix="ml" size="gym" value={amount} step={50} min={50} max={3000} onChange={setAmount} />
          <Text style={styles.hint}>Long-press the number to type an exact amount.</Text>
          <PrimaryButton
            label={sheet.mode === 'edit' ? 'Save' : `Add ${ml(amount)}`}
            size="gym"
            onPress={() => {
              if (sheet.mode === 'edit') {
                updateEntry(sheet.entry.id, amount);
                void rescheduleAll();
              } else {
                onAdd(amount, date);
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
                  void rescheduleAll();
                  toast(`Deleted ${ml(e.ml)}`, {
                    label: 'Undo',
                    onPress: () => {
                      restoreEntry(e);
                      void rescheduleAll();
                    },
                  });
                  onClose();
                }}
              />
            </View>
          ) : null}
          {sheet.mode === 'add' && date !== todayISO() ? <Text style={styles.hint}>Adding to {fmtDayLabel(date)}.</Text> : null}
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
