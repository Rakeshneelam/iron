import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, EmptyState, MiniBars, Pill, PrimaryButton, Screen, SectionHeader, TrendChart } from '@/components';
import { useLive } from '@/db/live';
import { getLatestWeight, listCheckIns, listWeighIns } from '@/db/repositories/body';
import { PHASES, setSetting, useSettings } from '@/db/repositories/settings';
import { phaseCheck, weeklyRateKg, weightTrend } from '@/engine/metabolic';
import { WeighInSheet, type WeighEntry } from '@/features/body/sheets';
import { CheckInCard } from '@/features/checkin/CheckInCard';
import { CheckInSheet } from '@/features/checkin/CheckInSheet';
import { GOALS } from '@/features/settings/goals';
import { addDays, daysBetweenISO, fmtDayLabel, lastNDays, parseISODate, todayISO } from '@/lib/date';
import { kg, kgNum, signed } from '@/lib/format';
import { DEFAULT_WEIGHT_KG } from '@/services/hydration';
import { color, font, hit, space } from '@/theme/tokens';

const RANGES = [
  { label: '1M', value: 30 },
  { label: '3M', value: 90 },
  { label: '1Y', value: 365 },
  { label: 'All', value: 0 },
];
const WEEKDAY = 'SMTWTFS';
/** Where a night's bar turns green: seven hours is the floor for most adults. */
const SLEEP_GOAL_H = 7;

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * The numbers that change every day: the check-in, the weight trend and sleep.
 * The trend is the signal; a single morning is noise. Never red for weight going up.
 */
export default function DailyScreen() {
  const settings = useSettings();
  const today = todayISO();
  const weighIns = useLive(() => listWeighIns(), ['weigh_in']);
  const checkIns = useLive(() => listCheckIns(addDays(today, -13)), ['check_in'], [today]);

  const [range, setRange] = useState(90);
  const [weigh, setWeigh] = useState<WeighEntry | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const todays = weighIns.find((w) => w.date === today);
  const trend = useMemo(() => weightTrend(weighIns), [weighIns]);
  const lastTrend = trend[trend.length - 1]?.trend ?? null;
  const rate = weeklyRateKg(weighIns);
  const pctWk = lastTrend ? (rate / lastTrend) * 100 : 0;
  const check = lastTrend !== null && trend.length >= 7 ? phaseCheck(settings.phase, lastTrend, rate) : null;

  const shown = range ? trend.filter((t) => t.date >= addDays(today, -range)) : trend;
  const first = shown[0]?.date ?? today;
  const trendPts = shown.map((t) => ({ x: daysBetweenISO(first, t.date), y: t.trend }));
  const rawPts = shown.map((t) => ({ x: daysBetweenISO(first, t.date), y: t.raw }));
  const recent = [...weighIns].reverse().slice(0, showAll ? 60 : 5);

  const sleepByDate = new Map(checkIns.map((c) => [c.date, c.sleepHours ?? 0]));
  const nights = lastNDays(14, today).map((d) => ({ label: WEEKDAY[parseISODate(d).getDay()] ?? '', value: sleepByDate.get(d) ?? 0 }));
  const slept = checkIns.flatMap((c) => (c.sleepHours === null ? [] : [c.sleepHours]));
  const sore = checkIns.flatMap((c) => (c.soreness === null ? [] : [c.soreness]));
  const stressed = checkIns.flatMap((c) => (c.stress === null ? [] : [c.stress]));
  const felt = [sore.length ? `soreness ${mean(sore).toFixed(1)}` : '', stressed.length ? `stress ${mean(stressed).toFixed(1)}` : ''].filter(Boolean);

  const logWeight = () => setWeigh({ date: today, kg: todays?.kg ?? getLatestWeight() ?? DEFAULT_WEIGHT_KG, existing: todays !== undefined });

  return (
    <Screen title="Daily" subtitle="Check-in, weight and sleep">
      <CheckInCard onCheckIn={() => setCheckingIn(true)} />

      <SectionHeader title="Weight" right={<PrimaryButton label={todays ? "Edit today's" : "Log today's"} tone="ghost" onPress={logWeight} />} />
      <Card>
        <View style={styles.rowBetween}>
          <Text style={styles.hero}>
            {lastTrend === null ? '—' : kgNum(Math.round(lastTrend * 10) / 10)}
            <Text style={styles.unit}> kg</Text>
          </Text>
          {trend.length >= 7 ? <Pill label={`${signed(rate, 2)} kg/wk · ${signed(pctWk, 2)}%`} /> : null}
        </View>
        {trend.length >= 2 ? (
          <View style={styles.chart}>
            <Text style={styles.muted}>Smoothed trend. Daily readings swing with water; this line does not.</Text>
            <TrendChart
              trend={trendPts}
              raw={rawPts}
              height={150}
              format={(y) => `${kgNum(Math.round(y * 10) / 10)} kg`}
              formatX={(x) => fmtDayLabel(addDays(first, x))}
            />
            <ChipRow options={RANGES} value={range} onChange={setRange} />
          </View>
        ) : (
          <Text style={styles.hint}>Log a few mornings and your trend line appears here.</Text>
        )}
      </Card>

      <SectionHeader title="Goal" hint="Sets your calorie and water targets." />
      <Card>
        <ChipRow options={GOALS.filter((g) => PHASES.includes(g.value))} value={settings.phase} onChange={(v) => setSetting('phase', v)} fill={false} />
        {check ? (
          <Text style={[styles.body, styles.checkNote, check.onTrack ? styles.onTrack : styles.offTrack]}>{check.message}</Text>
        ) : (
          <Text style={styles.hint}>
            {trend.length >= 7
              ? 'Weigh in a few more mornings and Iron will tell you whether this is working.'
              : `A weekly check against this goal starts once you have seven weigh-ins. ${trend.length} so far.`}
          </Text>
        )}
      </Card>

      {recent.length > 1 ? (
        <>
          <SectionHeader title="Weigh-ins" />
          <Card style={styles.list}>
            {recent.map((w, i) => (
              <Pressable
                key={w.date}
                style={[styles.row, i > 0 && styles.divider]}
                onPress={() => setWeigh({ date: w.date, kg: w.kg, existing: true })}
                accessibilityHint="Tap to edit or delete"
              >
                <Text style={styles.body}>{fmtDayLabel(w.date)}</Text>
                <Text style={styles.value}>{kg(w.kg)}</Text>
              </Pressable>
            ))}
          </Card>
          {weighIns.length > 5 ? <PrimaryButton label={showAll ? 'Show fewer' : 'Show all'} tone="ghost" onPress={() => setShowAll(!showAll)} /> : null}
        </>
      ) : null}

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
          <EmptyState message="No sleep logged yet." hint="Add last night's sleep when you check in." actionLabel="Check in" onAction={() => setCheckingIn(true)} />
        )}
      </Card>

      <WeighInSheet entry={weigh} onClose={() => setWeigh(null)} />
      <CheckInSheet visible={checkingIn} onClose={() => setCheckingIn(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  checkNote: { marginTop: space.md },
  onTrack: { color: color.positive },
  offTrack: { color: color.warning },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  hero: { ...font.display, ...font.numeric, fontSize: 44, color: color.text },
  unit: { ...font.heading, color: color.textMuted },
  muted: { ...font.label, color: color.textMuted },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  chart: { marginTop: space.sm, gap: space.md },
  list: { paddingVertical: 0 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: hit.default },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  body: { ...font.body, color: color.text },
  value: { ...font.body, ...font.numeric, color: color.text, fontWeight: '600' },
});
