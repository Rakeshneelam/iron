import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, confirm, Icon, IconButton, Pill, PrimaryButton, Screen, SectionHeader, Sheet, toast } from '@/components';
import { CATALOG_BY_ID } from '@/data/catalog';
import { PLAN_TEMPLATES, type PlanTemplate } from '@/data/templates';
import { useLive } from '@/db/live';
import { archiveRoutine, createPlan, deleteRoutine, getActiveRoutine, getDays, getSlots, listRoutines, setActiveRoutine, type Routine } from '@/db/repositories/program';
import { useSettings } from '@/db/repositories/settings';
import { adaptTemplate, recommendTemplates } from '@/engine/planner';
import { profileOf } from '@/features/profile';
import { color, font, hit, radius, space } from '@/theme/tokens';

const LEVEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' } as const;
const GOAL = { hypertrophy: 'Muscle', strength: 'Strength', general: 'Fitness' } as const;

/** All saved plans. Nothing here changes on its own; switching is one tap and undoable. */
export default function PlansScreen() {
  const settings = useSettings();
  const plans = useLive(
    () =>
      listRoutines().map((r) => {
        const days = getDays(r.id);
        return { routine: r, days: days.map((d) => d.label), exercises: days.reduce((n, d) => n + getSlots(d.id).length, 0) };
      }),
    ['routine', 'routine_day', 'routine_slot', 'exercise'],
  );
  const archived = useLive(() => listRoutines({ archived: true }), ['routine']);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<PlanTemplate | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const profile = useMemo(() => profileOf(settings), [settings]);
  const ranked = useMemo(() => recommendTemplates(profile, PLAN_TEMPLATES, CATALOG_BY_ID), [profile]);
  const adapted = useMemo(() => (preview ? adaptTemplate(preview, profile, CATALOG_BY_ID) : null), [preview, profile]);

  const activate = (r: Routine) => {
    const prev = getActiveRoutine();
    setActiveRoutine(r.id);
    toast(`${r.name} is now your plan`, prev ? { label: 'Undo', onPress: () => setActiveRoutine(prev.id) } : undefined);
  };

  const add = (t: PlanTemplate | null) => {
    const hasActive = getActiveRoutine() !== undefined;
    const r =
      t && adapted
        ? createPlan({ name: t.name, daysPerWeek: t.daysPerWeek, days: adapted.days }, { activate: !hasActive })
        : createPlan({ name: 'My plan', daysPerWeek: settings.trainingDays.length || 3, days: [{ label: 'Day 1', slots: [] }] }, { activate: !hasActive });
    setPreview(null);
    setCreating(false);
    router.push(`/plan/${r.id}`);
  };

  return (
    <Screen
      title="Plans"
      right={
        <View style={styles.headerBtns}>
          <IconButton icon="book" accessibilityLabel="Exercise library" onPress={() => router.push('/library')} />
          <IconButton icon="plus" tone="neutral" accessibilityLabel="New plan" onPress={() => setCreating(true)} />
        </View>
      }
    >
      {plans.length === 0 ? (
        <Card>
          <Text style={styles.name}>No plans yet</Text>
          <Text style={styles.muted}>Start from a template or build one from scratch.</Text>
          <PrimaryButton label="New plan" style={styles.gapTop} onPress={() => setCreating(true)} />
        </Card>
      ) : null}

      {plans.map(({ routine: r, days, exercises }) => (
        <Card key={r.id} tone={r.active ? 'accent' : 'default'} onPress={() => router.push(`/plan/${r.id}`)}>
          <View style={styles.rowBetween}>
            <Text style={styles.name} numberOfLines={1}>
              {r.name}
            </Text>
            {r.active ? <Pill label="Active" tone="accent" /> : <Icon name="chevronRight" size={20} color={color.textMuted} />}
          </View>
          <Text style={styles.muted}>
            {days.length} {days.length === 1 ? 'day' : 'days'} a week, {exercises} {exercises === 1 ? 'exercise' : 'exercises'}
          </Text>
          {days.length ? (
            <Text style={styles.days} numberOfLines={1}>
              {days.join(', ')}
            </Text>
          ) : null}
          {!r.active ? <PrimaryButton label="Use this plan" tone="neutral" style={styles.gapTop} onPress={() => activate(r)} /> : null}
        </Card>
      ))}

      <Card onPress={() => router.push('/library')}>
        <View style={styles.rowBetween}>
          <View style={styles.rowStart}>
            <Icon name="book" size={20} color={color.accent} />
            <View>
              <Text style={styles.body}>Exercise library</Text>
              <Text style={styles.muted}>How-tos, muscles, swaps, warm-up drills</Text>
            </View>
          </View>
          <Icon name="chevronRight" size={20} color={color.textMuted} />
        </View>
      </Card>

      {archived.length ? (
        <>
          <Pressable style={styles.toggle} onPress={() => setShowArchived(!showArchived)} accessibilityRole="button">
            <SectionHeader title="Archived" hint={`${archived.length} ${archived.length === 1 ? 'plan' : 'plans'}`} />
            <Icon name={showArchived ? 'chevronUp' : 'chevronDown'} size={18} color={color.textMuted} />
          </Pressable>
          {showArchived
            ? archived.map((r) => (
                <View key={r.id} style={styles.archivedRow}>
                  <Text style={[styles.body, styles.flex1]} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <IconButton icon="undo" accessibilityLabel={`Restore ${r.name}`} onPress={() => archiveRoutine(r.id, false)} />
                  <IconButton
                    icon="trash"
                    accessibilityLabel={`Delete ${r.name}`}
                    onPress={() =>
                      confirm({
                        title: `Delete ${r.name}?`,
                        message: 'Your workout history is kept, but those workouts lose their day names.',
                        confirmLabel: 'Delete',
                        destructive: true,
                        onConfirm: () => deleteRoutine(r.id),
                      })
                    }
                  />
                </View>
              ))
            : null}
        </>
      ) : null}

      <Sheet visible={creating && !preview} onClose={() => setCreating(false)} title="New plan">
        <Text style={styles.muted}>Ranked for your goal, days, time and equipment. Templates are copied — edit anything afterwards.</Text>
        {ranked.map((m, i) => (
          <Pressable key={m.template.id} style={({ pressed }) => [styles.option, pressed && styles.pressed, !m.fits && styles.dim]} onPress={() => setPreview(m.template)}>
            <View style={styles.flex1}>
              <View style={styles.titleRow}>
                <Text style={styles.body}>{m.template.name}</Text>
                {i === 0 ? <Text style={styles.badge}>Best match</Text> : null}
              </View>
              <Text style={styles.muted}>
                {m.template.daysPerWeek} days a week, about {m.template.minutes} minutes
                <Text style={styles.mutedFaint}>{`\n${GOAL[m.template.goal]} · ${LEVEL[m.template.level]}`}</Text>
              </Text>
            </View>
            <Icon name="chevronRight" size={20} color={color.textMuted} />
          </Pressable>
        ))}
        <Pressable style={({ pressed }) => [styles.option, pressed && styles.pressed]} onPress={() => add(null)}>
          <View style={styles.flex1}>
            <Text style={styles.body}>Blank plan</Text>
            <Text style={styles.muted}>Build your own from scratch</Text>
          </View>
          <Icon name="plus" size={20} color={color.textMuted} />
        </Pressable>
      </Sheet>

      <Sheet visible={preview !== null} onClose={() => setPreview(null)} title={preview?.name}>
        {preview && adapted ? (
          <View style={styles.stack}>
            <Text style={styles.body}>{preview.summary}</Text>
            <View style={styles.pills}>
              <Pill label={GOAL[preview.goal]} tone="accent" />
              <Pill label={LEVEL[preview.level]} />
              <Pill label={`${preview.daysPerWeek} days`} />
              <Pill label={`~${preview.minutes} min`} />
            </View>
            <Text style={styles.muted}>{preview.progression}</Text>
            {adapted.days.map((d) => (
              <View key={d.label} style={styles.day}>
                <Text style={styles.dayLabel}>{d.label}</Text>
                {d.slots.map((s) => {
                  const swapped = adapted.swaps.some((x) => x.to === s.exerciseId);
                  return (
                    <Text key={s.exerciseId} style={styles.slot}>
                      {CATALOG_BY_ID.get(s.exerciseId)?.name ?? s.exerciseId}
                      <Text style={styles.mutedFaint}>{`   ${s.targetSets} × ${s.repLo}–${s.repHi}`}</Text>
                      {swapped ? <Text style={styles.swapped}>  (swapped for your equipment)</Text> : null}
                    </Text>
                  );
                })}
              </View>
            ))}
            {adapted.removed.length ? <Text style={styles.muted}>{adapted.removed.length} exercises had no substitute with your equipment and were left out.</Text> : null}
            <PrimaryButton label="Add this plan" size="gym" onPress={() => add(preview)} />
            <PrimaryButton label="Back" tone="ghost" onPress={() => setPreview(null)} />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mutedFaint: { color: color.textFaint },
  flex1: { flex: 1 },
  headerBtns: { flexDirection: 'row', gap: space.xs },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  rowStart: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { ...font.heading, color: color.text, flexShrink: 1 },
  body: { ...font.body, color: color.text },
  muted: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  days: { ...font.label, color: color.text, marginTop: space.sm },
  gapTop: { marginTop: space.md },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  archivedRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: hit.default },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  pressed: { backgroundColor: color.surfaceHigh },
  dim: { opacity: 0.5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  badge: { ...font.caption, color: color.accent, fontWeight: '700' },
  stack: { gap: space.md, paddingBottom: space.lg },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  day: { gap: 2 },
  dayLabel: { ...font.label, color: color.text, fontWeight: '700' },
  slot: { ...font.caption, color: color.textMuted },
  swapped: { color: color.accent },
});
