import { StyleSheet, Text, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { Stepper } from '@/components/Stepper';
import { TextField } from '@/components/TextField';
import { setSetting, useSettings } from '@/db/repositories/settings';
import { color, font, space } from '@/theme/tokens';

const SEX = [
  { label: 'Male', value: 'male' as const },
  { label: 'Female', value: 'female' as const },
];

/**
 * The facts about you that the maths needs: name, sex, age, height.
 *
 * These used to sit in Settings under "Profile", which is where you file them if
 * you are tidying a menu. They are not preferences — nothing here is a choice about
 * how the app behaves. They are facts about a body, so they belong with the body,
 * one tap from the number they help calculate.
 *
 * Writes land immediately, as everything else does; there is nothing to save.
 */
export function DetailsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useSettings();
  return (
    <Sheet visible={visible} onClose={onClose} title="Your details">
      <Text style={styles.hint}>Used for calorie and water targets, and to draw the body map. Nothing here leaves this phone.</Text>

      <Text style={styles.label}>Name</Text>
      <TextField
        value={s.name}
        onCommit={(v) => setSetting('name', v)}
        placeholder="Your name"
        autoCapitalize="words"
        accessibilityLabel="Your name"
      />

      <Text style={styles.label}>Sex</Text>
      <ChipRow options={SEX} value={s.sex} onChange={(v) => setSetting('sex', v)} fill={false} />

      <View style={styles.pair}>
        <Stepper label="Age" value={s.age} step={1} min={14} max={99} onChange={(v) => setSetting('age', v)} />
        <Stepper label="Height" suffix="cm" value={s.heightCm} step={1} min={120} max={230} onChange={(v) => setSetting('heightCm', v)} />
      </View>

      <PrimaryButton label="Done" size="gym" style={styles.done} onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hint: { ...font.caption, color: color.textMuted },
  label: { ...font.label, color: color.text, marginTop: space.lg, marginBottom: space.sm },
  pair: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
  done: { marginTop: space.xl },
});
