import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SectionHeader } from '@/components/SectionHeader';
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

  const row = (ex: Exercise, sub: string, i: number, spark = false) => (
    <Pressable
      key={ex.id}
      style={({ pressed }) => [styles.item, i > 0 && styles.divider, pressed && styles.pressed]}
      onPress={() => onPick(ex)}
      accessibilityRole="button"
      accessibilityLabel={`Add ${ex.name}. ${sub}`}
    >
      {spark ? <Icon name="spark" size={16} color={color.accent} /> : null}
      <View style={styles.flex}>
        <Text style={styles.name}>{ex.name}</Text>
        <Text style={styles.meta}>{sub}</Text>
      </View>
      <View style={styles.plus}>
        <Icon name="plus" size={20} color={color.text} />
      </View>
    </Pressable>
  );
  const describe = (ex: Exercise) => `${ex.primaryMuscles.map(muscleLabel).join(', ')} · ${EQUIPMENT_LABEL[ex.loadType as Equipment] ?? ex.loadType}`;

  return (
    <View>
      <View style={styles.search}>
        <Icon name="search" size={20} color={color.textFaint} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search exercises"
          placeholderTextColor={color.textFaint}
          style={styles.input}
          autoCorrect={false}
          accessibilityLabel="Search exercises"
        />
        {q ? <IconButton icon="close" accessibilityLabel="Clear search" onPress={() => setQ('')} /> : null}
      </View>
      <View style={styles.gap}>
        <ChipRow
          options={[{ label: 'All', value: 'all' }, ...MUSCLES.map((m) => ({ label: muscleLabel(m), value: m }))]}
          value={muscle}
          onChange={setMuscle}
          fill={false}
        />
      </View>
      <ChipRow
        options={[
          { label: 'My gym', value: 'mine' },
          { label: 'Any gear', value: 'all' },
        ]}
        value={mine ? 'mine' : 'all'}
        onChange={(v) => setMine(v === 'mine')}
      />

      {suggested.length && !q ? (
        <>
          <SectionHeader title="Suggested" />
          <View style={styles.list}>{suggested.map(({ s, e }, i) => row(e, s.reasons.join(', '), i, true))}</View>
        </>
      ) : null}

      <SectionHeader title={q ? 'Results' : mine ? 'For your equipment' : 'Everything'} action={{ label: 'Not what you want?', onPress: () => setCreating(true), accessibilityLabel: 'Create a custom exercise' }} />
      {results.length ? <View style={styles.list}>{results.map((ex, i) => row(ex, describe(ex), i))}</View> : <Text style={styles.meta}>No match. Create it below.</Text>}

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
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md - 2,
    minHeight: hit.gym,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    backgroundColor: color.surfaceHigh,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
  },
  input: { ...font.body, color: color.text, flex: 1, minHeight: hit.gym },
  gap: { marginVertical: space.md },
  list: { backgroundColor: color.bg, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, paddingHorizontal: space.lg },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingVertical: space.xs },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  plus: { width: hit.default, height: hit.default, borderRadius: radius.pill, backgroundColor: color.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  name: { ...font.label, fontWeight: '600', color: color.text },
  meta: { ...font.caption, fontSize: 12, color: color.textFaint, marginTop: 2 },
  create: { gap: space.md, marginTop: space.lg },
  label: { ...font.label, color: color.text },
});
