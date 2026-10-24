import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon, IconButton, ListCard, ListRow, MiniBars, PrimaryButton, Screen, SectionHeader, Sheet, Stepper, toast, useNow } from '@/components';
import { DateStepper, useSelectedDate } from '@/components/DateStepper';
import { Press } from '@/components/Press';
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
import { WaterLevel } from '@/features/water/WaterLevel';
import { color, font, hit, motion, radius, space } from '@/theme/tokens';

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
  const params = useLocalSearchParams<{ date?: string; log?: string }>();
  const today = todayISO();
  // Food hands its own selected day over, so browsing yesterday's meals and tapping
  // through to Water does not silently land on today.
  const [date, setDate] = useSelectedDate(typeof params.date === 'string' && params.date <= today ? params.date : undefined);
  const isToday = date === today;
  const settings = useSettings();

  const [targetSheet, setTargetSheet] = useState(false);
  /*
   * `?log=custom` comes from the water reminder's "Other amount" action when what
   * was typed into the notification could not be read as an amount — see
   * `parseAmountMl`. The sheet opens on arrival so the amount is one entry away
   * rather than one entry plus finding the button again.
   */
  const [sheet, setSheet] = useState<AmountTarget | null>(params.log === 'custom' ? { mode: 'add' } : null);

  const now = useNow();
  /** The entry just logged, drawn hot on the level for `motion.cool`. */
  const [fresh, setFresh] = useState<string | null>(null);
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(null), motion.cool);
    return () => clearTimeout(t);
  }, [fresh]);
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
    setFresh(row.id);
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
  const gapMl = Math.round(Math.abs(plan.consumedMl - plan.expectedByNowMl) / 10) * 10;
  /** Where the level stands against the pace line, in millilitres — never a grade. */
  const pace = !isToday ? null : reached ? 'Target reached' : plan.ahead ? `${ml(gapMl)} ahead of the pace line` : `${ml(gapMl)} under the pace line`;
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

      {/* The figure, then the level it is the top of. */}
      <View style={styles.readout}>
        <Text style={styles.big} numberOfLines={1}>
          {litres.n}
          <Text style={styles.bigUnit}> {litres.u}</Text>
        </Text>
        <View style={styles.readoutSide}>
          <Text style={styles.of}>of {ml(target)}{isToday ? '' : ' (current target)'}</Text>
          {pace ? <Text style={[styles.pace, isToday && (reached || plan.ahead) && styles.paceAhead]}>{pace}</Text> : null}
        </View>
      </View>

      <WaterLevel
        steps={entries.map((e) => ({ id: e.id, at: minutesSinceMidnight(new Date(e.loggedAt)), ml: e.ml }))}
        target={target}
        wake={plan.wakeMinutes}
        sleep={plan.sleepMinutes}
        now={isToday ? minutesSinceMidnight(now) : null}
        fresh={fresh}
      />

      <View style={styles.quickRow}>
        {QUICK.map((q) => (
          <Press
            key={q.ml}
            onPress={() => log(q.ml)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${ml(q.ml)} to ${isToday ? 'today' : fmtDayLabel(date)}`}
            touchStyle={styles.flex1}
            style={styles.quick}
            pressedStyle={styles.pressed}
          >
            <Text style={styles.quickAmount}>+{q.ml}</Text>
            <Text style={styles.quickLabel}>ml, {q.label}</Text>
          </Press>
        ))}
      </View>

      {isToday ? (
        <View style={styles.reminders}>
          <Icon name="bell" size={18} color={remindersOn ? color.text : color.textFaint} />
          <View style={styles.flex1}>
            <Text style={styles.cardTitle}>{reminderTitle}</Text>
            <Text style={styles.hint}>{reminderText}</Text>
          </View>
        </View>
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
      <MiniBars
        data={history.map((d) => ({ label: WEEKDAY[parseISODate(d.date).getDay()] ?? '', value: d.ml }))}
        target={target}
        highlight={history.length - 1}
        ink={color.cold}
      />
      <Text style={styles.hint}>
        {daysHit} of 14 days at or above the current target{logged.length ? `. On the days you logged, ${ml(avg)} on average.` : '.'}
      </Text>

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
      {/* min 10, not 50: a custom amount means any amount, and the reminder's own
          "Other amount" field accepts the same range (see `parseAmountMl`). */}
      <Stepper suffix="ml" size="gym" value={amount} step={50} min={10} max={3000} onChange={setAmount} />
      <Text style={styles.hint}>Long-press the number to type an exact amount in ml.</Text>
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
  flex1: { flex: 1 },
  headerBtns: { flexDirection: 'row', alignItems: 'center' },
  readout: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginTop: space.lg, marginBottom: space.md },
  big: { ...font.display, fontSize: 64, lineHeight: 66, color: color.text },
  bigUnit: { ...font.measure, fontSize: 28, fontWeight: '600', color: color.textMuted, letterSpacing: 0 },
  readoutSide: { flex: 1, paddingBottom: space.sm, gap: 2 },
  of: { ...font.label, fontVariant: ['tabular-nums'], color: color.textMuted },
  pace: { ...font.caption, fontVariant: ['tabular-nums'], color: color.textMuted },
  paceAhead: { color: color.cold },
  quickRow: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  quick: {
    minHeight: hit.gym + space.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: color.cold,
  },
  pressed: { backgroundColor: color.coldSoft },
  quickAmount: { ...font.measure, fontSize: 24, lineHeight: 28, color: color.cold },
  quickLabel: { ...font.caption, fontSize: 12, color: color.textMuted },
  reminders: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', marginTop: space.xl },
  cardTitle: { ...font.label, fontSize: 14, fontWeight: '600', color: color.text },
  amount: { ...font.label, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'], color: color.text },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  stack: { gap: space.md, paddingBottom: space.lg },
  row: { flexDirection: 'row', justifyContent: 'center' },
});
