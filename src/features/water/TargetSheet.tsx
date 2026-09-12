import { StyleSheet, Text } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { setSetting, useSettings } from '@/db/repositories/settings';
import { rescheduleAll } from '@/services/notifications';
import { color, font, space } from '@/theme/tokens';

const TARGETS = [
  { label: 'Auto', value: 0 },
  { label: '2.5 L', value: 2500 },
  { label: '3 L', value: 3000 },
  { label: '3.5 L', value: 3500 },
  { label: '4 L', value: 4000 },
];

const HEAT = [
  { label: 'Off', value: 0 },
  { label: '32°', value: 32 },
  { label: '36°', value: 36 },
  { label: '40°', value: 40 },
];

/**
 * How much water to aim for — configured from the screen that shows the number.
 *
 * This lived in Settings, which meant the figure at the top of Water was set three
 * screens away from where you read it. Reminders reschedule on change, because a
 * new target makes the old schedule wrong.
 */
export function WaterTargetSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useSettings();
  return (
    <Sheet visible={visible} onClose={onClose} title="Daily target">
      <Text style={styles.label}>How much</Text>
      <ChipRow
        options={TARGETS}
        value={s.hydrationOverrideMl ?? 0}
        onChange={(v) => {
          setSetting('hydrationOverrideMl', v === 0 ? null : v);
          void rescheduleAll();
        }}
        fill={false}
      />
      <Text style={styles.hint}>Auto works out 33 ml per kg of bodyweight, then adds for training and heat.</Text>

      <Text style={styles.label}>Hot weather</Text>
      <ChipRow
        options={HEAT}
        value={s.ambientTempC ?? 0}
        onChange={(v) => {
          setSetting('ambientTempC', v === 0 ? null : v);
          void rescheduleAll();
        }}
        fill={false}
      />
      <Text style={styles.hint}>Adds to the automatic target on hot days. Ignored if you set a fixed amount above.</Text>

      <PrimaryButton label="Done" size="gym" style={styles.done} onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { ...font.label, color: color.text, marginTop: space.lg, marginBottom: space.sm },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  done: { marginTop: space.xl },
});
