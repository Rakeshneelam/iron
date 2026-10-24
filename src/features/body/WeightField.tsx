import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Stepper } from '@/components/Stepper';
import type { RuleMark } from '@/components/Rule';
import { getLatestWeight, getWeighIn, listWeighIns } from '@/db/repositories/body';
import { weightTrend } from '@/engine/metabolic';
import { fmtDayLabel } from '@/lib/date';
import { kg, kgNum } from '@/lib/format';
import { DEFAULT_WEIGHT_KG } from '@/services/hydration';
import { color, font, space } from '@/theme/tokens';

export interface WeightDraft {
  /** What the stepper shows. Meaningless on its own — see `given`. */
  kg: number;
  /** True only once the user has actually said this is their weight. */
  given: boolean;
  /** A reading already exists for this date. */
  existing: boolean;
}

/**
 * Where a weight entry starts for a given date.
 *
 * The stepper has to show *something*, and the honest something is the last known
 * reading. That is also the trap: an untouched default looks identical to an
 * answer, and saving it invents a weigh-in nobody took. So the number and the
 * assertion are separate — `given` is false until the user moves the stepper or
 * taps the explicit confirmation, including when their real weight happens to equal
 * the default (UX-03).
 */
export function weightDraftFor(dateISO: string): WeightDraft {
  const existing = getWeighIn(dateISO);
  return {
    kg: existing?.kg ?? getLatestWeight() ?? DEFAULT_WEIGHT_KG,
    given: existing !== undefined,
    existing: existing !== undefined,
  };
}

/**
 * What a weight for this date sits next to: the reading before it, and the trend
 * as it stood then. Read here so both editors that mount the field get the same
 * marks without carrying their own query.
 */
function neighboursOf(dateISO: string): { last?: { date: string; kg: number }; trend?: number } {
  const all = listWeighIns();
  const before = all.filter((w) => w.date < dateISO);
  const prev = before[before.length - 1];
  const trend = weightTrend(before);
  return { last: prev ? { date: prev.date, kg: prev.kg } : undefined, trend: trend[trend.length - 1]?.trend };
}

export interface WeightFieldProps {
  date?: string;
  draft: WeightDraft;
  onChange: (next: WeightDraft) => void;
  /**
   * How a confirmed-but-not-yet-written value is described. The check-in sheet
   * saves on its own Save, so its selection is "Will save with check-in"; the
   * weigh-in sheet says the same until its Save runs. Nothing here ever claims
   * "Saved" — only a committed row earns that word.
   */
  pendingLabel?: string;
  /**
   * `hero` puts the number over a rule with the previous reading (solid) and the
   * trend (a line) marked on it — the weigh-in sheet, where the number is the
   * whole task. The check-in sheet keeps the compact field.
   */
  size?: 'hero' | 'gym' | 'default';
}

/**
 * The one weight input. CheckInSheet and WeighInSheet both mount it, so a weight
 * typed in either place has the same step, bounds, confirmation rule and meaning,
 * and lands on the same date's single reading.
 */
export function WeightField({ date, draft, onChange, pendingLabel = 'Will save with check-in', size = 'default' }: WeightFieldProps) {
  const [anchor] = useState(draft.kg);
  const [near] = useState(() => (size === 'hero' && date ? neighboursOf(date) : {}));
  const set = (v: number) => onChange({ ...draft, kg: Math.round(v * 10) / 10, given: true });
  const marks: RuleMark[] = [];
  if (near.last) marks.push({ value: near.last.kg, kind: 'last', label: `${fmtDayLabel(near.last.date).split(' ')[0]} ${kgNum(near.last.kg)}`, onPress: () => set(near.last?.kg ?? draft.kg) });
  if (near.trend !== undefined) {
    const t = Math.round(near.trend * 10) / 10;
    marks.push({ value: t, kind: 'trend', label: `trend ${kgNum(t)}` });
  }

  return (
    <View>
      <Stepper
        label={size === 'hero' ? 'Weight' : undefined}
        suffix="kg"
        size={size}
        value={draft.kg}
        step={0.1}
        min={30}
        max={250}
        rule={size === 'hero' ? { marks, major: 10 } : undefined}
        context={[near.last ? `Previous reading ${kgNum(near.last.kg)}` : '', near.trend !== undefined ? `trend ${kgNum(Math.round(near.trend * 10) / 10)}` : ''].filter(Boolean).join(', ')}
        onChange={set}
      />
      {draft.given ? (
        <View style={styles.row}>
          <Text style={[styles.note, styles.flex]}>{draft.existing ? `${pendingLabel}, replacing this day's reading.` : pendingLabel}</Text>
          {!draft.existing ? (
            <PrimaryButton
              label="Clear"
              tone="ghost"
              accessibilityLabel="Do not record a weight for this day"
              onPress={() => onChange({ ...draft, kg: anchor, given: false })}
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.row}>
          <Text style={[styles.note, styles.flex]}>Not recorded. Move the stepper, or say this is right.</Text>
          {/* Explicit, because a number equal to the default is not an answer. */}
          <PrimaryButton label={`Use ${kg(draft.kg)}`} tone="neutral" onPress={() => onChange({ ...draft, given: true })} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  note: { ...font.caption, color: color.textMuted },
});
