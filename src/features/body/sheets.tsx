import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DateStepper } from '@/components/DateStepper';
import { IconButton } from '@/components/IconButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { Stepper } from '@/components/Stepper';
import { toast } from '@/components/Toast';
import { TrendChart } from '@/components/TrendChart';
import {
  addMeasurement,
  deleteMeasurement,
  deleteWeighIn,
  moveWeighIn,
  restoreMeasurement,
  updateMeasurement,
  upsertWeighIn,
  type Measurement,
} from '@/db/repositories/body';
import { addDays, daysBetweenISO, fmtDayLabel, todayISO } from '@/lib/date';
import { kgNum, signed } from '@/lib/format';
import { color, font, hit, space } from '@/theme/tokens';

import { GROUP_LABEL, siteDef, SITES, type SiteGroup } from './sites';

export interface WeighEntry {
  date: string;
  kg: number;
  existing: boolean;
}

/** Log or fix a weigh-in, including its date. Delete is undoable. */
export function WeighInSheet({ entry, onClose }: { entry: WeighEntry | null; onClose: () => void }) {
  const [date, setDate] = useState(todayISO());
  const [value, setValue] = useState(70);
  useEffect(() => {
    if (!entry) return;
    setDate(entry.date);
    setValue(entry.kg);
  }, [entry]);

  return (
    <Sheet visible={entry !== null} onClose={onClose} title={entry?.existing ? 'Edit weigh-in' : 'Log weight'}>
      {entry ? (
        <View style={styles.stack}>
          <DateStepper value={date} onChange={setDate} />
          <Stepper suffix="kg" size="gym" value={value} step={0.1} min={30} max={250} onChange={setValue} />
          <Text style={styles.hint}>Same time each morning, before food. One reading per day — saving replaces that day's.</Text>
          <PrimaryButton
            label="Save"
            size="gym"
            onPress={() => {
              if (entry.existing) moveWeighIn(entry.date, date, value);
              else upsertWeighIn(date, value);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onClose();
            }}
          />
          {entry.existing ? (
            <PrimaryButton
              label="Delete"
              tone="ghost"
              onPress={() => {
                deleteWeighIn(entry.date);
                toast('Weigh-in deleted', { label: 'Undo', onPress: () => upsertWeighIn(entry.date, entry.kg) });
                onClose();
              }}
            />
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

const GROUPS: SiteGroup[] = ['core', 'upper', 'arms', 'legs'];

/**
 * A measurement check-in: every site prefilled with its last value; only the ones
 * you actually change are saved, so an untouched stepper never writes a fake reading.
 */
export function MeasureSheet({ visible, latest, onClose }: { visible: boolean; latest: Map<string, number>; onClose: () => void }) {
  const [date, setDate] = useState(todayISO());
  const [values, setValues] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!visible) return;
    setDate(todayISO());
    setValues({});
  }, [visible]);

  const touched = Object.keys(values).length;
  const save = () => {
    const rows = Object.entries(values).map(([site, v]) => addMeasurement(date, site, v));
    toast(`Saved ${rows.length} ${rows.length === 1 ? 'measurement' : 'measurements'}`, {
      label: 'Undo',
      onPress: () => rows.forEach((r) => deleteMeasurement(r.id)),
    });
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Log measurements">
      <DateStepper value={date} onChange={setDate} />
      <Text style={[styles.hint, styles.center]}>Change only what you measured. Relaxed, same spot each time.</Text>
      {GROUPS.map((g) => {
        const sites = SITES.filter((s) => s.group === g && (!s.legacy || latest.has(s.key)));
        return (
          <View key={g}>
            <Text style={styles.group}>{GROUP_LABEL[g]}</Text>
            <View style={styles.grid}>
              {sites.map((s) => (
                <View key={s.key} style={styles.cell}>
                  <Stepper
                    label={`${s.label}${values[s.key] !== undefined ? ' ✓' : ''}`}
                    suffix={s.unit}
                    value={values[s.key] ?? latest.get(s.key) ?? s.fallback}
                    step={s.unit === '%' ? 0.5 : 0.5}
                    min={1}
                    max={250}
                    onChange={(v) => setValues((cur) => ({ ...cur, [s.key]: v }))}
                  />
                </View>
              ))}
            </View>
          </View>
        );
      })}
      <PrimaryButton label={touched ? `Save ${touched}` : 'Nothing changed yet'} size="gym" disabled={!touched} style={styles.save} onPress={save} />
    </Sheet>
  );
}

/** Newest reading on or before `iso`. `rows` must be newest-first. */
export function readingBefore(rows: readonly Measurement[], iso: string): Measurement | undefined {
  return rows.find((r) => r.date <= iso);
}

/** One site: chart, comparisons, history you can fix. `rows` newest-first. */
export function SiteSheet({ site, rows, onClose }: { site: string | null; rows: readonly Measurement[]; onClose: () => void }) {
  const def = site ? siteDef(site) : null;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(0);
  const latest = rows[0];
  const asc = [...rows].reverse();
  const first = asc[0]?.date ?? todayISO();
  const pts = asc.map((r) => ({ x: daysBetweenISO(first, r.date), y: r.cm }));
  const unit = def?.unit ?? 'cm';
  const fmt = (v: number) => `${kgNum(Math.round(v * 10) / 10)} ${unit}`;

  const compare = latest
    ? ([
        ['Previous', rows[1]],
        ['4 weeks ago', readingBefore(rows, addDays(latest.date, -28))],
        ['12 weeks ago', readingBefore(rows, addDays(latest.date, -84))],
      ] as const)
    : [];

  return (
    <Sheet visible={site !== null} onClose={onClose} title={def?.label}>
      {latest ? (
        <View style={styles.stack}>
          {pts.length >= 2 ? (
            <TrendChart trend={pts} format={fmt} formatX={(x) => fmtDayLabel(addDays(first, x))} height={140} />
          ) : (
            <Text style={styles.big}>{fmt(latest.cm)}</Text>
          )}
          <View>
            {compare.map(([label, r]) => (
              <View key={label} style={styles.row}>
                <Text style={styles.body}>{label}</Text>
                <Text style={styles.value}>{r && r.id !== latest.id ? `${signed(latest.cm - r.cm)} ${unit}` : '—'}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.group}>History</Text>
          {rows.map((r) =>
            editing === r.id ? (
              <View key={r.id} style={styles.editRow}>
                <Stepper suffix={unit} value={draft} step={0.5} min={1} max={250} onChange={setDraft} />
                <PrimaryButton
                  label="Save"
                  onPress={() => {
                    updateMeasurement(r.id, { cm: draft });
                    setEditing(null);
                  }}
                />
              </View>
            ) : (
              <Pressable
                key={r.id}
                style={styles.row}
                onPress={() => {
                  setDraft(r.cm);
                  setEditing(r.id);
                }}
                accessibilityHint="Tap to edit"
              >
                <Text style={styles.body}>{fmtDayLabel(r.date)}</Text>
                <View style={styles.rowEnd}>
                  <Text style={styles.value}>{fmt(r.cm)}</Text>
                  <IconButton
                    icon="trash"
                    accessibilityLabel="Delete reading"
                    onPress={() => {
                      deleteMeasurement(r.id);
                      toast('Reading deleted', { label: 'Undo', onPress: () => restoreMeasurement(r) });
                    }}
                  />
                </View>
              </Pressable>
            ),
          )}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md, paddingBottom: space.lg },
  hint: { ...font.caption, color: color.textMuted },
  center: { textAlign: 'center', marginTop: space.xs },
  group: { ...font.caption, color: color.textMuted, letterSpacing: 1, marginTop: space.lg, marginBottom: space.sm, textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  cell: { width: '47%' },
  save: { marginTop: space.xl, marginBottom: space.md },
  big: { ...font.title, ...font.numeric, color: color.text, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: hit.default, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  editRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, paddingVertical: space.sm },
  body: { ...font.body, color: color.text },
  value: { ...font.body, ...font.numeric, color: color.text },
});
