import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipRow, Icon, IconButton, PrimaryButton, Sheet } from '@/components';
import { CATALOG_BY_ID, categoryOf, EQUIPMENT_LABEL, LIBRARY_CATEGORIES, MUSCLE_LABEL, type Equipment, type Muscle } from '@/data/catalog';
import { DRILLS, doseLabel, type Drill } from '@/data/drills';
import { useLive } from '@/db/live';
import { listExercises } from '@/db/repositories/exercises';
import { drillDemo } from '@/features/exercises/demo';
import { FigureDemo } from '@/features/exercises/ExerciseDemo';
import { color, font, hit, layout, radius, space } from '@/theme/tokens';

const DRILL_CATEGORIES = { 'Warm-up': ['general', 'activation', 'prep'], Mobility: ['mobility'], Stretching: ['stretch', 'breathing'] } as const;
type DrillCategory = keyof typeof DRILL_CATEGORIES;
const CATEGORIES = ['All', ...LIBRARY_CATEGORIES, ...(Object.keys(DRILL_CATEGORIES) as DrillCategory[])];
const EQUIP = ['all', ...(Object.keys(EQUIPMENT_LABEL) as Equipment[])];

interface Row {
  kind: 'exercise' | 'drill';
  id: string;
  name: string;
  sub: string;
  drill?: Drill;
}

/** Every exercise and drill, searchable by name or alias, filtered by body part or equipment. */
export default function Library() {
  const insets = useSafeAreaInsets();
  const exercises = useLive(() => listExercises(), ['exercise']);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('All');
  const [equip, setEquip] = useState<string>('all');
  const [drill, setDrill] = useState<Drill | null>(null);

  const rows = useMemo<Row[]>(() => {
    const needle = q.trim().toLowerCase();
    const drillKinds = (DRILL_CATEGORIES as Record<string, readonly string[]>)[cat];
    const matches = (name: string, aka: readonly string[] = []) => !needle || [name, ...aka].some((n) => n.toLowerCase().includes(needle));
    const out: Row[] = [];
    if (!drillKinds) {
      for (const e of exercises) {
        const c = CATALOG_BY_ID.get(e.id);
        if (!matches(e.name, c?.aka)) continue;
        if (cat !== 'All' && (c ? categoryOf(c) : null) !== cat && !(cat !== 'All' && !c && e.primaryMuscles.some((m) => MUSCLE_LABEL[m as Muscle] === cat))) continue;
        if (equip !== 'all' && e.loadType !== equip) continue;
        out.push({ kind: 'exercise', id: e.id, name: e.name, sub: `${e.primaryMuscles.map((m) => MUSCLE_LABEL[m as Muscle] ?? m).join(', ')} · ${EQUIPMENT_LABEL[e.loadType as Equipment] ?? e.loadType}` });
      }
    }
    if ((cat === 'All' && equip === 'all') || drillKinds) {
      for (const d of DRILLS) {
        if (drillKinds && !drillKinds.includes(d.kind)) continue;
        if (!matches(d.name)) continue;
        out.push({ kind: 'drill', id: d.id, name: d.name, sub: `${d.kind === 'stretch' ? 'Stretch' : d.kind === 'mobility' ? 'Mobility' : 'Warm-up'} · ${doseLabel(d.dose)}`, drill: d });
      }
    }
    return out;
  }, [exercises, q, cat, equip]);

  const demo = drill ? drillDemo(drill.demo) : null;

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={styles.title}>Exercise library</Text>
      </View>
      <View style={styles.filters}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search exercises and drills"
          placeholderTextColor={color.textFaint}
          style={styles.input}
          autoCorrect={false}
        />
        <ChipRow options={CATEGORIES.map((c) => ({ label: c, value: c }))} value={cat} onChange={setCat} fill={false} />
        {!(cat in DRILL_CATEGORIES) ? (
          <ChipRow options={EQUIP.map((e) => ({ label: e === 'all' ? 'Any equipment' : EQUIPMENT_LABEL[e as Equipment], value: e }))} value={equip} onChange={setEquip} fill={false} />
        ) : null}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => `${r.kind}-${r.id}`}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xl }]}
        ListEmptyComponent={<Text style={styles.empty}>Nothing matches. Try another word or filter.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => (item.kind === 'exercise' ? router.push(`/exercise/${item.id}`) : setDrill(item.drill ?? null))}
            accessibilityRole="button"
          >
            <View style={styles.flex1}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.sub}>{item.sub}</Text>
            </View>
            <Icon name="chevronRight" size={18} color={color.textMuted} />
          </Pressable>
        )}
      />
      <Sheet visible={drill !== null} onClose={() => setDrill(null)} title={drill?.name}>
        {drill ? (
          <View style={styles.drill}>
            {demo ? (
              <View style={styles.stage}>
                <FigureDemo pattern={demo} size={170} />
              </View>
            ) : null}
            <Text style={styles.dose}>{doseLabel(drill.dose)}</Text>
            {drill.cues.map((c) => (
              <Text key={c} style={styles.cue}>
                {c}
              </Text>
            ))}
            <PrimaryButton label="Close" tone="neutral" onPress={() => setDrill(null)} />
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  flex1: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm },
  title: { ...font.title, color: color.text },
  filters: { paddingHorizontal: layout.screenPadding, gap: space.sm, paddingVertical: space.sm },
  input: { ...font.body, color: color.text, backgroundColor: color.surfaceHigh, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: hit.default },
  list: { paddingHorizontal: layout.screenPadding },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: hit.gym, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  pressed: { backgroundColor: color.surface },
  name: { ...font.body, color: color.text, fontWeight: '600' },
  sub: { ...font.caption, color: color.textMuted, marginTop: 2 },
  empty: { ...font.label, color: color.textMuted, textAlign: 'center', marginTop: space.xl },
  drill: { gap: space.md, paddingBottom: space.lg },
  stage: { alignItems: 'center', backgroundColor: color.bg, borderRadius: radius.lg, paddingVertical: space.lg, marginBottom: space.sm },
  dose: { ...font.body, color: color.accent, fontWeight: '600' },
  cue: { ...font.body, color: color.text },
});
