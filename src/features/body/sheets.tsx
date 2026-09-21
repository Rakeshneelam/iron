import { useState } from 'react';
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
import { WeightField, weightDraftFor, type WeightDraft } from '@/features/body/WeightField';
import { addDays, daysBetweenISO, fmtDayLabel, todayISO } from '@/lib/date';
import { kgNum, signed } from '@/lib/format';
import { success } from '@/lib/haptics';
import { color, font, hit, space } from '@/theme/tokens';

import { GROUP_LABEL, siteDef, SITES, type SiteGroup } from './sites';

/** Which day to open the weight editor on. The reading itself is read from the db. */
export interface WeighEntry {
  date: string;
}

/**
 * The short weight-only sheet, for someone who just wants to weigh in.
 *
 * It shares CheckInSheet's weight input rather than keeping its own: same step,
 * same bounds, same rule that an untouched number is not an answer, and the same
 * single reading per date. Deleting a weigh-in belongs here — clearing a check-in
 * must never take one with it (UX-03).
 */
export function WeighInSheet({ entry, onClose }: { entry: WeighEntry | null; onClose: () => void }) {
  return (
    <Sheet visible={entry !== null} onClose={onClose} title="Weight">
      {/* Mounted per opening, so it starts from that day's reading without an effect. */}
      {entry ? <WeighInForm key={entry.date} entry={entry} onClose={onClose} /> : null}
    </Sheet>
  );
}

function WeighInForm({ entry, onClose }: { entry: WeighEntry; onClose: () => void }) {
  const [date, setDate] = useState(entry.date);
  const [draft, setDraft] = useState<WeightDraft>(() => weightDraftFor(entry.date));
  const [from, setFrom] = useState(entry.date);

  /** Another day is another reading, not the same number under a new date. */
  const goTo = (iso: string) => {
    setDate(iso);
    setFrom(iso);
    setDraft(weightDraftFor(iso));
  };

  return (
    <View style={styles.stack}>
      <DateStepper value={date} onChange={goTo} />
      <WeightField draft={draft} onChange={setDraft} pendingLabel="Will save when you tap Save" size="gym" />
      <Text style={styles.hint}>{"Same time each morning, before food. One reading per day — saving replaces that day's."}</Text>
      <PrimaryButton
        label="Save"
        size="gym"
        disabled={!draft.given}
        onPress={() => {
          if (draft.existing && from !== date) moveWeighIn(from, date, draft.kg);
          else upsertWeighIn(date, draft.kg);
          success();
          onClose();
        }}
      />
      {draft.existing ? (
        <PrimaryButton
          label="Delete this weigh-in"
          tone="ghost"
          onPress={() => {
            const gone = draft.kg;
            deleteWeighIn(date);
            toast('Weigh-in deleted', { label: 'Undo', onPress: () => upsertWeighIn(date, gone) });
            onClose();
          }}
        />
      ) : null}
    </View>
  );
}

const GROUPS: SiteGroup[] = ['core', 'upper', 'arms', 'legs'];

/**
 * A measurement check-in: every site prefilled with its last value; only the ones
 * you actually change are saved, so an untouched stepper never writes a fake reading.
 */
export function MeasureSheet({ visible, latest, onClose }: { visible: boolean; latest: Map<string, number>; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Log measurements">
      {/* Mounted per opening: today's date and nothing touched, every time. */}
      {visible ? <MeasureForm latest={latest} onClose={onClose} /> : null}
    </Sheet>
  );
}

function MeasureForm({ latest, onClose }: { latest: Map<string, number>; onClose: () => void }) {
  const [date, setDate] = useState(todayISO);
  const [values, setValues] = useState<Record<string, number>>({});
  const [showAll, setShowAll] = useState(latest.size === 0);

  const set = (key: string, v: number) => setValues((cur) => ({ ...cur, [key]: v }));
  const touched = Object.keys(values).length;
  const save = () => {
    const rows = Object.entries(values).map(([site, v]) => addMeasurement(date, site, v));
    toast(`Saved ${rows.length} ${rows.length === 1 ? 'measurement' : 'measurements'} on ${fmtDayLabel(date)}`, {
      label: 'Undo',
      onPress: () => rows.forEach((r) => deleteMeasurement(r.id)),
    });
    onClose();
  };

  /**
   * One site. The stepper shows the last reading so the new one is a nudge, not a
   * fresh guess — but an untouched stepper is never saved, so a site that really has
   * not moved needs a way to say so. "Same" says it in one tap, instead of the + −
   * dance people were doing to mark an unchanged value as answered (UX-03).
   */
  const field = (s: (typeof SITES)[number]) => {
    const previous = latest.get(s.key);
    const answered = values[s.key] !== undefined;
    return (
      <View key={s.key} style={styles.cell}>
        <Stepper
          label={`${s.label}${answered ? ' ✓' : ''}`}
          suffix={s.unit}
          value={values[s.key] ?? previous ?? s.fallback}
          step={0.5}
          min={1}
          max={250}
          onChange={(v) => set(s.key, v)}
        />
        {previous !== undefined && !answered ? (
          <PrimaryButton
            label={`Same, ${kgNum(previous)}`}
            tone="ghost"
            accessibilityLabel={`Record ${s.label} unchanged at ${kgNum(previous)} ${s.unit}`}
            onPress={() => set(s.key, previous)}
          />
        ) : null}
      </View>
    );
  };

  // Sites with a history come first: those are the ones being tracked, and hunting
  // for Waist under four group headings every fortnight is the whole friction.
  const tracked = SITES.filter((s) => latest.has(s.key));
  const rest = SITES.filter((s) => !latest.has(s.key) && !s.legacy);

  return (
    <>
      <DateStepper value={date} onChange={setDate} />
      <Text style={[styles.hint, styles.center]}>Change only what you measured. Relaxed, same spot each time.</Text>

      {tracked.length ? (
        <View>
          <Text style={styles.group}>What you track</Text>
          <View style={styles.grid}>{tracked.map(field)}</View>
        </View>
      ) : null}

      {tracked.length && !showAll ? (
        <PrimaryButton label="Measure something else" tone="ghost" style={styles.save} onPress={() => setShowAll(true)} />
      ) : null}

      {showAll
        ? GROUPS.map((g) => {
            const sites = rest.filter((s) => s.group === g);
            if (!sites.length) return null;
            return (
              <View key={g}>
                <Text style={styles.group}>{GROUP_LABEL[g]}</Text>
                <View style={styles.grid}>{sites.map(field)}</View>
              </View>
            );
          })
        : null}

      <PrimaryButton label={touched ? `Save ${touched}` : 'Nothing measured yet'} size="gym" disabled={!touched} style={styles.save} onPress={save} />
    </>
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
  const [draftDate, setDraftDate] = useState(todayISO);
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
              <View key={r.id} style={styles.editBlock}>
                {/* A reading logged on the wrong day is as common a slip as a wrong number. */}
                <DateStepper value={draftDate} onChange={setDraftDate} />
                <View style={styles.editRow}>
                  <Stepper suffix={unit} value={draft} step={0.5} min={1} max={250} onChange={setDraft} />
                  <PrimaryButton
                    label="Save"
                    onPress={() => {
                      updateMeasurement(r.id, { cm: draft, date: draftDate });
                      setEditing(null);
                    }}
                  />
                </View>
              </View>
            ) : (
              <Pressable
                key={r.id}
                style={styles.row}
                onPress={() => {
                  setDraft(r.cm);
                  setDraftDate(r.date);
                  setEditing(r.id);
                }}
                accessibilityHint="Tap to edit the reading or its date"
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
  group: { ...font.label, color: color.textMuted, marginTop: space.xl, marginBottom: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  cell: { width: '47%' },
  save: { marginTop: space.xl, marginBottom: space.md },
  big: { ...font.title, ...font.numeric, color: color.text, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: hit.default, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  editRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  editBlock: { gap: space.sm, paddingVertical: space.sm },
  body: { ...font.body, color: color.text },
  value: { ...font.body, ...font.numeric, color: color.text },
});
