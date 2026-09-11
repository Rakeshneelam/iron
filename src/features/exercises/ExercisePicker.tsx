import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Stepper } from '@/components/Stepper';
import { createCustomExercise, LOAD_TYPES, listExercises, MUSCLES, type Exercise } from '@/db/repositories/exercises';
import type { LoadType } from '@/engine/progression';
import { color, font, hit, radius, space } from '@/theme/tokens';

const cap = (s: string) => (s ? s[0]?.toUpperCase() + s.slice(1) : s);

export interface ExercisePickerProps {
  onPick: (ex: Exercise) => void;
  excludeIds?: readonly string[];
  /** Pre-select a muscle filter — a swap starts with same-muscle options. */
  initialMuscle?: string;
}

/** Search + muscle filter over the catalogue, with inline custom-exercise creation. */
export function ExercisePicker({ onPick, excludeIds = [], initialMuscle }: ExercisePickerProps) {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<string>(initialMuscle && MUSCLES.includes(initialMuscle) ? initialMuscle : 'all');
  const [creating, setCreating] = useState(false);
  const [loadType, setLoadType] = useState<LoadType>('dumbbell');
  const [primary, setPrimary] = useState<string>(MUSCLES[0] ?? 'chest');
  const [step, setStep] = useState(2);

  const results = useMemo(
    () => listExercises({ q, muscle: muscle === 'all' ? undefined : muscle }).filter((e) => !excludeIds.includes(e.id)).slice(0, 60),
    [q, muscle, excludeIds],
  );

  return (
    <View>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search exercises"
        placeholderTextColor={color.textFaint}
        style={styles.input}
        autoCorrect={false}
      />
      <View style={styles.gap}>
        <ChipRow
          options={[{ label: 'All', value: 'all' }, ...MUSCLES.map((m) => ({ label: cap(m), value: m }))]}
          value={muscle}
          onChange={setMuscle}
          fill={false}
        />
      </View>

      {results.map((ex) => (
        <Pressable key={ex.id} style={({ pressed }) => [styles.item, pressed && styles.pressed]} onPress={() => onPick(ex)}>
          <Text style={styles.name}>{ex.name}</Text>
          <Text style={styles.meta}>
            {ex.primaryMuscles.map(cap).join(', ')} · {ex.loadType}
          </Text>
        </Pressable>
      ))}
      {results.length === 0 ? <Text style={styles.meta}>No match. Create it below.</Text> : null}

      {creating ? (
        <View style={styles.create}>
          <Text style={styles.label}>New exercise: {q.trim() || '…type a name above'}</Text>
          <ChipRow options={LOAD_TYPES.map((t) => ({ label: cap(t), value: t }))} value={loadType} onChange={setLoadType} fill={false} />
          <ChipRow options={MUSCLES.map((m) => ({ label: cap(m), value: m }))} value={primary} onChange={setPrimary} fill={false} />
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
  input: {
    ...font.body,
    color: color.text,
    backgroundColor: color.surfaceHigh,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: hit.default,
  },
  gap: { marginVertical: space.md },
  item: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: color.border, minHeight: hit.default },
  pressed: { backgroundColor: color.surfaceHigh },
  name: { ...font.body, color: color.text },
  meta: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  create: { gap: space.md, marginTop: space.lg },
  label: { ...font.label, color: color.text },
});
