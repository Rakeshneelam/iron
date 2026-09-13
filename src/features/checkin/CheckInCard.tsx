import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { IconButton } from '@/components/IconButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TrendChart } from '@/components/TrendChart';
import { useLive } from '@/db/live';
import { getCheckIn, getLatestWeight, getWeighIn, listWeighIns } from '@/db/repositories/body';
import { getDayTotal } from '@/db/repositories/water';
import { weeklyRateKg, weightTrend } from '@/engine/metabolic';
import { WeighInSheet, type WeighEntry } from '@/features/body/sheets';
import { daysBetweenISO, todayISO } from '@/lib/date';
import { kg, ml, signed } from '@/lib/format';
import { DEFAULT_WEIGHT_KG, hydrationTarget } from '@/services/hydration';
import { color, font, hit, radius, space } from '@/theme/tokens';

import { sleepLabel } from './CheckInSheet';

/**
 * Today's check-in at a glance: weight, sleep and water, each one tap from being
 * logged. With `trend` the weight trend sits underneath, so someone who skips the
 * check-in still sees which way their weight is heading.
 */
export function CheckInCard({ onCheckIn, trend = false }: { onCheckIn: () => void; trend?: boolean }) {
  const today = todayISO();
  const data = useLive(
    () => ({
      checkIn: getCheckIn(today),
      weighIn: getWeighIn(today),
      weights: trend ? listWeighIns(90) : [],
      water: getDayTotal(today),
      waterTarget: hydrationTarget().ml,
    }),
    ['check_in', 'weigh_in', 'water_log', 'setting', 'session'],
    [today, trend],
  );
  const [weigh, setWeigh] = useState<WeighEntry | null>(null);
  const series = useMemo(() => weightTrend(data.weights), [data.weights]);
  const first = series[0]?.date ?? today;
  const c = data.checkIn;
  const felt = [c && c.soreness !== null ? `soreness ${c.soreness}` : '', c && c.stress !== null ? `stress ${c.stress}` : ''].filter(Boolean);

  return (
    <Card>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text style={styles.title}>{c ? 'Checked in' : 'Daily check-in'}</Text>
          <Text style={styles.hint}>
            {c
              ? felt.length
                ? `Feeling: ${felt.join(', ')} out of 5`
                : "Today's answers tune your targets."
              : "Optional. Weight, sleep and soreness tune today's targets."}
          </Text>
        </View>
        {c ? (
          <IconButton icon="edit" tone="neutral" accessibilityLabel="Edit today's check-in" onPress={onCheckIn} />
        ) : (
          <PrimaryButton label="Check in" tone="neutral" onPress={onCheckIn} />
        )}
      </View>

      <View style={styles.cells}>
        <Cell
          label="Weight"
          value={data.weighIn ? kg(data.weighIn.kg) : 'Log'}
          hint={data.weighIn ? 'today' : 'not yet today'}
          onPress={() => setWeigh({ date: today, kg: data.weighIn?.kg ?? getLatestWeight() ?? DEFAULT_WEIGHT_KG, existing: data.weighIn !== undefined })}
        />
        <Cell label="Sleep" value={c && c.sleepHours !== null ? sleepLabel(c.sleepHours) : '—'} hint="last night" onPress={onCheckIn} />
        <Cell label="Water" value={ml(data.water)} hint={`of ${ml(data.waterTarget)}`} onPress={() => router.push('/water')} />
      </View>

      {trend && series.length >= 2 ? (
        <View style={styles.trend}>
          <TrendChart trend={series.map((t) => ({ x: daysBetweenISO(first, t.date), y: t.trend }))} height={64} readout={false} />
          <Text style={styles.hint}>
            {series.length >= 7 ? `Weight trend ${signed(weeklyRateKg(data.weights), 2)} kg a week` : `Weight trend across ${series.length} weigh-ins`}
          </Text>
        </View>
      ) : null}

      <WeighInSheet entry={weigh} onClose={() => setWeigh(null)} />
    </Card>
  );
}

function Cell({ label, value, hint, onPress }: { label: string; value: string; hint: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}, ${hint}`}
      style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
    >
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.cellHint} numberOfLines={1}>
        {hint}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { ...font.body, color: color.text, fontWeight: '600' },
  hint: { ...font.caption, color: color.textMuted, marginTop: 2 },
  cells: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  cell: { flex: 1, minWidth: 0, minHeight: hit.gym, backgroundColor: color.surfaceHigh, borderRadius: radius.md, padding: space.md },
  pressed: { backgroundColor: color.border },
  value: { ...font.heading, ...font.numeric, color: color.text },
  label: { ...font.caption, color: color.text, marginTop: space.xs },
  cellHint: { ...font.caption, color: color.textFaint },
  trend: { marginTop: space.lg, gap: space.xs },
});
