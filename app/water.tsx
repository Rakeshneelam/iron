import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EntryRow, Icon, IconButton, MiniBars, PrimaryButton, Screen, SectionHeader, Sheet, Stepper, toast } from '@/components';
import { DateStepper, useSelectedDate } from '@/components/DateStepper';
import { Press } from '@/components/Press';
import { useLive } from '@/db/live';
import { useSettings } from '@/db/repositories/settings';
import { deleteEntry, getDayEntries, getDayTotal, historyMl, logWater, restoreEntry, updateEntry, type WaterEntry } from '@/db/repositories/water';
import { fmtClockOfDay } from '@/features/settings/time';
import { WaterTargetSheet } from '@/features/water/TargetSheet';
import { WaterWave } from '@/features/water/WaterWave';
import { fmtDayLabel, minutesSinceMidnight, parseISODate, todayISO } from '@/lib/date';
import { ml, pct } from '@/lib/format';
import { success } from '@/lib/haptics';
import { hydrationPlan } from '@/services/hydration';
import { rescheduleAll } from '@/services/notifications';
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

  /** The entry just logged, outlined in sky for `motion.cool`. */
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
  const pace = !isToday ? null : reached ? 'Target reached' : plan.ahead ? `${ml(gapMl)} ahead of pace` : `${ml(gapMl)} under pace`;
  const remindersOn = settings.reminders.water.on;
  const reminderTitle = !remindersOn ? 'Reminders are off' : reached || plan.ahead ? 'Reminders are quiet' : next ? `Next reminder ${fmtClockOfDay(next.atMinutes)}` : 'No more reminders today';

  return (
    <Screen
      title="Water"
      back
      right={
        <View style={styles.headerBtns}>
          <IconButton icon="target" accessibilityLabel={`Daily target ${ml(target)}. Change it.`} onPress={() => setTargetSheet(true)} />
          <IconButton icon="bell" accessibilityLabel="Reminder settings" onPress={() => router.push('/you/reminders')} />
        </View>
      }
    >
      <DateStepper value={date} onChange={setDate} />

      <View style={styles.waveWrap}>
        <WaterWave
          fraction={target > 0 ? dayTotal / target : 0}
          badge={
            pace ? (
              <View style={styles.paceChip}>
                <Icon name={reached || plan.ahead ? 'arrowUp' : 'arrowDown'} size={13} color={color.cold} strokeWidth={2.6} />
                <Text style={styles.paceText}>{pace}</Text>
              </View>
            ) : null
          }
        >
          <Text style={styles.eyebrow}>{isToday ? 'Today' : fmtDayLabel(date)}</Text>
          <Text style={styles.big} numberOfLines={1}>
            {litres.n}
            <Text style={styles.bigUnit}> {litres.u}</Text>
          </Text>
          <Text style={styles.of}>
            of {ml(target)}
            {isToday ? `, ${pct(target > 0 ? dayTotal / target : 0)}` : ' (current target)'}
          </Text>
        </WaterWave>
      </View>

      <View style={styles.quickRow}>
        {QUICK.map((q) => (
          <Press
            key={q.ml}
            onPress={() => log(q.ml)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${ml(q.ml)} to ${isToday ? 'today' : fmtDayLabel(date)}`}
            touchStyle={styles.flex1}
            style={styles.quick}
          >
            <Text style={styles.quickAmount}>+{q.ml}</Text>
            <Text style={styles.quickLabel}>{q.label}</Text>
          </Press>
        ))}
        <Press onPress={() => setSheet({ mode: 'add' })} accessibilityRole="button" accessibilityLabel="Log another amount" touchStyle={styles.flex1} style={[styles.quick, styles.quickOther]} pressedStyle={styles.pressed}>
          <Icon name="plus" size={20} color={color.text} strokeWidth={2.4} />
          <Text style={[styles.quickLabel, styles.quickOtherLabel]}>other</Text>
        </Press>
      </View>

      {isToday ? (
        <View style={styles.reminders}>
          <View style={styles.bell}>
            <Icon name="bell" size={18} color={remindersOn ? color.cold : color.textFaint} />
          </View>
          <Text style={[styles.cardTitle, styles.flex1]}>{reminderTitle}</Text>
        </View>
      ) : null}

      <SectionHeader
        title={isToday ? 'Today' : fmtDayLabel(date)}
        right={entries.length ? <Text style={styles.count}>{`${entries.length} ${entries.length === 1 ? 'drink' : 'drinks'}`}</Text> : undefined}
      />
      {entries.length === 0 ? <Text style={styles.empty}>Nothing logged {isToday ? 'yet today' : 'this day'}.</Text> : null}
      {entries.map((e) => {
        const at = fmtClockOfDay(minutesSinceMidnight(new Date(e.loggedAt)));
        return (
          <EntryRow
            key={e.id}
            label={at}
            value={ml(e.ml)}
            fresh={e.id === fresh ? color.cold : undefined}
            onPress={() => setSheet({ mode: 'edit', entry: e })}
            accessibilityLabel={`${ml(e.ml)} at ${at}. Tap to edit or delete.`}
          />
        );
      })}

      <SectionHeader title="Last 14 days" />
      <View style={styles.history}>
        <MiniBars
          data={history.map((d) => ({ label: WEEKDAY[parseISODate(d.date).getDay()] ?? '', value: d.ml }))}
          target={target}
          highlight={history.length - 1}
          ink={color.cold}
          bubble={ml(history[history.length - 1]?.ml ?? 0)}
        />
        <Text style={styles.hint}>
          {daysHit} of 14 days on target{logged.length ? `, ${ml(avg)} a day on average` : ''}
        </Text>
      </View>

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
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  waveWrap: { marginTop: space.lg },
  eyebrow: { ...font.eyebrow, color: color.textMuted },
  big: { ...font.display, fontSize: 68, lineHeight: 72, color: color.text, paddingRight: space.xs },
  bigUnit: { ...font.measure, fontSize: 28, color: color.text, letterSpacing: 0 },
  of: { ...font.label, fontSize: 14, fontVariant: ['tabular-nums'], color: color.textMuted },
  paceChip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.onTile },
  paceText: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '800', color: color.cold, fontVariant: ['tabular-nums'] },

  quickRow: { flexDirection: 'row', gap: space.sm + 2, marginTop: space.md },
  quick: { minHeight: hit.gym + space.sm, alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: radius.md + 6, backgroundColor: color.cold },
  quickOther: { backgroundColor: color.surface },
  pressed: { backgroundColor: color.surfaceHigh },
  quickAmount: { ...font.label, fontSize: 17, lineHeight: 22, fontWeight: '800', color: color.onTile, fontVariant: ['tabular-nums'] },
  quickLabel: { ...font.caption, fontSize: 11, lineHeight: 14, fontWeight: '700', color: color.onTileMuted },
  quickOtherLabel: { color: color.textMuted },

  reminders: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', marginTop: space.lg, padding: space.lg, borderRadius: radius.lg, backgroundColor: color.surface },
  bell: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: color.coldSoft, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { ...font.label, fontSize: 14, color: color.text },

  count: { ...font.label, fontSize: 13, color: color.textMuted },
  empty: { ...font.body, color: color.textMuted },

  history: { padding: space.lg, borderRadius: radius.lg, backgroundColor: color.surface },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  stack: { gap: space.md, paddingBottom: space.lg },
  row: { flexDirection: 'row', justifyContent: 'center' },
});
