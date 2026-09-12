import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { CATALOG, CATALOG_BY_ID, EQUIPMENT_LABEL, MUSCLE_LABEL, type Muscle } from '@/data/catalog';
import type { Exercise } from '@/db/repositories/exercises';
import { useSettings } from '@/db/repositories/settings';
import { substitutes } from '@/engine/substitute';
import { toolsOf } from '@/features/profile';
import { color, font, hit, radius, space } from '@/theme/tokens';

import { ExerciseDemo } from './ExerciseDemo';
import { MuscleMap } from './MuscleMap';

const label = (m: string) => MUSCLE_LABEL[m as Muscle] ?? m;
const LEVEL: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

/**
 * How to do it and what it trains: movement demo, anatomy, cues, mistakes, and
 * what to do instead when you can't (substitutes filtered by YOUR equipment).
 */
export function ExerciseGuide({ exercise, compact = false, onOpen }: { exercise: Exercise; compact?: boolean; onOpen?: (id: string) => void }) {
  const settings = useSettings();
  const entry = CATALOG_BY_ID.get(exercise.id);
  const open = onOpen ?? ((id: string) => router.push(`/exercise/${id}`));
  const subs = useMemo(
    () =>
      entry
        ? substitutes(entry, CATALOG, { available: toolsOf(settings), disliked: new Set(settings.disliked), limitations: new Set(settings.limitations as never[]) }, 4)
        : [],
    [entry, settings],
  );
  const secondary = exercise.secondaryMuscles ?? [];

  return (
    <View style={styles.stack}>
      <View style={styles.stage}>
        <ExerciseDemo exercise={exercise} size={compact ? 190 : 230} />
      </View>
      <MuscleMap primary={exercise.primaryMuscles} secondary={secondary} body={settings.sex === 'female' ? 'female' : 'male'} height={compact ? 150 : 190} />
      <View style={styles.legend}>
        <Legend tone={color.accent} text={exercise.primaryMuscles.map(label).join(', ')} />
        {secondary.length ? <Legend tone={color.accentSoft} text={secondary.map(label).join(', ')} /> : null}
      </View>

      {entry ? (
        <>
          <Text style={styles.meta}>
            {EQUIPMENT_LABEL[entry.equipment]} · {LEVEL[entry.level]} · {entry.compound ? 'Compound' : 'Isolation'}
            {entry.unilateral ? ' · one side at a time' : ''}
          </Text>
          <Block title="Setup">
            <Text style={styles.body}>{entry.setup}</Text>
          </Block>
          <Block title="How to">
            {entry.steps.map((s, i) => (
              <View key={s} style={styles.line}>
                <Text style={styles.num}>{i + 1}</Text>
                <Text style={styles.body}>{s}</Text>
              </View>
            ))}
          </Block>
          <Block title="Common mistakes">
            {entry.mistakes.map((m) => (
              <View key={m} style={styles.line}>
                <Icon name="close" size={14} color={color.warning} />
                <Text style={styles.body}>{m}</Text>
              </View>
            ))}
          </Block>
          {entry.safety ? (
            <View style={styles.safety}>
              <Icon name="info" size={16} color={color.warning} />
              <Text style={styles.body}>{entry.safety}</Text>
            </View>
          ) : null}
          {!compact && (entry.easier?.length || entry.harder?.length) ? (
            <Block title="Easier / harder">
              {[...(entry.easier ?? []).map((id) => ['Easier', id] as const), ...(entry.harder ?? []).map((id) => ['Harder', id] as const)].map(([kind, id]) => (
                <LinkRow key={`${kind}-${id}`} title={CATALOG_BY_ID.get(id)?.name ?? id} hint={kind} onPress={() => open(id)} />
              ))}
            </Block>
          ) : null}
          {subs.length ? (
            <Block title="Can’t do it today? Try">
              {subs.map((s) => (
                <LinkRow key={s.id} title={CATALOG_BY_ID.get(s.id)?.name ?? s.id} hint={s.reasons.join(' · ')} onPress={() => open(s.id)} />
              ))}
            </Block>
          ) : null}
        </>
      ) : (
        <Text style={styles.meta}>Custom exercise — no written guide.</Text>
      )}
    </View>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Legend({ tone, text }: { tone: string; text: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.dot, { backgroundColor: tone }]} />
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

function LinkRow({ title, hint, onPress }: { title: string; hint: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.link, pressed && styles.pressed]} onPress={onPress} accessibilityRole="button">
      <View style={styles.flex}>
        <Text style={styles.linkTitle}>{title}</Text>
        <Text style={styles.linkHint}>{hint}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={color.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md, paddingBottom: space.lg },
  flex: { flex: 1 },
  stage: { alignItems: 'center', backgroundColor: color.bg, borderRadius: radius.lg, paddingVertical: space.md },
  legend: { gap: space.xs, alignItems: 'center' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { ...font.label, color: color.text },
  meta: { ...font.caption, color: color.textMuted, textAlign: 'center' },
  block: { gap: space.xs },
  blockTitle: { ...font.label, color: color.textMuted },
  line: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  num: { ...font.label, ...font.numeric, color: color.accent, width: 14 },
  body: { ...font.body, color: color.text, flex: 1 },
  safety: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: color.warning },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: hit.default, paddingVertical: space.xs },
  pressed: { opacity: 0.7 },
  linkTitle: { ...font.body, color: color.text },
  linkHint: { ...font.caption, color: color.textMuted },
});
