import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, confirm, Icon, IconButton, ListCard, ListRow, Pill, PrimaryButton, Screen, SectionHeader, Sheet, toast } from '@/components';
import { CATALOG, CATALOG_BY_ID } from '@/data/catalog';
import { PLAN_TEMPLATES, type PlanTemplate } from '@/data/templates';
import { useLive } from '@/db/live';
import { archiveRoutine, createPlan, deleteRoutine, getActiveRoutine, getDays, getSlots, listRoutines, resolveNextDay, setActiveRoutine, type Routine } from '@/db/repositories/program';
import { useSettings } from '@/db/repositories/settings';
import { adaptTemplate, recommendTemplates } from '@/engine/planner';
import { profileOf } from '@/features/profile';
import { rotationLabel, scheduleLabel } from '@/features/program/schedule';
import { color, font, hit, radius, space } from '@/theme/tokens';

const LEVEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' } as const;
const GOAL = { hypertrophy: 'Muscle', strength: 'Strength', general: 'Fitness' } as const;

/** All saved plans. Nothing here changes on its own; switching is one tap and undoable. */
export default function PlansScreen() {
  const settings = useSettings();
  const plans = useLive(
    () =>
      listRoutines().map((r) => {
        const days = getDays(r.id).map((d) => ({ id: d.id, label: d.label, count: getSlots(d.id).length }));
        return { routine: r, days, next: r.active ? resolveNextDay(r.id)?.id : undefined, exercises: days.reduce((n, d) => n + d.count, 0) };
      }),
    ['routine', 'routine_day', 'routine_slot', 'exercise'],
  );
  const archived = useLive(() => listRoutines({ archived: true }), ['routine']);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<PlanTemplate | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Active first: it is the one being trained, and the one you came to check.
  const ordered = useMemo(() => [...plans].sort((a, b) => Number(b.routine.active) - Number(a.routine.active)), [plans]);
  const activeRotation = plans.find((p) => p.routine.active)?.days.length ?? 0;

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

  const active = ordered.find((p) => p.routine.active);
  const others = ordered.filter((p) => !p.routine.active);

  return (
    <Screen
      title="Plans"
      subtitle="One active, as many as you like"
      tab
      right={
        <Pressable onPress={() => setCreating(true)} accessibilityRole="button" accessibilityLabel="New plan" style={({ pressed }) => [styles.newBtn, pressed && styles.pressed]}>
          <Icon name="plus" size={16} />
          <Text style={styles.newText}>New</Text>
        </Pressable>
      }
    >
      {/*
        The schedule, and the two numbers that were being used as one. A plan's
        rotation is how many workouts it cycles through; the scheduled days are
        which weekdays you mean to train (UX-10).
      */}
      <ListCard>
        <ListRow
          left={<Icon name="calendar" size={20} color={color.accent} />}
          title="Training schedule"
          sub={scheduleLabel({ rotation: activeRotation, scheduledDays: settings.trainingDays.length })}
          onPress={() => router.push('/plan/schedule')}
        />
      </ListCard>

      {plans.length === 0 ? (
        <Card>
          <Text style={styles.name}>No plans yet</Text>
          <Text style={styles.muted}>Start from a template or build one from scratch.</Text>
          <PrimaryButton label="New plan" style={styles.gapTop} onPress={() => setCreating(true)} />
        </Card>
      ) : null}

      {active ? (
        <View style={styles.active}>
          <Pressable
            onPress={() => router.push(`/plan/${active.routine.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${active.routine.name}, your active plan. Edit it.`}
            style={({ pressed }) => [styles.activeHead, pressed && styles.dim]}
          >
            <Text style={styles.activeName} numberOfLines={2}>
              {active.routine.name}
            </Text>
            <Pill label="Active" tone="accent" />
          </Pressable>
          {/* "4 days a week" for a four-workout rotation was not what the number meant. */}
          <Text style={styles.muted}>
            {rotationLabel(active.days.length)} · {active.exercises} {active.exercises === 1 ? 'exercise' : 'exercises'}
          </Text>
          {active.days.length ? (
            <View style={styles.days}>
              {active.days.map((d, i) => {
                const next = d.id === active.next;
                return (
                  <Pressable
                    key={d.id}
                    onPress={() => router.push(`/program/${d.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${d.label}, ${d.count} exercises${next ? ', next up' : ''}. Edit this day.`}
                    style={({ pressed }) => [styles.planDay, i > 0 && styles.divider, pressed && styles.dim]}
                  >
                    <View style={[styles.dot, next && styles.dotNext]} />
                    <Text style={styles.planDayLabel} numberOfLines={1}>
                      {d.label}
                    </Text>
                    <Text style={styles.dayDetail}>
                      {d.count} {d.count === 1 ? 'exercise' : 'exercises'}
                      {next ? ' · next' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      {others.length ? (
        <ListCard>
          {others.map(({ routine: r, days, exercises }, i) => (
            <ListRow
              key={r.id}
              divider={i > 0}
              title={r.name}
              sub={`${rotationLabel(days.length)} · ${exercises} ${exercises === 1 ? 'exercise' : 'exercises'}`}
              right={
                <Pressable
                  onPress={() => activate(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${r.name} as your plan`}
                  hitSlop={{ top: space.md, bottom: space.md }}
                  style={({ pressed }) => [styles.use, pressed && styles.pressed]}
                >
                  <Text style={styles.useText}>Use</Text>
                </Pressable>
              }
              onPress={() => router.push(`/plan/${r.id}`)}
            />
          ))}
        </ListCard>
      ) : null}

      <ListCard>
        <ListRow
          left={<Icon name="book" size={20} color={color.textMuted} />}
          title="Exercise library"
          sub={`${CATALOG.length.toLocaleString()} exercises, with how to do each one`}
          onPress={() => router.push('/library')}
        />
      </ListCard>

      {archived.length ? (
        <>
          <SectionHeader
            title={`Archived · ${archived.length}`}
            action={{ label: showArchived ? 'Hide' : 'Show', onPress: () => setShowArchived(!showArchived), accessibilityLabel: showArchived ? 'Hide archived plans' : 'Show archived plans' }}
          />
          {showArchived ? (
            <ListCard>
              {archived.map((r, i) => (
                <ListRow
                  key={r.id}
                  divider={i > 0}
                  title={r.name}
                  tone="muted"
                  right={
                    <View style={styles.row}>
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
                  }
                />
              ))}
            </ListCard>
          ) : null}
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
  row: { flexDirection: 'row' },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    height: 40,
    marginTop: space.xs,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceHigh,
    borderWidth: 1,
    borderColor: color.border,
  },
  newText: { ...font.label, fontSize: 14, fontWeight: '600', color: color.text },
  active: { backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.accent, padding: space.lg + 2, marginBottom: space.md, gap: space.xs },
  activeHead: { flexDirection: 'row', alignItems: 'center', gap: space.md - 2 },
  activeName: { ...font.heading, fontWeight: '700', color: color.text, flex: 1 },
  days: { marginTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  planDay: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hit.default },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: color.border },
  dotNext: { backgroundColor: color.accent },
  planDayLabel: { ...font.label, fontSize: 14, fontWeight: '600', color: color.text, flex: 1 },
  dayDetail: { ...font.caption, color: color.textFaint },
  use: { height: 32, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border, justifyContent: 'center' },
  useText: { ...font.caption, fontWeight: '600', color: color.text },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  name: { ...font.heading, color: color.text, flexShrink: 1 },
  body: { ...font.body, color: color.text },
  muted: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  gapTop: { marginTop: space.md },
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
