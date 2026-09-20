import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, Icon, PrimaryButton, Screen, SectionHeader } from '@/components';
import { useLive } from '@/db/live';
import { listMeasurements, type Measurement } from '@/db/repositories/body';
import { useSettings } from '@/db/repositories/settings';
import { MeasureSheet, readingBefore, SiteSheet } from '@/features/body/sheets';
import { SITES } from '@/features/body/sites';
import { addDays, fmtDayLabel } from '@/lib/date';
import { kgNum, signed } from '@/lib/format';
import { color, font, gap, hit, radius, space } from '@/theme/tokens';

/**
 * Measurements, and the facts about you the maths needs. Weight moved to Daily,
 * beside the check-in it is logged with; this screen changes every few weeks.
 */
export default function BodyScreen() {
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
    <Screen title="Body" subtitle="Measurements and your details">
      {measured.length === 0 ? (
        <EmptyState
          message="Measure every 2–4 weeks."
          hint="Waist and arms show changes the scale hides."
          actionLabel="Log measurements"
          onAction={() => setMeasuring(true)}
        />
      ) : (
        <>
          <PrimaryButton label="Log measurements" tone="neutral" icon={<Icon name="ruler" size={16} />} style={styles.log} onPress={() => setMeasuring(true)} />
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

      <SectionHeader title="Your details" hint="Used for calorie and water targets. Nothing here leaves this phone." />
      <Card onPress={() => router.push('/settings/profile')}>
        <Detail label="Name" value={settings.name || '—'} />
        <Detail label="Sex" value={settings.sex === 'female' ? 'Female' : 'Male'} />
        <Detail label="Age" value={String(settings.age)} />
        <Detail label="Height" value={`${settings.heightCm} cm`} />
        <View style={styles.edit}>
          <Icon name="edit" size={16} color={color.textMuted} />
          <Text style={styles.hintInline}>Tap to edit</Text>
        </View>
      </Card>

      <MeasureSheet visible={measuring} latest={latestBySite} onClose={() => setMeasuring(false)} />
      <SiteSheet site={site} rows={site ? (bySite.get(site) ?? []) : []} onClose={() => setSite(null)} />
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  log: { marginBottom: gap.between },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  detail: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, minHeight: hit.default },
  edit: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm },
  unitSmall: { ...font.caption, color: color.textMuted },
  muted: { ...font.label, color: color.textMuted },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  hintInline: { ...font.caption, color: color.textMuted },
  body: { ...font.body, color: color.text },
  value: { ...font.body, ...font.numeric, color: color.text, fontWeight: '600', flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '48.5%', backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, padding: space.md, gap: 2 },
  pressed: { backgroundColor: color.surfaceHigh },
  tileLabel: { ...font.caption, color: color.textMuted },
  tileValue: { ...font.heading, ...font.numeric, color: color.text },
  tileHint: { ...font.caption, ...font.numeric, color: color.textFaint },
});
