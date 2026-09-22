import { StyleSheet, Text, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { Stepper } from '@/components/Stepper';
import { TextField } from '@/components/TextField';
import { PHASES, setSetting, useSettings } from '@/db/repositories/settings';
import { GOALS } from '@/features/settings/goals';
import { color, font, hit, space } from '@/theme/tokens';

const SEX = [
  { label: 'Male', value: 'male' as const },
  { label: 'Female', value: 'female' as const },
];

/**
 * Profile: the facts about you the maths needs, and the body-weight goal that
 * steers calories and water. One implementation — Body and Food targets link to
 * Settings → Profile rather than each growing their own copy (UX-03).
 *
 * The training goal lives in Settings → Training: it decides what plans are built
 * out of, which is a training question, while `phase` decides which way the scale
 * is meant to move. Different settings, not two names for one.
 *
 * Writes land immediately, as everything else does; there is nothing to save.
 */
export function ProfileFields() {
  const s = useSettings();
  return (
    <View style={styles.stack}>
      <Field label="Your name">
        <TextField value={s.name} onCommit={(v) => setSetting('name', v)} placeholder="Your name" autoCapitalize="words" accessibilityLabel="Your name" style={styles.input} />
      </Field>
      <Field label="Sex">
        <ChipRow options={SEX} value={s.sex} onChange={(v) => setSetting('sex', v)} columns={2} />
      </Field>
      <View style={styles.pair}>
        <View style={styles.flex1}>
          <Field label="Age">
            <Stepper accessibilityLabel="Age" size="gym" value={s.age} step={1} min={14} max={99} onChange={(v) => setSetting('age', v)} />
          </Field>
        </View>
        <View style={styles.flex1}>
          <Field label="Height">
            <Stepper accessibilityLabel="Height" size="gym" suffix="cm" value={s.heightCm} step={1} min={120} max={230} onChange={(v) => setSetting('heightCm', v)} />
          </Field>
        </View>
      </View>
      <Field label="Body-weight goal" hint="Sets your calorie and water targets.">
        <ChipRow options={GOALS.filter((g) => PHASES.includes(g.value))} value={s.phase} onChange={(v) => setSetting('phase', v)} columns={4} />
      </Field>
    </View>
  );
}

/** A labelled answer: the question in small muted text, the control, an optional faint hint. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md + 2 },
  flex1: { flex: 1 },
  pair: { flexDirection: 'row', gap: space.md - 2 },
  input: { minHeight: hit.gym, borderWidth: 1, borderColor: color.border },
  label: { ...font.caption, fontWeight: '600', color: color.textMuted, marginBottom: space.sm - 2 },
  hint: { ...font.caption, fontSize: 12, color: color.textFaint, marginTop: space.sm - 2 },
});
