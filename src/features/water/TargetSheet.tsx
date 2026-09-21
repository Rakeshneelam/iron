import { StyleSheet, Text } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { TargetField } from '@/components/TargetField';
import { useLive } from '@/db/live';
import { setSetting, useSettings } from '@/db/repositories/settings';
import { ml } from '@/lib/format';
import { automaticHydrationTarget } from '@/services/hydration';
import { rescheduleAll } from '@/services/notifications';
import { color, font, space } from '@/theme/tokens';

const HEAT = [
  { label: 'Off', value: 0 },
  { label: '32°', value: 32 },
  { label: '36°', value: 36 },
  { label: '40°', value: 40 },
];

/**
 * How much water to aim for — configured from the screen that shows the number.
 *
 * Same Automatic/Custom model as the food targets (UX-08): the automatic figure is
 * shown with the sum behind it, and Custom starts from that figure instead of from
 * a fixed menu of round litres. Reminders reschedule on change, because a new
 * target makes the old schedule wrong.
 */
export function WaterTargetSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useSettings();
  const auto = useLive(() => automaticHydrationTarget(), ['setting', 'weigh_in', 'session', 'water_log']);

  return (
    <Sheet visible={visible} onClose={onClose} title="Daily target">
      <TargetField
        label="Water"
        value={s.hydrationOverrideMl}
        auto={auto.ml}
        basis={`${auto.breakdown}. Recalculated on training days and hot days.`}
        step={100}
        min={500}
        max={6000}
        format={ml}
        onChange={(v) => {
          setSetting('hydrationOverrideMl', v);
          void rescheduleAll();
        }}
      />

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
      <Text style={styles.hint}>Adds to the automatic target on hot days. Ignored while the target above is custom.</Text>

      <PrimaryButton label="Done" size="gym" style={styles.done} onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { ...font.label, color: color.text, marginTop: space.lg, marginBottom: space.sm },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  done: { marginTop: space.xl },
});
