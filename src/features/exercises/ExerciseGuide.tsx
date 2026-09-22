import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
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
      {/* What it trains, as the map's key: the main movers in accent, the helpers muted. */}
      <View style={styles.muscles}>
        {exercise.primaryMuscles.map((m) => (
          <Pill key={m} label={label(m)} tone="accent" />
        ))}
        {secondary.map((m) => (
          <Pill key={m} label={label(m)} tone="muted" />
        ))}
      </View>

      {entry ? (
        <>
          {compact ? <Text style={styles.meta}>{guideMeta(exercise)}</Text> : null}
          <Block title="Setup">
            <Text style={styles.quiet}>{entry.setup}</Text>
          </Block>
          <Block title="How to">
            {entry.steps.map((s, i) => (
              <View key={s} style={styles.line}>
                <View style={styles.num}>
                  <Text style={styles.numText}>{i + 1}</Text>
                </View>
                <Text style={styles.body}>{s}</Text>
              </View>
            ))}
          </Block>
          <Block title="Common mistakes">
            {entry.mistakes.map((m) => (
              <View key={m} style={styles.line}>
                <Icon name="close" size={14} color={color.warning} />
                <Text style={styles.quiet}>{m}</Text>
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
                <LinkRow key={s.id} title={CATALOG_BY_ID.get(s.id)?.name ?? s.id} hint={s.reasons.join(', ')} onPress={() => open(s.id)} />
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

/** "Barbell · Intermediate · Compound" — the line under the name. */
export function guideMeta(exercise: Exercise): string {
  const entry = CATALOG_BY_ID.get(exercise.id);
  if (!entry) return 'Custom exercise';
  return [EQUIPMENT_LABEL[entry.equipment], LEVEL[entry.level], entry.compound ? 'Compound' : 'Isolation', entry.unilateral ? 'one side at a time' : ''].filter(Boolean).join(' · ');
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      {children}
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
  // Illustrations need air: text set right under a figure reads as part of the drawing.
  stack: { gap: space.lg, paddingBottom: space.lg },
  flex: { flex: 1 },
  stage: { alignItems: 'center', backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, paddingVertical: space.lg },
  muscles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm - 2 },
  meta: { ...font.caption, color: color.textMuted },
  block: { gap: space.sm },
  blockTitle: { ...font.eyebrow, color: color.textFaint },
  line: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  num: { width: 22, height: 22, borderRadius: radius.pill, backgroundColor: color.surfaceHigh, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  numText: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '700', ...font.numeric, color: color.text },
  body: { ...font.label, fontSize: 14, fontWeight: '400', color: color.text, flex: 1 },
  quiet: { ...font.caption, color: color.textMuted, flex: 1 },
  safety: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: color.warning },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: hit.default, paddingVertical: space.xs },
  pressed: { opacity: 0.7 },
  linkTitle: { ...font.body, color: color.text },
  linkHint: { ...font.caption, color: color.textMuted },
});
