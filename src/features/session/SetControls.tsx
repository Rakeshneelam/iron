import { StyleSheet, Text, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { Icon } from '@/components/Icon';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Stepper } from '@/components/Stepper';
import { color, font, space } from '@/theme/tokens';

export const RIR_OPTIONS = [0, 1, 2, 3, 4].map((n) => ({ label: `RIR ${n}`, value: n }));
const RIR_CHIPS = RIR_OPTIONS.map((o) => ({ ...o, label: o.value === 4 ? '4+' : String(o.value) }));

export interface SetControlsProps {
  weight: number;
  reps: number;
  rir: number;
  pain: boolean;
  step: number;
  logLabel: string;
  onWeight: (v: number) => void;
  onReps: (v: number) => void;
  onRir: (v: number) => void;
  onPain: (v: boolean) => void;
  onLog: () => void;
}

/** Bottom third, one right thumb, no scrolling mid-set. Every target is >= 56dp. */
export function SetControls(p: SetControlsProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.pair}>
        <Stepper label="kg" value={p.weight} step={p.step} min={0} max={500} size="gym" onChange={p.onWeight} />
        <Stepper label="reps" value={p.reps} step={1} min={0} max={100} size="gym" onChange={p.onReps} />
      </View>
      <Text style={styles.caption}>Reps left in the tank</Text>
      <ChipRow options={RIR_CHIPS} value={p.rir} onChange={p.onRir} size="gym" />
      <View style={styles.pair}>
        <PrimaryButton
          label="Pain"
          accessibilityLabel={p.pain ? 'Pain flagged — tap to clear' : 'Flag pain on this set'}
          icon={<Icon name="flag" size={18} color={p.pain ? color.onAccent : color.textMuted} />}
          tone={p.pain ? 'danger' : 'neutral'}
          size="gym"
          onPress={() => p.onPain(!p.pain)}
        />
        <PrimaryButton label={p.logLabel} size="gym" style={styles.log} icon={<Icon name="check" size={20} color={color.onAccent} />} onPress={p.onLog} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  pair: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' },
  caption: { ...font.caption, color: color.textMuted, textAlign: 'center' },
  log: { flex: 1 },
});
