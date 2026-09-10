import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { ChipRow } from '@/components/ChipRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Stepper } from '@/components/Stepper';
import { getLatestWeight, upsertWeighIn } from '@/db/repositories/body';
import { markReadinessDone, setReadiness } from '@/db/repositories/sessions';
import { todayISO } from '@/lib/date';
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

/**
 * Before the first set: morning weight plus optional readiness. Skippable in one
 * tap — the engine degrades gracefully without it, and readiness only ever lowers load.
 */
export function ReadinessPrompt({ sessionId }: { sessionId: string }) {
  const [weight, setWeight] = useState(() => getLatestWeight() ?? DEFAULT_WEIGHT_KG);
  const [sleep, setSleep] = useState<number | null>(null);
  const [soreness, setSoreness] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);

  return (
    <Card>
      <Text style={styles.title}>Before you start</Text>
      <Stepper label="Morning weight" suffix="kg" value={weight} step={0.1} min={30} max={250} onChange={setWeight} />
      <Text style={styles.label}>Sleep</Text>
      <ChipRow options={SLEEP} value={sleep} onChange={setSleep} />
      <Text style={styles.label}>Soreness (1 fresh · 5 wrecked)</Text>
      <ChipRow options={SCALE} value={soreness} onChange={setSoreness} />
      <Text style={styles.label}>Stress (1 calm · 5 fried)</Text>
      <ChipRow options={SCALE} value={stress} onChange={setStress} />
      <View style={styles.row}>
        <PrimaryButton
          label="Save"
          style={styles.flex}
          onPress={() => {
            upsertWeighIn(todayISO(), weight);
            setReadiness(sessionId, {
              bodyweightKg: weight,
              sleepHours: sleep ?? undefined,
              soreness: soreness ?? undefined,
              stress: stress ?? undefined,
            });
          }}
        />
        <PrimaryButton label="Skip" tone="neutral" onPress={() => markReadinessDone(sessionId)} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { ...font.heading, color: color.text, marginBottom: space.md },
  label: { ...font.caption, color: color.textMuted, marginTop: space.md, marginBottom: space.xs },
  row: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  flex: { flex: 1 },
});
