import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, EmptyState, Icon, Pill, PrimaryButton, SectionHeader, TrendChart } from '@/components';
import { useLive } from '@/db/live';
import { countWeighIns, listWeighIns } from '@/db/repositories/body';
import { PHASES, useSettings } from '@/db/repositories/settings';
import { phaseCheck, weeklyRateKg, weightTrend } from '@/engine/metabolic';
import { GOALS } from '@/features/settings/goals';
import { addDays, daysBetweenISO, fmtDayLabel, todayISO } from '@/lib/date';
import { kg, kgNum, signed } from '@/lib/format';
import { color, font, hit, space } from '@/theme/tokens';

import { WeighInSheet, type WeighEntry } from './sheets';

const RANGES = [
  { label: '1M', value: 30 },
  { label: '3M', value: 90 },
  { label: '1Y', value: 365 },
  { label: 'All', value: 0 },
];
const RECENT = 5;

/**
 * Body → Weight. The smoothed trend, a range control, the last few weigh-ins, and
 * one primary action: Log weight.
 *
 * This is Daily's weight half, moved rather than copied (UX-01). The goal selector
 * that used to sit under it is a link now — the goal has one editor, in Profile &
 * goals, and a second copy here would be a second way to set the same thing (UX-03).
 */
export function WeightSection() {
  const settings = useSettings();
  const today = todayISO();
  const weighIns = useLive(() => listWeighIns(), ['weigh_in']);
  const total = useLive(() => countWeighIns(), ['weigh_in']);
  const [range, setRange] = useState(90);
  const [weigh, setWeigh] = useState<WeighEntry | null>(null);

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
  const recent = [...weighIns].reverse().slice(0, RECENT);
  const goal = GOALS.find((g) => g.value === settings.phase && PHASES.includes(g.value))?.label ?? '—';

  return (
    <>
      <PrimaryButton
        label={todays ? "Edit today's weight" : 'Log weight'}
        size="gym"
        icon={<Icon name="plus" size={18} color={color.onAccent} />}
        style={styles.primary}
        onPress={() => setWeigh({ date: today })}
      />

      {weighIns.length === 0 ? (
        <EmptyState message="No weigh-ins yet." hint="Same time each morning, before food. The trend is the signal; one morning is noise." />
      ) : (
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
              {/* The chart is not the only way to read this (UX-11). */}
              <Text style={styles.hint}>
                {`Latest ${kg(shown[shown.length - 1]?.raw ?? 0)} on ${fmtDayLabel(shown[shown.length - 1]?.date ?? today)}`}
                {shown.length > 1 ? `, from ${kg(shown[0]?.raw ?? 0)} on ${fmtDayLabel(first)}.` : '.'}
              </Text>
            </View>
          ) : (
            <Text style={styles.hint}>Log a few mornings and your trend line appears here.</Text>
          )}
        </Card>
      )}

      <SectionHeader
        title="Goal"
        hint="Sets your calorie and water targets."
        right={<PrimaryButton label="Edit" tone="ghost" accessibilityLabel="Edit your body-weight goal" onPress={() => router.push('/settings/profile')} />}
      />
      <Card>
        <View style={styles.rowBetween}>
          <Text style={styles.body}>Body-weight goal</Text>
          <Text style={styles.value}>{goal}</Text>
        </View>
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

      {recent.length > 0 ? (
        <>
          <SectionHeader title="Recent weigh-ins" />
          <Card style={styles.list}>
            {recent.map((w, i) => (
              <Pressable
                key={w.date}
                style={[styles.row, i > 0 && styles.divider]}
                onPress={() => setWeigh({ date: w.date })}
                accessibilityRole="button"
                accessibilityLabel={`${fmtDayLabel(w.date)}: ${kg(w.kg)}. Tap to edit or delete.`}
              >
                <Text style={styles.body}>{fmtDayLabel(w.date)}</Text>
                <Text style={styles.value}>{kg(w.kg)}</Text>
              </Pressable>
            ))}
          </Card>
          {/*
            "Show all" used to expand to sixty rows and stop, with no way to reach the
            sixty-first. All of them means all of them, on a list that can carry it.
          */}
          {total > RECENT ? (
            <PrimaryButton label={`View all ${total} weigh-ins`} tone="ghost" onPress={() => router.push('/weight/history')} />
          ) : null}
        </>
      ) : null}

      <WeighInSheet entry={weigh} onClose={() => setWeigh(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  primary: { marginBottom: space.lg },
  checkNote: { marginTop: space.md },
  onTrack: { color: color.positive },
  offTrack: { color: color.warning },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  hero: { ...font.display, ...font.numeric, color: color.text },
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
