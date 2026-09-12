import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, EmptyState, Icon, IconButton, Pill, PrimaryButton, Screen, SectionHeader, TrendChart } from '@/components';
import { useLive } from '@/db/live';
import { getLatestWeight, listMeasurements, listWeighIns, type Measurement } from '@/db/repositories/body';
import { useSettings } from '@/db/repositories/settings';
import { phaseCheck, weeklyRateKg, weightTrend } from '@/engine/metabolic';
import { MeasureSheet, readingBefore, SiteSheet, WeighInSheet, type WeighEntry } from '@/features/body/sheets';
import { SITES } from '@/features/body/sites';
import { addDays, daysBetweenISO, fmtDayLabel, todayISO } from '@/lib/date';
import { kg, kgNum, signed } from '@/lib/format';
import { DEFAULT_WEIGHT_KG } from '@/services/hydration';
import { color, font, hit, radius, space } from '@/theme/tokens';

const RANGES = [
  { label: '1M', value: 30 },
  { label: '3M', value: 90 },
  { label: '1Y', value: 365 },
  { label: 'All', value: 0 },
];

/** The trend is the signal; a single morning is noise. Never red for weight going up. */
export default function BodyScreen() {
  const settings = useSettings();
  const today = todayISO();
  const weighIns = useLive(() => listWeighIns(), ['weigh_in']);
  const measurements = useLive(() => listMeasurements(), ['measurement']);

  const [range, setRange] = useState(90);
  const [weigh, setWeigh] = useState<WeighEntry | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [site, setSite] = useState<string | null>(null);
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

  const bySite = useMemo(() => {
    const m = new Map<string, Measurement[]>();
    for (const r of measurements) m.set(r.site, [...(m.get(r.site) ?? []), r]);
    return m;
  }, [measurements]);
  const latestBySite = useMemo(() => new Map([...bySite].map(([k, rows]) => [k, rows[0]?.cm ?? 0])), [bySite]);
  const measured = SITES.filter((s) => bySite.has(s.key));
  const waist = bySite.get('waist')?.[0];
  const whtr = waist && settings.heightCm > 0 ? waist.cm / settings.heightCm : null;

  const recent = [...weighIns].reverse().slice(0, showAll ? 60 : 5);
  const hasMeasurements = measurements.length > 0;
  /** One point is not a trend. Below this the card shows a weight, not a trend. */
  const hasTrend = trend.length >= 2;

  return (
    <Screen title="Body">
      <Card>
        <Text style={styles.eyebrow}>{hasTrend ? 'WEIGHT TREND' : 'WEIGHT'}</Text>
        <View style={styles.rowBetween}>
          <Text style={styles.hero}>
            {lastTrend === null ? '—' : kgNum(Math.round(lastTrend * 10) / 10)}
            <Text style={styles.unit}> kg</Text>
          </Text>
          {trend.length >= 7 ? <Pill label={`${signed(rate, 2)} kg/wk · ${signed(pctWk, 2)}%`} /> : null}
        </View>
        {/* Edit sits with the number it edits, and says "edit" rather than "plus" —
            the header button that used to do this looked like adding a new reading.
            The value itself is only repeated once there is a trend to distinguish
            it from; with one reading the hero already IS today's weight. */}
        <View style={styles.todayRow}>
          <Text style={styles.muted}>
            {!todays ? 'Not weighed today' : hasTrend ? `Today ${kg(todays.kg)}` : 'Weighed today'}
          </Text>
          {todays ? (
            <IconButton
              icon="edit"
              tone="neutral"
              accessibilityLabel={`Edit today's weight, ${kg(todays.kg)}`}
              onPress={() => setWeigh({ date: today, kg: todays.kg, existing: true })}
            />
          ) : null}
        </View>
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
          </View>
        ) : (
          <Text style={styles.hint}>Log a few mornings and your trend line appears here.</Text>
        )}
      </Card>

      {!todays ? (
        <PrimaryButton
          label="Log today's weight"
          size="gym"
          icon={<Icon name="plus" size={18} color={color.onAccent} />}
          onPress={() => setWeigh({ date: today, kg: getLatestWeight() ?? DEFAULT_WEIGHT_KG, existing: false })}
        />
      ) : null}

      {check ? (
        <Card tone={check.onTrack ? 'positive' : 'warning'} style={styles.gapTop}>
          <Text style={styles.body}>{check.message}</Text>
        </Card>
      ) : null}

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

      <SectionHeader
        title="Measurements"
        right={hasMeasurements ? <PrimaryButton label="Log" tone="neutral" icon={<Icon name="ruler" size={16} />} onPress={() => setMeasuring(true)} /> : undefined}
      />
      {measured.length === 0 ? (
        <EmptyState message="Measure every 2–4 weeks — waist and arms show changes the scale hides." actionLabel="Log measurements" onAction={() => setMeasuring(true)} />
      ) : (
        <>
          {whtr !== null ? (
            <Card>
              <View style={styles.rowBetween}>
                <Text style={styles.body}>Waist-to-height</Text>
                <Text style={[styles.value, { color: whtr < 0.5 ? color.positive : color.text }]}>{whtr.toFixed(2)}</Text>
              </View>
              <Text style={styles.hint}>Below 0.50 is the healthy range for most adults.</Text>
            </Card>
          ) : null}
          <View style={styles.grid}>
            {measured.map((s) => {
              const rows = bySite.get(s.key) ?? [];
              const latest = rows[0];
              if (!latest) return null;
              const month = readingBefore(rows, addDays(latest.date, -28));
              const prev = month && month.id !== latest.id ? month : rows[1];
              return (
                <Pressable key={s.key} style={({ pressed }) => [styles.tile, pressed && styles.pressed]} onPress={() => setSite(s.key)} accessibilityRole="button">
                  <Text style={styles.tileLabel}>{s.label}</Text>
                  <Text style={styles.tileValue}>
                    {kgNum(latest.cm)}
                    <Text style={styles.unitSmall}> {s.unit}</Text>
                  </Text>
                  <Text style={styles.tileHint}>{prev ? `${signed(latest.cm - prev.cm)} since ${fmtDayLabel(prev.date)}` : fmtDayLabel(latest.date)}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <WeighInSheet entry={weigh} onClose={() => setWeigh(null)} />
      <MeasureSheet visible={measuring} latest={latestBySite} onClose={() => setMeasuring(false)} />
      <SiteSheet site={site} rows={site ? (bySite.get(site) ?? []) : []} onClose={() => setSite(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  todayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: hit.default },
  eyebrow: { ...font.caption, color: color.textMuted, letterSpacing: 1, fontWeight: '600' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  hero: { ...font.display, ...font.numeric, fontSize: 44, color: color.text },
  unit: { ...font.heading, color: color.textMuted },
  unitSmall: { ...font.caption, color: color.textMuted },
  muted: { ...font.label, color: color.textMuted },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  chart: { marginTop: space.md, gap: space.md },
  gapTop: { marginTop: space.md },
  list: { paddingVertical: 0 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: hit.default },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  body: { ...font.body, color: color.text },
  value: { ...font.body, ...font.numeric, color: color.text, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '48.5%', backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, padding: space.md, gap: 2 },
  pressed: { backgroundColor: color.surfaceHigh },
  tileLabel: { ...font.caption, color: color.textMuted },
  tileValue: { ...font.heading, ...font.numeric, color: color.text },
  tileHint: { ...font.caption, ...font.numeric, color: color.textFaint },
});
