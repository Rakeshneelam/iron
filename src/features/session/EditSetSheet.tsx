import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { CATALOG_BY_ID } from '@/data/catalog';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { Stepper } from '@/components/Stepper';
import { toast } from '@/components/Toast';
import { deleteSet, restoreSet, updateSet, type SetRow } from '@/db/repositories/sessions';
import { space } from '@/theme/tokens';

import { RIR_OPTIONS } from './SetControls';

/** Tap a logged set to fix it. Delete is instant and undoable. */
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

  // A plank is stored in seconds, so ten minutes is 600 — clamping that to a rep
  // range silently rewrote the entry as 100.
  const timed = set ? CATALOG_BY_ID.get(set.exerciseId)?.measure === 'time' : false;

  return (
    <Sheet visible={set !== null} onClose={onClose} title="Edit set">
      <View style={styles.pair}>
        <Stepper label="kg" value={weight} step={step} min={0} max={500} size="gym" onChange={setWeight} />
        <Stepper
          label={timed ? 'sec' : 'reps'}
          value={reps}
          step={timed ? 5 : 1}
          min={0}
          max={timed ? 7200 : 100}
          size="gym"
          onChange={setReps}
        />
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
            if (set) {
              const row = set;
              deleteSet(row.id);
              toast('Set deleted', { label: 'Undo', onPress: () => restoreSet(row) });
            }
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
