import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, Icon, PrimaryButton } from '@/components';
import { useLive } from '@/db/live';
import { listMeasurements, type Measurement } from '@/db/repositories/body';
import { useSettings } from '@/db/repositories/settings';
import { addDays, fmtDayLabel } from '@/lib/date';
import { kgNum, signed } from '@/lib/format';
import { color, font, radius, space } from '@/theme/tokens';

import { MeasureSheet, readingBefore, SiteSheet } from './sheets';
import { SITES } from './sites';

/**
 * Body → Measurements. Unchanged in substance — the tiles, the waist-to-height
 * line and the per-site sheet are what was already on the Body tab; they are a
 * section of it now rather than the whole of it (UX-01).
 */
export function MeasurementsSection() {
  const settings = useSettings();
  const measurements = useLive(() => listMeasurements(), ['measurement']);
  const [measuring, setMeasuring] = useState(false);
  const [site, setSite] = useState<string | null>(null);

  const bySite = useMemo(() => {
    const m = new Map<string, Measurement[]>();
    for (const r of measurements) m.set(r.site, [...(m.get(r.site) ?? []), r]);
    return m;
  }, [measurements]);
  const latestBySite = useMemo(() => new Map([...bySite].map(([k, rows]) => [k, rows[0]?.cm ?? 0])), [bySite]);
  const measured = SITES.filter((s) => bySite.has(s.key));
  const waist = bySite.get('waist')?.[0];
  const whtr = waist && settings.heightCm > 0 ? waist.cm / settings.heightCm : null;

  return (
    <>
      <PrimaryButton
        label="Log measurements"
        size="gym"
        icon={<Icon name="ruler" size={18} color={color.onAccent} />}
        style={styles.primary}
        onPress={() => setMeasuring(true)}
      />

      {measured.length === 0 ? (
        <EmptyState message="Measure every 2–4 weeks." hint="Waist and arms show changes the scale hides." />
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
                <Pressable
                  key={s.key}
                  style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                  onPress={() => setSite(s.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${s.label}: ${kgNum(latest.cm)} ${s.unit} on ${fmtDayLabel(latest.date)}`}
                >
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

      <MeasureSheet visible={measuring} latest={latestBySite} onClose={() => setMeasuring(false)} />
      <SiteSheet site={site} rows={site ? (bySite.get(site) ?? []) : []} onClose={() => setSite(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  primary: { marginBottom: space.lg },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  unitSmall: { ...font.caption, color: color.textMuted },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  body: { ...font.body, color: color.text },
  value: { ...font.body, ...font.numeric, color: color.text, fontWeight: '600', flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '48.5%', backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, padding: space.md, gap: 2 },
  pressed: { backgroundColor: color.surfaceHigh },
  tileLabel: { ...font.caption, color: color.textMuted },
  tileValue: { ...font.heading, ...font.numeric, color: color.text },
  // textFaint is decoration only now; a real comparison is readable text (UX-11).
  tileHint: { ...font.caption, ...font.numeric, color: color.textMuted },
});
