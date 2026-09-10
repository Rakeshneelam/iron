import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { Stepper } from '@/components/Stepper';
import { deleteSet, updateSet, type SetRow } from '@/db/repositories/sessions';
import { space } from '@/theme/tokens';

import { RIR_OPTIONS } from './SetControls';

/** Long-press a logged set to edit or delete it. Writes land immediately on Save/Delete. */
export function EditSetSheet({ set, step, onClose }: { set: SetRow | null; step: number; onClose: () => void }) {
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(0);
  const [rir, setRir] = useState(2);
  const [pain, setPain] = useState(false);
  const [warmup, setWarmup] = useState(false);

  useEffect(() => {
    if (!set) return;
    setWeight(set.weight);
    setReps(set.reps);
    setRir(set.rir);
    setPain(set.painFlag === 1);
    setWarmup(set.isWarmup === 1);
  }, [set]);

  return (
    <Sheet visible={set !== null} onClose={onClose} title="Edit set">
      <View style={styles.pair}>
        <Stepper label="kg" value={weight} step={step} min={0} max={500} size="gym" onChange={setWeight} />
        <Stepper label="reps" value={reps} step={1} min={0} max={100} size="gym" onChange={setReps} />
      </View>
      <ChipRow options={RIR_OPTIONS} value={rir} onChange={setRir} size="gym" />
      <View style={styles.pair}>
        <ChipRow options={[{ label: pain ? 'Pain ✓' : 'Pain', value: 1 }]} value={pain ? 1 : null} onChange={() => setPain(!pain)} />
        <ChipRow options={[{ label: warmup ? 'Warm-up ✓' : 'Warm-up', value: 1 }]} value={warmup ? 1 : null} onChange={() => setWarmup(!warmup)} />
      </View>
      <View style={styles.pair}>
        <PrimaryButton
          label="Save"
          size="gym"
          style={styles.flex}
          onPress={() => {
            if (set) updateSet(set.id, { weight, reps, rir, painFlag: pain, isWarmup: warmup });
            onClose();
          }}
        />
        <PrimaryButton
          label="Delete"
          tone="danger"
          size="gym"
          onPress={() => {
            if (set) deleteSet(set.id);
            onClose();
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: space.md, marginVertical: space.md },
  flex: { flex: 1 },
});
