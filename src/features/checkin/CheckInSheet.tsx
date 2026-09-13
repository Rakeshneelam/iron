import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { Stepper } from '@/components/Stepper';
import { toast } from '@/components/Toast';
import { deleteCheckIn, getCheckIn, getLatestWeight, getWeighIn, saveCheckIn, upsertWeighIn } from '@/db/repositories/body';
import { syncReadiness } from '@/db/repositories/sessions';
import { todayISO } from '@/lib/date';
import { kg } from '@/lib/format';
import { DEFAULT_WEIGHT_KG } from '@/services/hydration';
import { color, font, space } from '@/theme/tokens';

const SLEEP = [
  { label: '≤5h', value: 5 },
  { label: '6h', value: 6 },
  { label: '7h', value: 7 },
  { label: '8h', value: 8 },
  { label: '9h+', value: 9 },
];
const SCALE = [1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: n }));

export const sleepLabel = (h: number) => (h <= 5 ? '≤5 h' : h >= 9 ? '9+ h' : `${h} h`);

export interface CheckInSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Opened from Start: still optional, and both buttons carry on to the workout. */
  onStart?: () => void;
}

/**
 * The daily check-in. Every answer is optional and only answers are saved: an
 * untouched weight is the last reading, and saving it would invent a weigh-in.
 */
export function CheckInSheet({ visible, onClose, onStart }: CheckInSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={onStart ? 'Before you start' : 'Daily check-in'}>
      {/* Mounted per opening, so the answers are read fresh without an effect. */}
      {visible ? <Form onClose={onClose} onStart={onStart} /> : null}
    </Sheet>
  );
}

function Form({ onClose, onStart }: Omit<CheckInSheetProps, 'visible'>) {
  const today = todayISO();
  const [existing] = useState(() => getCheckIn(today));
  const [weighed] = useState(() => getWeighIn(today));
  const [latest] = useState(getLatestWeight);
  const [weight, setWeight] = useState(() => weighed?.kg ?? latest ?? DEFAULT_WEIGHT_KG);
  const [weightSet, setWeightSet] = useState(weighed !== undefined);
  const [sleep, setSleep] = useState<number | null>(existing?.sleepHours ?? null);
  const [soreness, setSoreness] = useState<number | null>(existing?.soreness ?? null);
  const [stress, setStress] = useState<number | null>(existing?.stress ?? null);
  const answered = weightSet || sleep !== null || soreness !== null || stress !== null;

  const save = () => {
    if (weightSet) upsertWeighIn(today, weight);
    saveCheckIn({ date: today, sleepHours: sleep, soreness, stress });
    syncReadiness();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View style={styles.stack}>
      <Text style={styles.hint}>
        {onStart ? "Optional. A rough night lowers today's targets; nothing here raises them." : 'Optional. Only what you answer is saved.'}
      </Text>

      <View>
        <Text style={styles.label}>Morning weight</Text>
        <Stepper
          suffix="kg"
          value={weight}
          step={0.1}
          min={30}
          max={250}
          onChange={(v) => {
            setWeight(v);
            setWeightSet(true);
          }}
        />
        {weightSet ? (
          <Text style={styles.note}>Saved as today&apos;s weigh-in.</Text>
        ) : (
          <View style={styles.row}>
            <Text style={[styles.note, styles.flex]}>Not logged today. Tap − or + to set it.</Text>
            {latest !== undefined ? <PrimaryButton label={`Same, ${kg(weight)}`} tone="ghost" onPress={() => setWeightSet(true)} /> : null}
          </View>
        )}
      </View>

      <View>
        <Text style={styles.label}>Sleep last night</Text>
        <ChipRow options={SLEEP} value={sleep} onChange={setSleep} />
      </View>
      <View>
        <Text style={styles.label}>Soreness: 1 fresh, 5 wrecked</Text>
        <ChipRow options={SCALE} value={soreness} onChange={setSoreness} />
      </View>
      <View>
        <Text style={styles.label}>Stress: 1 calm, 5 fried</Text>
        <ChipRow options={SCALE} value={stress} onChange={setStress} />
      </View>

      {onStart ? (
        <View style={styles.actions}>
          <PrimaryButton
            label="Start workout"
            size="gym"
            onPress={() => {
              if (answered) save();
              onStart();
            }}
          />
          <PrimaryButton label="Skip check-in" tone="ghost" onPress={onStart} />
        </View>
      ) : (
        <View style={styles.actions}>
          <PrimaryButton
            label={answered ? 'Save' : 'Nothing to save yet'}
            size="gym"
            disabled={!answered}
            onPress={() => {
              save();
              onClose();
            }}
          />
          {existing ? (
            <PrimaryButton
              label="Clear today's check-in"
              tone="ghost"
              onPress={() => {
                deleteCheckIn(today);
                syncReadiness();
                toast('Check-in cleared', {
                  label: 'Undo',
                  onPress: () => {
                    saveCheckIn(existing);
                    syncReadiness();
                  },
                });
                onClose();
              }}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.lg, paddingBottom: space.lg },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  hint: { ...font.caption, color: color.textMuted },
  label: { ...font.label, color: color.text, fontWeight: '600', marginBottom: space.sm },
  note: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  actions: { gap: space.xs, marginTop: space.sm },
});
