import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { Icon } from '@/components/Icon';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Stepper } from '@/components/Stepper';
import { CATALOG_BY_ID, EQUIPMENT_LABEL, MUSCLE_LABEL, type Equipment, type Muscle } from '@/data/catalog';
import { createCustomExercise, getExercise, LOAD_TYPES, listExercises, MUSCLES, type Exercise } from '@/db/repositories/exercises';
import { useSettings } from '@/db/repositories/settings';
import type { LoadType } from '@/engine/progression';
import { isAvailable } from '@/engine/substitute';
import { toolsOf } from '@/features/profile';
import { color, font, hit, radius, space } from '@/theme/tokens';

const muscleLabel = (m: string) => MUSCLE_LABEL[m as Muscle] ?? m;

export interface ExercisePickerProps {
  onPick: (ex: Exercise) => void;
  excludeIds?: readonly string[];
  /** Pre-select a muscle filter — a swap starts with same-muscle options. */
  initialMuscle?: string;
  /** Ranked suggestions shown first (e.g. substitutes for the exercise being swapped). */
  suggestions?: readonly { id: string; reasons: readonly string[] }[];
}

/**
 * Search + muscle filter over the library, limited to your equipment by default,
 * with inline custom-exercise creation.
 */
export function ExercisePicker({ onPick, excludeIds = [], initialMuscle, suggestions = [] }: ExercisePickerProps) {
  const settings = useSettings();
  const tools = useMemo(() => toolsOf(settings), [settings]);
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<string>(initialMuscle && MUSCLES.includes(initialMuscle) ? initialMuscle : 'all');
  const [mine, setMine] = useState(true);
  const [creating, setCreating] = useState(false);
  const [loadType, setLoadType] = useState<LoadType>('dumbbell');
  const [primary, setPrimary] = useState<string>(MUSCLES[0] ?? 'chest');
  const [step, setStep] = useState(2);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return listExercises({ muscle: muscle === 'all' ? undefined : muscle })
      .filter((e) => !excludeIds.includes(e.id))
      .filter((e) => {
        const c = CATALOG_BY_ID.get(e.id);
        if (needle && ![e.name, ...(c?.aka ?? [])].some((n) => n.toLowerCase().includes(needle))) return false;
        return !mine || !c || isAvailable(c, tools);
      })
      .slice(0, 80);
  }, [q, muscle, excludeIds, mine, tools]);

  const suggested = suggestions.map((s) => ({ s, e: getExercise(s.id) })).filter((x): x is { s: (typeof suggestions)[number]; e: Exercise } => !!x.e && !excludeIds.includes(x.e.id));

  return (
    <View>
      {suggested.length && !q ? (
        <View style={styles.suggested}>
          <Text style={styles.section}>SUGGESTED</Text>
          {suggested.map(({ s, e }) => (
            <Pressable key={e.id} style={({ pressed }) => [styles.item, pressed && styles.pressed]} onPress={() => onPick(e)}>
              <View style={styles.itemRow}>
                <Icon name="spark" size={16} color={color.accent} />
                <View style={styles.flex}>
                  <Text style={styles.name}>{e.name}</Text>
                  <Text style={styles.meta}>{s.reasons.join(', ')}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
      <TextInput value={q} onChangeText={setQ} placeholder="Search exercises" placeholderTextColor={color.textFaint} style={styles.input} autoCorrect={false} />
      <View style={styles.gap}>
        <ChipRow
          options={[{ label: 'All', value: 'all' }, ...MUSCLES.map((m) => ({ label: muscleLabel(m), value: m }))]}
          value={muscle}
          onChange={setMuscle}
          fill={false}
        />
      </View>
      <Pressable style={styles.toggle} onPress={() => setMine(!mine)} accessibilityRole="switch" accessibilityState={{ checked: mine }}>
        <Icon name={mine ? 'check' : 'plus'} size={16} color={mine ? color.accent : color.textMuted} />
        <Text style={styles.meta}>{mine ? 'Showing exercises for your equipment' : 'Showing everything'}</Text>
      </Pressable>

      {results.map((ex) => (
        <Pressable key={ex.id} style={({ pressed }) => [styles.item, pressed && styles.pressed]} onPress={() => onPick(ex)}>
          <Text style={styles.name}>{ex.name}</Text>
          <Text style={styles.meta}>
            {ex.primaryMuscles.map(muscleLabel).join(', ')} · {EQUIPMENT_LABEL[ex.loadType as Equipment] ?? ex.loadType}
          </Text>
        </Pressable>
      ))}
      {results.length === 0 ? <Text style={styles.meta}>No match. Create it below.</Text> : null}

      {creating ? (
        <View style={styles.create}>
          <Text style={styles.label}>New exercise: {q.trim() || '…type a name above'}</Text>
          <ChipRow options={LOAD_TYPES.map((t) => ({ label: EQUIPMENT_LABEL[t as Equipment] ?? t, value: t }))} value={loadType} onChange={setLoadType} fill={false} />
          <ChipRow options={MUSCLES.map((m) => ({ label: muscleLabel(m), value: m }))} value={primary} onChange={setPrimary} fill={false} />
          <Stepper label="Smallest jump your gym can load" suffix="kg" value={step} step={0.5} min={0.5} max={20} onChange={setStep} />
          <PrimaryButton
            label="Create and add"
            disabled={q.trim().length === 0}
            onPress={() => onPick(createCustomExercise({ name: q.trim(), loadType, loadStep: step, primaryMuscles: [primary] }))}
          />
        </View>
      ) : (
        <PrimaryButton label="Create a custom exercise" tone="ghost" style={styles.gap} onPress={() => setCreating(true)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  input: { ...font.body, color: color.text, backgroundColor: color.surfaceHigh, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: hit.default },
  gap: { marginVertical: space.md },
  suggested: { marginBottom: space.md },
  section: { ...font.label, color: color.textMuted, marginBottom: space.xs },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: hit.default },
  item: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: color.border, minHeight: hit.default },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pressed: { backgroundColor: color.surfaceHigh },
  name: { ...font.body, color: color.text },
  meta: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  create: { gap: space.md, marginTop: space.lg },
  label: { ...font.label, color: color.text },
});
