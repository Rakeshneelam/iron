import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { ChipRow } from '@/components/ChipRow';
import { IconButton } from '@/components/IconButton';
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
 * Optional check-in before the first set. Collapsed to one line by default; the
 * engine works without it, and readiness only ever lowers load.
 */
export function ReadinessPrompt({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState(() => getLatestWeight() ?? DEFAULT_WEIGHT_KG);
  const [sleep, setSleep] = useState<number | null>(null);
  const [soreness, setSoreness] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);

  if (!open) {
    return (
      <Card>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.title}>How do you feel?</Text>
            <Text style={styles.hint}>Optional · tunes today's targets</Text>
          </View>
          <PrimaryButton label="Check in" tone="neutral" onPress={() => setOpen(true)} />
          <IconButton icon="close" accessibilityLabel="Skip check-in" onPress={() => markReadinessDone(sessionId)} />
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <Stepper label="Morning weight" suffix="kg" value={weight} step={0.1} min={30} max={250} onChange={setWeight} />
      <Text style={styles.label}>Sleep</Text>
      <ChipRow options={SLEEP} value={sleep} onChange={setSleep} />
      <Text style={styles.label}>Soreness · 1 fresh, 5 wrecked</Text>
      <ChipRow options={SCALE} value={soreness} onChange={setSoreness} />
      <Text style={styles.label}>Stress · 1 calm, 5 fried</Text>
      <ChipRow options={SCALE} value={stress} onChange={setStress} />
      <View style={[styles.row, styles.actions]}>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  title: { ...font.body, color: color.text, fontWeight: '600' },
  hint: { ...font.caption, color: color.textMuted, marginTop: 2 },
  label: { ...font.caption, color: color.textMuted, marginTop: space.md, marginBottom: space.xs },
  actions: { marginTop: space.lg },
});
