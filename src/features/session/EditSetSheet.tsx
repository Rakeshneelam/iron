import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { CATALOG_BY_ID } from '@/data/catalog';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { Stepper } from '@/components/Stepper';
import { toast } from '@/components/Toast';
import { correctSet, deleteSet, deleteSetCorrecting, restoreSet, restoreSetCorrecting, updateSet, type SetRow } from '@/db/repositories/sessions';
import { space } from '@/theme/tokens';

import { RIR_OPTIONS } from './SetControls';

export interface EditSetSheetProps {
  set: SetRow | null;
  step: number;
  /**
   * The set belongs to a workout that is already finished. Writes then also
   * recompute that session's derived stats, so a correction made in history shows
   * up in Progress and the next prescription without reopening the session (UX-09).
   * During a live workout the stats are written at close, so this stays off.
   */
  correcting?: boolean;
  onClose: () => void;
}

/** Tap a logged set to fix it. Delete is instant and undoable. */
export function EditSetSheet({ set, step, correcting = false, onClose }: EditSetSheetProps) {
  return (
    <Sheet visible={set !== null} onClose={onClose} title={correcting ? 'Correct set' : 'Edit set'}>
      {/* Keyed by the set, so each opening starts from that set without an effect. */}
      {set ? <EditSetForm key={set.id} set={set} step={step} correcting={correcting} onClose={onClose} /> : null}
    </Sheet>
  );
}

function EditSetForm({ set, step, correcting, onClose }: { set: SetRow; step: number; correcting: boolean; onClose: () => void }) {
  const [weight, setWeight] = useState(set.weight);
  const [reps, setReps] = useState(set.reps);
  const [rir, setRir] = useState(set.rir);
  const [pain, setPain] = useState(set.painFlag === 1);
  const [warmup, setWarmup] = useState(set.isWarmup === 1);

  // A plank is stored in seconds, so ten minutes is 600 — clamping that to a rep
  // range silently rewrote the entry as 100.
  const timed = CATALOG_BY_ID.get(set.exerciseId)?.measure === 'time';

  return (
    <>
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
            const patch = { weight, reps, rir, painFlag: pain, isWarmup: warmup };
            if (correcting) correctSet(set.id, patch);
            else updateSet(set.id, patch);
            onClose();
          }}
        />
        <PrimaryButton
          label="Delete"
          tone="danger"
          size="gym"
          onPress={() => {
            if (correcting) deleteSetCorrecting(set.id);
            else deleteSet(set.id);
            toast('Set deleted', { label: 'Undo', onPress: () => (correcting ? restoreSetCorrecting(set) : restoreSet(set)) });
            onClose();
          }}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: space.md, marginVertical: space.md },
  flex: { flex: 1 },
});
