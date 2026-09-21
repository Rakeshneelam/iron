import { StyleSheet, Text, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { Stepper } from '@/components/Stepper';
import { TextField } from '@/components/TextField';
import { PHASES, setSetting, useSettings } from '@/db/repositories/settings';
import { GOAL_OPTIONS } from '@/features/profile';
import { GOALS } from '@/features/settings/goals';
import { color, font, space } from '@/theme/tokens';

const SEX = [
  { label: 'Male', value: 'male' as const },
  { label: 'Female', value: 'female' as const },
];

/**
 * Profile and goals: the facts about you the maths needs, and the two goals that
 * steer it. One implementation — Body, Food targets and Settings all open this
 * same editor rather than each growing their own copy of a goal selector (UX-03).
 *
 * Training goal and body-weight goal are separate fields on purpose. `goalFocus`
 * decides what your plan is built out of; `phase` decides which way the scale is
 * meant to move and sets the calorie and water targets. They are different
 * settings, not two names for one.
 *
 * Writes land immediately, as everything else does; there is nothing to save.
 */
export function ProfileFields() {
  const s = useSettings();
  return (
    <View>
      <Text style={styles.hint}>Used for calorie and water targets, and to draw the body map. Nothing here leaves this phone.</Text>

      <Text style={styles.label}>Name</Text>
      <TextField value={s.name} onCommit={(v) => setSetting('name', v)} placeholder="Your name" autoCapitalize="words" accessibilityLabel="Your name" />

      <Text style={styles.label}>Sex</Text>
      <ChipRow options={SEX} value={s.sex} onChange={(v) => setSetting('sex', v)} fill={false} />

      <View style={styles.pair}>
        <Stepper label="Age" value={s.age} step={1} min={14} max={99} onChange={(v) => setSetting('age', v)} />
        <Stepper label="Height" suffix="cm" value={s.heightCm} step={1} min={120} max={230} onChange={(v) => setSetting('heightCm', v)} />
      </View>

      <Text style={styles.label}>Training goal</Text>
      <ChipRow options={GOAL_OPTIONS} value={s.goalFocus} onChange={(v) => setSetting('goalFocus', v)} fill={false} />
      <Text style={styles.hint}>What new plans and exercise swaps are built for.</Text>

      <Text style={styles.label}>Body-weight goal</Text>
      <ChipRow options={GOALS.filter((g) => PHASES.includes(g.value))} value={s.phase} onChange={(v) => setSetting('phase', v)} fill={false} />
      <Text style={styles.hint}>Which way the scale should move. Sets your calorie and water targets.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  label: { ...font.label, color: color.text, fontWeight: '600', marginTop: space.lg, marginBottom: space.sm },
  pair: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
});
