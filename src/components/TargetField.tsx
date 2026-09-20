import { StyleSheet, Text, View } from 'react-native';

import { color, font, space } from '@/theme/tokens';

import { ChipRow } from './ChipRow';
import { PrimaryButton } from './PrimaryButton';
import { Stepper } from './Stepper';
import { toast } from './Toast';

const MODES = [
  { label: 'Automatic', value: 0 },
  { label: 'Custom', value: 1 },
];

export interface TargetFieldProps {
  label: string;
  /** The override. `null` means automatic — never render that as a zero target. */
  value: number | null;
  /** What Iron works out on its own. Shown when automatic, and where Custom starts. */
  auto: number;
  /** Plain English: why the automatic number is what it is. */
  basis: string;
  step: number;
  min: number;
  max: number;
  suffix?: string;
  format?: (n: number) => string;
  onChange: (next: number | null) => void;
}

/**
 * One overridable target: Automatic or Custom, said in words.
 *
 * It used to be a bare stepper over the raw setting, where `null` — "work it out
 * for me" — was drawn as `0`. So a user whose effective target was 2,300 kcal read
 * "0", and the first + tap did not nudge 2,300 to 2,350: it wrote a brand-new
 * manual target of 50 (UX-08). Null is still the stored representation; it is just
 * never shown as a number. Choosing Custom starts from whatever is in force now,
 * and going back to Automatic clears the override with an Undo.
 */
export function TargetField({ label, value, auto, basis, step, min, max, suffix, format, onChange }: TargetFieldProps) {
  const custom = value !== null;
  const effective = value ?? auto;
  const show = format ?? ((n: number) => `${n}${suffix ? ` ${suffix}` : ''}`);

  const setMode = (next: number) => {
    if (next === 1) {
      // Starts from the value actually in force, not from `min`.
      const from = Math.min(max, Math.max(min, Math.round(auto / step) * step));
      onChange(from);
      toast(`${label}: custom, starting at ${show(from)}`, { label: 'Undo', onPress: () => onChange(null) });
      return;
    }
    const previous = value;
    onChange(null);
    toast(`${label} back to the automatic ${show(auto)}`, {
      label: 'Undo',
      onPress: () => onChange(previous),
    });
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <ChipRow options={MODES} value={custom ? 1 : 0} onChange={setMode} fill={false} />
      {custom ? (
        <>
          <Stepper suffix={suffix} value={effective} step={step} min={min} max={max} onChange={(v) => onChange(v)} />
          <Text style={styles.hint}>Saved. Iron would work out {show(auto)} on its own.</Text>
          <PrimaryButton label="Use automatic target" tone="ghost" onPress={() => setMode(0)} />
        </>
      ) : (
        <>
          <Text style={styles.value}>{show(auto)}</Text>
          <Text style={styles.hint}>{basis}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, marginTop: space.lg },
  label: { ...font.label, color: color.text, fontWeight: '600' },
  value: { ...font.title, ...font.numeric, color: color.text },
  hint: { ...font.caption, color: color.textMuted },
});
