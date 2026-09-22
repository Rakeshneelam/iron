import { router } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipRow, EmptyState, Icon, IconButton, ListCard, ListRow, PrimaryButton, Screen, SectionHeader, TrendChart, type ScreenProps } from '@/components';
import { useLive } from '@/db/live';
import { countWeighIns, listMeasurements, listWeighIns } from '@/db/repositories/body';
import { PHASES, useSettings } from '@/db/repositories/settings';
import { phaseCheck, weeklyRateKg, weightTrend, type Phase } from '@/engine/metabolic';
import { GOALS } from '@/features/settings/goals';
import { addDays, daysBetweenISO, fmtDayLabel, todayISO } from '@/lib/date';
import { kg, kgNum, signed } from '@/lib/format';
import { color, font, radius, space } from '@/theme/tokens';

import { WeighInSheet, type WeighEntry } from './sheets';

const RANGES = [
  { label: '1M', value: 30 },
  { label: '3M', value: 90 },
  { label: '1Y', value: 365 },
  { label: 'All', value: 0 },
];
const RECENT = 5;

export interface BodySectionProps {
  frame: Pick<ScreenProps, 'title' | 'subtitle' | 'strip'>;
  /** The profile link every section ends with. */
  tail?: ReactNode;
}

/**
 * Body → Weight. The smoothed trend leads; this morning's number is one quiet row
 * under it, because a single reading swings a kilo on water alone (AGENTS §6).
 * One primary action, in the dock: Log weight.
 *
 * The goal has one editor, in Profile & goals; here it is a row that links there,
 * sitting with the weight it governs (UX-03).
 */
export function WeightSection({ frame, tail, onMeasurements }: BodySectionProps & { onMeasurements: () => void }) {
  const settings = useSettings();
  const today = todayISO();
  const weighIns = useLive(() => listWeighIns(), ['weigh_in']);
  const total = useLive(() => countWeighIns(), ['weigh_in']);
  const lastMeasured = useLive(() => listMeasurements()[0]?.date ?? null, ['measurement']);
  const [range, setRange] = useState(90);
  const [weigh, setWeigh] = useState<WeighEntry | null>(null);

  const todays = weighIns.find((w) => w.date === today);
  const trend = useMemo(() => weightTrend(weighIns), [weighIns]);
  const lastTrend = trend[trend.length - 1]?.trend ?? null;
  const rate = weeklyRateKg(weighIns);
  const check = lastTrend !== null && trend.length >= 7 ? phaseCheck(settings.phase, lastTrend, rate) : null;

  const shown = range ? trend.filter((t) => t.date >= addDays(today, -range)) : trend;
  const first = shown[0]?.date ?? today;
  const trendPts = shown.map((t) => ({ x: daysBetweenISO(first, t.date), y: t.trend }));
  const rawPts = shown.map((t) => ({ x: daysBetweenISO(first, t.date), y: t.raw }));
  const change = shown.length >= 2 ? (shown[shown.length - 1]?.trend ?? 0) - (shown[0]?.trend ?? 0) : null;
  const weeks = Math.max(1, Math.round(daysBetweenISO(first, shown[shown.length - 1]?.date ?? today) / 7));
  const recent = [...weighIns].reverse().slice(0, RECENT);
  const goal = GOALS.find((g) => g.value === settings.phase && PHASES.includes(g.value))?.label ?? '—';

  const measuredAgo = lastMeasured ? daysBetweenISO(lastMeasured, today) : null;
  const every = settings.reminders.measurements.on ? settings.reminders.measurements.everyWeeks * 7 : null;
  const measureSub =
    measuredAgo === null
      ? 'Not measured yet — waist and arms show what the scale hides'
      : `Last taken ${measuredAgo === 0 ? 'today' : measuredAgo === 1 ? 'yesterday' : `${measuredAgo} days ago`}${
          every !== null ? (measuredAgo >= every ? ' — due now' : ` — due in ${every - measuredAgo}`) : ''
        }`;

  return (
    <Screen
      {...frame}
      tab
      dock={
        <PrimaryButton
          label={todays ? "Edit today's weight" : 'Log weight'}
          size="gym"
          icon={<Icon name="plus" size={18} color={color.onAccent} />}
          onPress={() => setWeigh({ date: today })}
        />
      }
    >
      {weighIns.length === 0 ? (
        <EmptyState message="No weigh-ins yet." hint="Same time each morning, before food. The trend is the signal; one morning is noise." />
      ) : (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Trend weight</Text>
          <View style={styles.heroRow}>
            <Text style={styles.hero}>{lastTrend === null ? '—' : kgNum(Math.round(lastTrend * 10) / 10)}</Text>
            <Text style={styles.unit}>kg</Text>
            <View style={styles.flex1} />
            {change !== null ? <Text style={[styles.change, { color: changeColor(settings.phase, change) }]}>{signed(change)} kg</Text> : null}
          </View>
          {trend.length >= 7 ? (
            <Text style={styles.muted}>
              Over {weeks} {weeks === 1 ? 'week' : 'weeks'} — about {signed(rate, 2)} kg a week.
            </Text>
          ) : null}
          {check ? <Text style={[styles.muted, check.onTrack ? styles.onTrack : styles.offTrack]}>{check.message}</Text> : null}
          {trend.length >= 2 ? (
            <View style={styles.chart}>
              <TrendChart
                trend={trendPts}
                raw={rawPts}
                height={150}
                format={(y) => `${kgNum(Math.round(y * 10) / 10)} kg`}
                formatX={(x) => fmtDayLabel(addDays(first, x))}
              />
              <ChipRow options={RANGES} value={range} onChange={setRange} />
              {/* The chart is not the only way to read this (UX-11). */}
              <Text style={styles.hint}>
                {`Latest ${kg(shown[shown.length - 1]?.raw ?? 0)} on ${fmtDayLabel(shown[shown.length - 1]?.date ?? today)}`}
                {shown.length > 1 ? `, from ${kg(shown[0]?.raw ?? 0)} on ${fmtDayLabel(first)}.` : '.'}
              </Text>
            </View>
          ) : (
            <Text style={styles.hint}>Log a few mornings and your trend line appears here.</Text>
          )}
        </View>
      )}

      {/* This morning's number, deliberately quieter than the trend above it. */}
      <View style={styles.morning}>
        <Text style={styles.morningLabel}>This morning</Text>
        <Text style={styles.morningValue}>{todays ? kg(todays.kg) : 'not logged'}</Text>
        <IconButton icon="edit" accessibilityLabel={todays ? "Edit this morning's weight" : "Log this morning's weight"} onPress={() => setWeigh({ date: today })} />
      </View>

      <ListCard style={styles.gapTop}>
        <ListRow left={<Icon name="ruler" size={20} color={color.textMuted} />} title="Measurements" sub={measureSub} onPress={onMeasurements} />
        <ListRow
          divider
          left={<Icon name="target" size={20} color={color.textMuted} />}
          title="Body-weight goal"
          sub={`${goal} · sets your calorie and water targets`}
          onPress={() => router.push('/settings/profile')}
        />
      </ListCard>

      {recent.length > 0 ? (
        <>
          <SectionHeader
            title="Recent weigh-ins"
            action={
              // "Show all" used to expand to sixty rows and stop. All of them means
              // all of them, on a list that can carry it.
              total > RECENT ? { label: `All ${total}`, onPress: () => router.push('/weight/history'), accessibilityLabel: `View all ${total} weigh-ins` } : undefined
            }
          />
          <ListCard>
            {recent.map((w, i) => (
              <ListRow
                key={w.date}
                divider={i > 0}
                title={fmtDayLabel(w.date)}
                tone="muted"
                chevron={false}
                right={<Text style={styles.value}>{kg(w.kg)}</Text>}
                onPress={() => setWeigh({ date: w.date })}
                accessibilityLabel={`${fmtDayLabel(w.date)}: ${kg(w.kg)}. Tap to edit or delete.`}
              />
            ))}
          </ListCard>
        </>
      ) : null}

      <View style={styles.gapTop}>{tail}</View>
      <WeighInSheet entry={weigh} onClose={() => setWeigh(null)} />
    </Screen>
  );
}

/** Moving the way the goal asks is positive; anything else is plain text, never an alarm. */
function changeColor(phase: Phase, change: number): string {
  const wanted = phase === 'cut' ? change < 0 : phase === 'bulk' ? change > 0 : Math.abs(change) < 0.5;
  return wanted ? color.positive : color.textMuted;
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, padding: space.lg + 2, gap: space.xs },
  eyebrow: { ...font.eyebrow, color: color.textFaint },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.md - 2 },
  hero: { ...font.display, fontSize: 46, lineHeight: 52, ...font.numeric, color: color.text },
  unit: { ...font.heading, fontWeight: '700', color: color.textMuted },
  change: { ...font.label, fontSize: 16, fontWeight: '700', ...font.numeric },
  muted: { ...font.caption, color: color.textMuted },
  onTrack: { color: color.positive },
  offTrack: { color: color.warning },
  hint: { ...font.caption, color: color.textMuted },
  chart: { marginTop: space.md, gap: space.md },
  morning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    marginTop: space.md,
    paddingLeft: space.lg,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
  },
  morningLabel: { ...font.label, fontWeight: '400', color: color.textMuted, flex: 1 },
  morningValue: { ...font.heading, fontSize: 18, fontWeight: '700', ...font.numeric, color: color.text },
  gapTop: { marginTop: space.md },
  value: { ...font.label, fontWeight: '600', ...font.numeric, color: color.text },
});
