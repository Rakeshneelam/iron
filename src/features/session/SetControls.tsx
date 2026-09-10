import { StyleSheet, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Stepper } from '@/components/Stepper';
import { space } from '@/theme/tokens';

export const RIR_OPTIONS = [0, 1, 2, 3, 4].map((n) => ({ label: `RIR ${n}`, value: n }));

export interface SetControlsProps {
  weight: number;
  reps: number;
  rir: number;
  pain: boolean;
  step: number;
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
      <ChipRow options={RIR_OPTIONS.map((o) => ({ ...o, label: String(o.value) }))} value={p.rir} onChange={p.onRir} size="gym" />
      <View style={styles.pair}>
        <PrimaryButton
          label={p.pain ? 'Pain ✓' : 'Pain'}
          tone={p.pain ? 'danger' : 'neutral'}
          size="gym"
          onPress={() => p.onPain(!p.pain)}
        />
        <PrimaryButton label="Log set" size="gym" style={styles.log} onPress={p.onLog} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  pair: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' },
  log: { flex: 1 },
});
