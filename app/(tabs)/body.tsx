import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, EmptyState, PrimaryButton, Screen, SectionHeader, StatTile, Stepper, TrendChart } from '@/components';
import { useLive } from '@/db/live';
import { addMeasurement, getLatestWeight, listMeasurements, listWeighIns, MEASUREMENT_SITES, upsertWeighIn } from '@/db/repositories/body';
import { PHASES, setSetting, useSettings } from '@/db/repositories/settings';
import { phaseCheck, weeklyRateKg, weightTrend } from '@/engine/metabolic';
import { addDays, daysBetweenISO, fmtDayLabel, todayISO } from '@/lib/date';
import { kgNum, signed } from '@/lib/format';
import { DEFAULT_WEIGHT_KG } from '@/services/hydration';
import { color, font, space } from '@/theme/tokens';

const cap = (s: string) => (s ? s[0]?.toUpperCase() + s.slice(1) : s);

/** The trend is the signal; a single morning is noise. Never red for weight going up. */
export default function BodyScreen() {
  const settings = useSettings();
  const today = todayISO();
  const weighIns = useLive(() => listWeighIns(), ['weigh_in']);
  const todays = weighIns.find((w) => w.date === today);

  const [value, setValue] = useState(() => todays?.kg ?? getLatestWeight() ?? DEFAULT_WEIGHT_KG);
  useEffect(() => {
    if (todays) setValue(todays.kg);
  }, [todays?.kg]); // eslint-disable-line react-hooks/exhaustive-deps

  const trend = useMemo(() => weightTrend(weighIns), [weighIns]);
  const first = weighIns[0]?.date ?? today;
  const trendPts = trend.map((t) => ({ x: daysBetweenISO(first, t.date), y: t.trend }));
  const rawPts = trend.map((t) => ({ x: daysBetweenISO(first, t.date), y: t.raw }));
  const lastTrend = trend[trend.length - 1]?.trend ?? null;
  const rate = weeklyRateKg(weighIns);
  const pctWk = lastTrend ? (rate / lastTrend) * 100 : 0;
  const check = lastTrend !== null && trend.length >= 7 ? phaseCheck(settings.phase, lastTrend, rate) : null;

  const [site, setSite] = useState<string>(MEASUREMENT_SITES[0]);
  const measurements = useLive(() => listMeasurements(), ['measurement']);
  const lastForSite = measurements.find((m) => m.site === site);
  const [cm, setCm] = useState(lastForSite?.cm ?? 80);
  useEffect(() => {
    if (lastForSite) setCm(lastForSite.cm);
  }, [site]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen title="Body" subtitle="Weigh in before breakfast. The trend line is what counts.">
      <Card>
        <Stepper label={todays ? "This morning's weight (logged)" : "This morning's weight"} suffix="kg" size="gym" value={value} step={0.1} min={30} max={250} onChange={setValue} />
        <PrimaryButton
          label={todays ? 'Update' : 'Log weight'}
          size="gym"
          style={styles.gap}
          onPress={() => {
            upsertWeighIn(today, value);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }}
        />
      </Card>

      <View style={styles.tiles}>
        <StatTile label="Trend" value={lastTrend === null ? '—' : `${kgNum(lastTrend)} kg`} />
        <StatTile label="Weekly rate" value={trend.length >= 7 ? `${signed(pctWk, 2)}%` : '—'} hint={trend.length >= 7 ? `${signed(rate, 2)} kg/wk` : 'needs a week'} />
      </View>

      <SectionHeader title="Trend" />
      {trend.length >= 2 ? (
        <TrendChart trend={trendPts} raw={rawPts} format={(y) => `${kgNum(Math.round(y * 10) / 10)} kg`} formatX={(x) => fmtDayLabel(addDays(first, x))} />
      ) : (
        <EmptyState message="Log a few mornings and the trend line appears here." />
      )}

      <SectionHeader title="Phase" />
      <ChipRow options={PHASES.map((p) => ({ label: cap(p), value: p }))} value={settings.phase} onChange={(p) => setSetting('phase', p)} />
      <Card tone={check ? (check.onTrack ? 'positive' : 'warning') : 'default'} style={styles.gap}>
        <Text style={styles.body}>
          {check ? check.message : `Weekly check-in starts after 7 weigh-ins (${trend.length} so far).`}
        </Text>
        {check && check.suggestedKcalDelta !== 0 ? (
          <Text style={styles.muted}>Suggestion only — adjust your intake if you agree.</Text>
        ) : null}
      </Card>

      <SectionHeader title="Measurements (optional)" />
      <ChipRow options={MEASUREMENT_SITES.map((s) => ({ label: cap(s), value: s }))} value={site} onChange={setSite} />
      <View style={styles.row}>
        <Stepper label={cap(site)} suffix="cm" value={cm} step={0.5} min={10} max={250} onChange={setCm} />
        <PrimaryButton label="Add" tone="neutral" onPress={() => addMeasurement(today, site, cm)} />
      </View>
      {MEASUREMENT_SITES.map((s) => {
        const rows = measurements.filter((m) => m.site === s);
        const [latest, prev] = rows;
        if (!latest) return null;
        return (
          <Text key={s} style={styles.muted}>
            {cap(s)}: {kgNum(latest.cm)} cm · {fmtDayLabel(latest.date)}
            {prev ? ` (${signed(latest.cm - prev.cm)} since ${fmtDayLabel(prev.date)})` : ''}
          </Text>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: space.sm },
  gap: { marginTop: space.md },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginVertical: space.md },
  body: { ...font.body, color: color.text },
  muted: { ...font.caption, color: color.textMuted, marginTop: space.xs },
});
