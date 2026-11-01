import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Card, ChipRow, EmptyState, EntryRow, Icon, Press, PrimaryButton, Screen, SectionHeader, TrendChart, useReducedMotion, type ScreenProps } from '@/components';
import { useLive } from '@/db/live';
import { countWeighIns, listWeighIns } from '@/db/repositories/body';
import { useSettings } from '@/db/repositories/settings';
import { phaseCheck, weeklyRateKg, weightTrend } from '@/engine/metabolic';
import { addDays, daysBetweenISO, fmtDayLabel, todayISO } from '@/lib/date';
import { kg, kgNum, signed } from '@/lib/format';
import { color, font, hit, radius, space } from '@/theme/tokens';

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
}

/**
 * Body → Weight. The smoothed trend leads; this morning's number is one quiet row
 * under it, because a single reading swings a kilo on water alone (AGENTS §6).
 * One primary action, in the dock: Log weight. The goal lives in Settings → Body.
 */
export function WeightSection({ frame }: BodySectionProps) {
  const settings = useSettings();
  const today = todayISO();
  const weighIns = useLive(() => listWeighIns(), ['weigh_in']);
  const total = useLive(() => countWeighIns(), ['weigh_in']);
  const [range, setRange] = useState(90);
  const [weigh, setWeigh] = useState<WeighEntry | null>(null);
  const reduced = useReducedMotion();

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

  return (
    <Screen
      {...frame}
      tab
      dock={
        <PrimaryButton
          label={todays ? "Edit today's weight" : 'Log weight'}
          size="gym"
          icon={<Icon name="plus" size={20} color={color.onAccent} />}
          onPress={() => setWeigh({ date: today })}
        />
      }
    >
      {weighIns.length === 0 ? (
        <EmptyState message="No weigh-ins yet." hint="Same time each morning, before food. The trend is the signal; one morning is noise." />
      ) : (
        <>
          {/*
            The trend leads, on a lavender card, because it is the number that means
            something. Labelled as a trend — it is smoothed, not a reading — and this
            morning's reading sits underneath, quieter (AGENTS §6).
          */}
          <Card tone="lav" style={styles.trendCard}>
            <Text style={styles.eyebrow}>Trend weight</Text>
            <Text style={styles.hero} numberOfLines={1}>
              {lastTrend === null ? '—' : kgNum(Math.round(lastTrend * 10) / 10)}
              <Text style={styles.unit}> kg</Text>
            </Text>
            {change !== null ? (
              <View style={styles.changeChip}>
                <Icon name={change < 0 ? 'arrowDown' : 'arrowUp'} size={13} color={color.lav} strokeWidth={2.6} />
                <Text style={styles.changeText}>
                  {`${signed(change)} kg in ${weeks} ${weeks === 1 ? 'week' : 'weeks'}${trend.length >= 7 ? `, ${signed(rate, 2)} a week` : ''}`}
                </Text>
              </View>
            ) : null}
            {trend.length >= 2 ? (
              <View style={styles.chart}>
                {/* A new range redraws the line; a 150ms fade says it is the same record at a new scale. */}
                <Animated.View key={range} entering={reduced ? undefined : FadeIn.duration(150)}>
                  <TrendChart
                    trend={trendPts}
                    raw={rawPts}
                    height={130}
                    readout={false}
                    ink={color.onTile}
                    format={(y) => `${kgNum(Math.round(y * 10) / 10)} kg`}
                    formatX={(x) => fmtDayLabel(addDays(first, x))}
                  />
                </Animated.View>
              </View>
            ) : (
              <Text style={styles.cardHint}>A trend needs a few mornings. Each weigh-in adds a point; the line appears with the second.</Text>
            )}
          </Card>
          {trend.length >= 2 ? (
            <View style={styles.ranges}>
              <ChipRow options={RANGES} value={range} onChange={setRange} />
            </View>
          ) : null}
          {check ? <Text style={[styles.check, check.onTrack ? styles.onTrack : styles.offTrack]}>{check.message}</Text> : null}
        </>
      )}

      {/* This morning's number, deliberately quieter than the trend above it. */}
      <View style={styles.morning}>
        <View style={styles.flex1}>
          <Text style={styles.morningLabel}>This morning</Text>
          <Text style={styles.morningValue}>{todays ? kg(todays.kg) : 'Not logged'}</Text>
        </View>
        <Press
          onPress={() => setWeigh({ date: today })}
          accessibilityRole="button"
          accessibilityLabel={todays ? "Edit this morning's weight" : "Log this morning's weight"}
          hitSlop={6}
          style={styles.morningBtn}
        >
          <Icon name={todays ? 'edit' : 'plus'} size={18} color={color.onTile} strokeWidth={2.4} />
        </Press>
      </View>

      {recent.length > 0 ? (
        <>
          <SectionHeader
            title="Recent"
            action={
              // "Show all" used to expand to sixty rows and stop. All of them means
              // all of them, on a list that can carry it.
              total > RECENT ? { label: `All ${total}`, onPress: () => router.push('/weight/history'), accessibilityLabel: `View all ${total} weigh-ins` } : undefined
            }
          />
          {recent.map((w) => (
            <EntryRow key={w.date} label={fmtDayLabel(w.date)} value={kg(w.kg)} onPress={() => setWeigh({ date: w.date })} accessibilityLabel={`${fmtDayLabel(w.date)}: ${kg(w.kg)}. Tap to edit or delete.`} />
          ))}
        </>
      ) : null}

      <WeighInSheet entry={weigh} onClose={() => setWeigh(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  trendCard: { marginTop: space.sm, marginBottom: 0, borderRadius: radius.xl, padding: space.xl - 4 },
  eyebrow: { ...font.eyebrow, color: color.onTileMuted },
  hero: { ...font.display, fontSize: 72, lineHeight: 76, color: color.onTile, paddingRight: space.xs },
  unit: { ...font.measure, fontSize: 26, color: color.onTile, letterSpacing: 0 },
  changeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', height: 30, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.onTile, marginTop: space.xs },
  changeText: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '800', color: color.lav, fontVariant: ['tabular-nums'] },
  chart: { marginTop: space.md, marginHorizontal: -space.sm },
  cardHint: { ...font.caption, color: color.onTileMuted, marginTop: space.md },
  ranges: { marginTop: space.md },
  check: { ...font.caption, marginTop: space.md },
  onTrack: { color: color.positive },
  offTrack: { color: color.warning },
  morning: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hit.gym + 12, marginTop: space.lg, paddingLeft: space.lg, paddingRight: space.md, borderRadius: radius.lg, backgroundColor: color.surface },
  morningLabel: { ...font.caption, fontSize: 12, fontWeight: '700', color: color.textFaint },
  morningValue: { ...font.label, fontSize: 17, lineHeight: 22, fontWeight: '800', color: color.text, fontVariant: ['tabular-nums'] },
  morningBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.lav, alignItems: 'center', justifyContent: 'center' },
});
