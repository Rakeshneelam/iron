import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Icon, ListCard, PrimaryButton, Screen, Stepper } from '@/components';
import { useLive } from '@/db/live';
import { addMeasurement, listMeasurements, updateMeasurement, type Measurement } from '@/db/repositories/body';
import { useSettings } from '@/db/repositories/settings';
import { addDays, fmtDayLabel, todayISO } from '@/lib/date';
import { kgNum, signed } from '@/lib/format';
import { color, font, hit, space } from '@/theme/tokens';

import { MeasureSheet, readingBefore, SiteSheet } from './sheets';
import { SITES } from './sites';
import type { BodySectionProps } from './WeightSection';

/** Always on the list, measured or not: the sites that show what the scale hides. */
const CORE = ['waist', 'hips', 'chest'];

/**
 * Body → Measurements. Every site you track is a row with its own − value +, and
 * a tap is today's reading, saved as you go: one row per site per day, so tapping
 * five times is one reading, not five. The name opens that site's history, where
 * any reading can be fixed or deleted with Undo. Log measurements in the dock is
 * the full set of sites, for the first time or a new one.
 */
export function MeasurementsSection({ frame, tail }: BodySectionProps) {
  const settings = useSettings();
  const today = todayISO();
  const measurements = useLive(() => listMeasurements(), ['measurement']);
  const [measuring, setMeasuring] = useState(false);
  const [site, setSite] = useState<string | null>(null);

  const bySite = useMemo(() => {
    const m = new Map<string, Measurement[]>();
    for (const r of measurements) m.set(r.site, [...(m.get(r.site) ?? []), r]);
    return m;
  }, [measurements]);
  const latestBySite = useMemo(() => new Map([...bySite].map(([k, rows]) => [k, rows[0]?.cm ?? 0])), [bySite]);
  const rows = SITES.filter((s) => bySite.has(s.key) || (!s.legacy && CORE.includes(s.key)));
  const waist = bySite.get('waist')?.[0];
  const whtr = waist && settings.heightCm > 0 ? waist.cm / settings.heightCm : null;
  const lastDate = measurements[0]?.date;

  /**
   * Today's reading for a site: the one row for today, created on the first tap.
   * Read from the database, not this render: press-and-hold writes faster than the
   * list refreshes, and a stale lookup would add a second row for today.
   */
  const log = (key: string, cm: number) => {
    const todays = listMeasurements(key).find((r) => r.date === today);
    if (todays) updateMeasurement(todays.id, { cm });
    else addMeasurement(today, key, cm);
  };

  return (
    <Screen
      {...frame}
      subtitle={lastDate ? `Measured ${fmtDayLabel(lastDate)}` : frame.subtitle}
      tab
      dock={<PrimaryButton label="Log measurements" size="gym" icon={<Icon name="ruler" size={18} color={color.onAccent} />} onPress={() => setMeasuring(true)} />}
    >
      <Text style={styles.lead}>Tap − or + to log today’s number. It saves as you go.</Text>
      <ListCard>
        {rows.map((s, i) => {
          const history = bySite.get(s.key) ?? [];
          const latest = history[0];
          const month = latest ? readingBefore(history, addDays(latest.date, -28)) : undefined;
          const prev = latest && month && month.id !== latest.id ? month : history[1];
          const delta = latest && prev ? latest.cm - prev.cm : null;
          const sub = !latest
            ? 'not measured yet'
            : delta === null
              ? fmtDayLabel(latest.date)
              : Math.abs(delta) < 0.05
                ? 'no change'
                : `${signed(delta)} ${s.unit} since ${fmtDayLabel(prev?.date ?? '')}`;
          return (
            <View key={s.key} style={[styles.row, i > 0 && styles.divider]}>
              <Pressable
                style={styles.name}
                onPress={() => (latest ? setSite(s.key) : undefined)}
                disabled={!latest}
                accessibilityRole={latest ? 'button' : undefined}
                accessibilityLabel={latest ? `${s.label}: ${kgNum(latest.cm)} ${s.unit}, ${sub}. Opens its history.` : `${s.label}, not measured yet`}
              >
                <Text style={styles.title}>{s.label}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {sub}
                </Text>
              </Pressable>
              <View style={styles.field}>
                <Stepper accessibilityLabel={s.label} suffix={s.unit} value={latest?.cm ?? s.fallback} step={0.5} min={1} max={250} onChange={(v) => log(s.key, v)} />
              </View>
            </View>
          );
        })}
      </ListCard>
      <Text style={styles.footnote}>Tap a name for its history. Other sites are in Log measurements.</Text>

      {whtr !== null ? (
        <Card style={styles.gapTop}>
          <View style={styles.rowBetween}>
            <Text style={styles.body}>Waist-to-height</Text>
            <Text style={[styles.value, { color: whtr < 0.5 ? color.positive : color.text }]}>{whtr.toFixed(2)}</Text>
          </View>
          <Text style={styles.hint}>Below 0.50 is the healthy range for most adults.</Text>
        </Card>
      ) : null}

      <View style={styles.gapTop}>{tail}</View>
      <MeasureSheet visible={measuring} latest={latestBySite} onClose={() => setMeasuring(false)} />
      <SiteSheet site={site} rows={site ? (bySite.get(site) ?? []) : []} onClose={() => setSite(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { ...font.caption, color: color.textMuted, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  name: { flex: 1, minWidth: 0, minHeight: hit.default, justifyContent: 'center' },
  title: { ...font.label, fontWeight: '600', color: color.text },
  sub: { ...font.caption, fontSize: 12, ...font.numeric, color: color.textFaint },
  field: { width: 176 },
  footnote: { ...font.caption, fontSize: 12, color: color.textFaint },
  gapTop: { marginTop: space.lg },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  body: { ...font.body, color: color.text },
  value: { ...font.body, ...font.numeric, color: color.text, fontWeight: '600', flexShrink: 1 },
});
