import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Stepper } from '@/components/Stepper';
import { getLatestWeight, getWeighIn } from '@/db/repositories/body';
import { kg } from '@/lib/format';
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

export interface WeightFieldProps {
  draft: WeightDraft;
  onChange: (next: WeightDraft) => void;
  /**
   * How a confirmed-but-not-yet-written value is described. The check-in sheet
   * saves on its own Save, so its selection is "Will save with check-in"; the
   * weigh-in sheet says the same until its Save runs. Nothing here ever claims
   * "Saved" — only a committed row earns that word.
   */
  pendingLabel?: string;
  size?: 'gym' | 'default';
}

/**
 * The one weight input. CheckInSheet and WeighInSheet both mount it, so a weight
 * typed in either place has the same step, bounds, confirmation rule and meaning,
 * and lands on the same date's single reading.
 */
export function WeightField({ draft, onChange, pendingLabel = 'Will save with check-in', size = 'default' }: WeightFieldProps) {
  const [anchor] = useState(draft.kg);

  return (
    <View>
      <Stepper
        suffix="kg"
        size={size}
        value={draft.kg}
        step={0.1}
        min={30}
        max={250}
        onChange={(v) => onChange({ ...draft, kg: v, given: true })}
      />
      {draft.given ? (
        <View style={styles.row}>
          <Text style={[styles.note, styles.flex]}>{draft.existing ? `${pendingLabel} · replaces this day's reading.` : pendingLabel}</Text>
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
