import { StyleSheet, Text, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { Stepper } from '@/components/Stepper';
import { setSetting, useSettings } from '@/db/repositories/settings';
import { color, font, space } from '@/theme/tokens';

const ON_OFF = [
  { label: 'On', value: 1 },
  { label: 'Off', value: 0 },
];

/**
 * The calorie and protein numbers at the top of Food, edited where you read them.
 *
 * Zero means "work it out for me" rather than "eat nothing" — which is why the
 * copy says so plainly. Iron derives targets from what you actually ate and what
 * your weight actually did, so overriding is the exception, not the default.
 */
export function FoodTargetSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useSettings();
  const auto = s.manualKcal === null && s.manualProteinG === null;
  return (
    <Sheet visible={visible} onClose={onClose} title="Daily targets">
      <Text style={styles.hint}>
        {auto
          ? 'Iron works these out from your intake and weight trend. Set either one to take over.'
          : 'Your own numbers. Set one back to zero to hand it back to Iron.'}
      </Text>

      <View style={styles.pair}>
        <Stepper
          label="Calories"
          value={s.manualKcal ?? 0}
          step={50}
          min={0}
          max={6000}
          onChange={(v) => setSetting('manualKcal', v === 0 ? null : v)}
        />
        <Stepper
          label="Protein"
          suffix="g"
          value={s.manualProteinG ?? 0}
          step={5}
          min={0}
          max={400}
          onChange={(v) => setSetting('manualProteinG', v === 0 ? null : v)}
        />
      </View>
      <Text style={styles.hint}>Zero means let Iron decide, not eat nothing.</Text>

      <Text style={styles.label}>Calorie cycling</Text>
      <ChipRow
        options={ON_OFF}
        value={s.calorieCycling ? 1 : 0}
        onChange={(v) => setSetting('calorieCycling', v === 1)}
        fill={false}
      />
      <Text style={styles.hint}>
        Moves 8% of the day&apos;s calories onto training days and off rest days. Same weekly total, better sessions.
      </Text>

      <PrimaryButton label="Done" size="gym" style={styles.done} onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { ...font.label, color: color.text, marginTop: space.lg, marginBottom: space.sm },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  pair: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
  done: { marginTop: space.xl },
});
