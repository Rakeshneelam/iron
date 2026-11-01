import { useState } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/Icon';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Stepper } from '@/components/Stepper';
import type { RuleMark } from '@/components/Rule';
import { getLatestWeight, getWeighIn, listWeighIns } from '@/db/repositories/body';
import { weightTrend } from '@/engine/metabolic';
import { fmtDayLabel } from '@/lib/date';
import { kgNum } from '@/lib/format';
import { DEFAULT_WEIGHT_KG } from '@/services/hydration';
import { color } from '@/theme/tokens';

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
   * `hero` puts the number over the previous reading and the trend, as chips — the
   * weigh-in sheet, where the number is the whole task. Elsewhere it is compact.
   */
  size?: 'hero' | 'gym' | 'default';
  /** What the button says before a weight is given. */
  addLabel?: string;
  /** Offer "Don't log a weight" once one is given. Off where logging is the point. */
  optional?: boolean;
}

/**
 * The one weight input. CheckInSheet, WeighInSheet and setup all mount it, so a
 * weight given in any of them has the same step, bounds and meaning, and lands on
 * the same date's single reading.
 *
 * Until a weight is given it is a button, not a number: a stepper showing last
 * week's weight looked like an answer, so people moved on believing it was logged
 * when nothing was (device test, 0.8.0). One tap shows the stepper, starting from
 * the last reading, and that number is what saves.
 */
export function WeightField({ date, draft, onChange, size = 'default', addLabel = 'Log weight', optional = true }: WeightFieldProps) {
  const [anchor] = useState(draft.kg);
  const [near] = useState(() => (size === 'hero' && date ? neighboursOf(date) : {}));
  const set = (v: number) => onChange({ ...draft, kg: Math.round(v * 10) / 10, given: true });
  const marks: RuleMark[] = [];
  if (near.last) marks.push({ value: near.last.kg, kind: 'last', label: `${fmtDayLabel(near.last.date).split(' ')[0]} ${kgNum(near.last.kg)}`, onPress: () => set(near.last?.kg ?? draft.kg) });
  if (near.trend !== undefined) {
    const t = Math.round(near.trend * 10) / 10;
    marks.push({ value: t, kind: 'trend', label: `trend ${kgNum(t)}` });
  }

  if (!draft.given) {
    return (
      <PrimaryButton
        label={addLabel}
        tone="neutral"
        size={size === 'default' ? 'default' : 'gym'}
        icon={<Icon name="plus" size={18} color={color.text} />}
        onPress={() => onChange({ ...draft, given: true })}
      />
    );
  }

  return (
    <View>
      <Stepper
        label={size === 'hero' ? 'Weight' : undefined}
        accessibilityLabel="Weight"
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
      {optional && !draft.existing ? (
        <PrimaryButton label="Don't log a weight" tone="ghost" accessibilityLabel="Do not record a weight for this day" onPress={() => onChange({ ...draft, kg: anchor, given: false })} />
      ) : null}
    </View>
  );
}
