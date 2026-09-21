import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { TargetField } from '@/components/TargetField';
import { useLive } from '@/db/live';
import { setSetting, useSettings } from '@/db/repositories/settings';
import { GOALS } from '@/features/settings/goals';
import { todayISO } from '@/lib/date';
import { color, font, space } from '@/theme/tokens';

import { computeTargets, confidenceLabel } from './targets';

const ON_OFF = [
  { label: 'On', value: 1 },
  { label: 'Off', value: 0 },
];

/**
 * The calorie and protein numbers at the top of Food, edited where you read them.
 *
 * Automatic or Custom, per number and independently — changing protein leaves
 * calories alone. Before this the sheet showed the raw override, so "let Iron
 * decide" was drawn as `0` and the first + tap wrote 50 kcal instead of nudging
 * the 2,300 actually in force (UX-08). The body-weight goal is shown here because
 * it governs these numbers, but it is edited in one place: Profile & goals.
 */
export function FoodTargetSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useSettings();
  const t = useLive(() => computeTargets(todayISO()), ['meal_log', 'food', 'recipe', 'recipe_item', 'weigh_in', 'setting', 'session']);
  const basis = `${t.auto.note} ${confidenceLabel({ ...t, manual: false })}.`;
  const goal = GOALS.find((g) => g.value === s.phase)?.label ?? '—';

  return (
    <Sheet visible={visible} onClose={onClose} title="Daily targets">
      <TargetField
        label="Calories"
        value={s.manualKcal}
        auto={t.auto.kcal}
        basis={basis}
        step={50}
        min={800}
        max={6000}
        format={(n) => `${n} kcal`}
        onChange={(v) => setSetting('manualKcal', v)}
      />

      <TargetField
        label="Protein"
        value={s.manualProteinG}
        auto={t.auto.proteinG}
        basis="Set from your bodyweight and your body-weight goal."
        step={5}
        min={40}
        max={400}
        suffix="g"
        onChange={(v) => setSetting('manualProteinG', v)}
      />

      <View style={styles.goal}>
        <View style={styles.flex}>
          <Text style={styles.rowLabel}>Body-weight goal</Text>
          <Text style={styles.hint}>{goal} — this is what the automatic numbers aim at.</Text>
        </View>
        <PrimaryButton
          label="Edit"
          tone="ghost"
          accessibilityLabel="Edit your body-weight goal in Profile and goals"
          onPress={() => {
            onClose();
            router.push('/settings/profile');
          }}
        />
      </View>

      <Text style={styles.label}>Calorie cycling</Text>
      <ChipRow options={ON_OFF} value={s.calorieCycling ? 1 : 0} onChange={(v) => setSetting('calorieCycling', v === 1)} fill={false} />
      <Text style={styles.hint}>
        Moves 8% of the day&apos;s calories onto training days and off rest days. Same weekly total, better sessions.
      </Text>

      <PrimaryButton label="Done" size="gym" style={styles.done} onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  goal: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xl },
  label: { ...font.label, color: color.text, fontWeight: '600', marginTop: space.lg, marginBottom: space.sm },
  rowLabel: { ...font.label, color: color.text, fontWeight: '600' },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  done: { marginTop: space.xl },
});
