import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, confirm, Icon, IconButton, ListCard, ListRow, Pill, Press, PrimaryButton, Screen, SectionHeader, Sheet, toast } from '@/components';
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

/**
 * A day's planned sets as small pills, grouped by exercise — the shape of the
 * workout before it happens.
 */
function PlannedSets({ sets }: { sets: readonly number[] }) {
  return (
    <View style={styles.planned} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {sets.map((n, i) => (
        <View key={i} style={[styles.plannedGroup, { flexGrow: n }]}>
          {Array.from({ length: n }, (_, j) => (
            <View key={j} style={styles.plannedMark} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** All saved plans. Nothing here changes on its own; switching is one tap and undoable. */
export default function PlansScreen() {
  const settings = useSettings();
  const plans = useLive(
    () =>
      listRoutines().map((r) => {
        const days = getDays(r.id).map((d) => {
          const slots = getSlots(d.id);
          return { id: d.id, label: d.label, count: slots.length, sets: slots.map((x) => x.targetSets) };
        });
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
      tab
      right={
        <Press onPress={() => setCreating(true)} accessibilityRole="button" accessibilityLabel="New plan" style={styles.newBtn} pressedStyle={styles.newHeld}>
          <Icon name="plus" size={18} color={color.onAccent} strokeWidth={2.6} />
          <Text style={styles.newText}>New</Text>
        </Press>
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
        <Card tone="volt" style={styles.active}>
          <Press
            onPress={() => router.push(`/plan/${active.routine.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${active.routine.name}, your active plan. Edit it.`}
            style={styles.activeHead}
          >
            <View style={styles.kicker}>
              <View style={styles.kickerDot} />
              <Text style={styles.kickerText}>Active plan</Text>
            </View>
            <Text style={styles.activeName} numberOfLines={2}>
              {active.routine.name}
            </Text>
            {/* "4 days a week" for a four-workout rotation was not what the number meant. */}
            <Text style={styles.activeMeta}>
              {rotationLabel(active.days.length)}, {active.exercises} {active.exercises === 1 ? 'exercise' : 'exercises'} in all
            </Text>
          </Press>
          {active.days.length ? (
            <View style={styles.days}>
              {active.days.map((d) => {
                const next = d.id === active.next;
                return (
                  <Press
                    key={d.id}
                    onPress={() => router.push(`/program/${d.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${d.label}, ${d.count} exercises, ${d.sets.reduce((a, b) => a + b, 0)} sets${next ? ', next up' : ''}. Edit this day.`}
                    style={styles.planDay}
                    pressedStyle={styles.planDayHeld}
                  >
                    <View style={styles.planDayHead}>
                      <Text style={styles.planDayLabel} numberOfLines={1}>
                        {d.label}
                      </Text>
                      {next ? (
                        <View style={styles.next}>
                          <Text style={styles.nextText}>next</Text>
                        </View>
                      ) : null}
                      <Text style={styles.dayDetail}>
                        {d.count} {d.count === 1 ? 'exercise' : 'exercises'}
                      </Text>
                    </View>
                    <PlannedSets sets={d.sets} />
                  </Press>
                );
              })}
            </View>
          ) : null}
        </Card>
      ) : null}

      {others.length ? (
        <ListCard>
          {others.map(({ routine: r, days, exercises }, i) => (
            <ListRow
              key={r.id}
              divider={i > 0}
              title={r.name}
              sub={`${rotationLabel(days.length)}, ${exercises} ${exercises === 1 ? 'exercise' : 'exercises'}`}
              right={
                <Press
                  onPress={() => activate(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${r.name} as your plan`}
                  hitSlop={{ top: space.sm, bottom: space.sm }}
                  style={styles.use}
                  pressedStyle={styles.useHeld}
                >
                  <Text style={styles.useText}>Use</Text>
                </Press>
              }
              onPress={() => router.push(`/plan/${r.id}`)}
            />
          ))}
        </ListCard>
      ) : null}

      <ListCard>
        <ListRow
          left={<Icon name="book" size={20} color={color.accent} />}
          title="Exercise library"
          sub={`${CATALOG.length.toLocaleString()} exercises, with how to do each one`}
          onPress={() => router.push('/library')}
        />
      </ListCard>

      {archived.length ? (
        <>
          <SectionHeader
            title={`Archived, ${archived.length}`}
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
        <Text style={styles.muted}>Best matches for you first.</Text>
        {ranked.map((m, i) => (
          <Press key={m.template.id} feedback="highlight" style={[styles.option, !m.fits && styles.dim]} pressedStyle={styles.pressed} onPress={() => setPreview(m.template)} accessibilityRole="button">
            <View style={styles.flex1}>
              <View style={styles.titleRow}>
                <Text style={styles.body}>{m.template.name}</Text>
                {i === 0 ? <Pill label="Best match" tone="accent" /> : null}
              </View>
              <Text style={styles.muted}>
                {m.template.daysPerWeek} days a week, about {m.template.minutes} minutes
                <Text style={styles.mutedFaint}>{`\n${GOAL[m.template.goal]}, ${LEVEL[m.template.level].toLowerCase()}`}</Text>
              </Text>
            </View>
            <Icon name="chevronRight" size={20} color={color.textMuted} />
          </Press>
        ))}
        <Press feedback="highlight" style={styles.option} pressedStyle={styles.pressed} onPress={() => add(null)} accessibilityRole="button">
          <View style={styles.flex1}>
            <Text style={styles.body}>Blank plan</Text>
            <Text style={styles.muted}>Build your own from scratch</Text>
          </View>
          <Icon name="plus" size={20} color={color.textMuted} />
        </Press>
      </Sheet>

      <Sheet visible={preview !== null} onClose={() => setPreview(null)} title={preview?.name}>
        {preview && adapted ? (
          <View style={styles.stack}>
            <Text style={styles.body}>{preview.summary}</Text>
            <View style={styles.pills}>
              <Pill label={GOAL[preview.goal]} />
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
  row: { flexDirection: 'row', gap: space.sm },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, height: 46, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: color.accent },
  newHeld: { backgroundColor: color.accentPressed },
  newText: { ...font.label, fontWeight: '800', color: color.onAccent },

  active: { marginTop: space.md, borderRadius: radius.xl, padding: space.lg + 2, overflow: 'hidden' },
  activeHead: { gap: space.sm },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 30, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.onTile },
  kickerDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: color.accent },
  kickerText: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '800', color: color.accent },
  activeName: { ...font.title, fontSize: 38, lineHeight: 40, letterSpacing: -0.8, color: color.onTile, paddingRight: space.xs },
  activeMeta: { ...font.caption, fontWeight: '700', color: color.onTileMuted },
  days: { marginTop: space.md, gap: space.sm },
  planDay: { gap: space.sm, minHeight: hit.default, paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.md + 2, backgroundColor: color.onTileWash },
  planDayHeld: { opacity: 0.8 },
  planDayHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  planDayLabel: { ...font.label, fontWeight: '800', color: color.onTile, flexShrink: 1 },
  next: { height: 22, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: color.onTile, justifyContent: 'center' },
  nextText: { ...font.caption, fontSize: 11, lineHeight: 14, fontWeight: '800', color: color.accent },
  dayDetail: { ...font.caption, fontWeight: '700', color: color.onTileMuted, marginLeft: 'auto' },
  planned: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  plannedGroup: { flexDirection: 'row', flexShrink: 1, flexBasis: 0, gap: 3 },
  plannedMark: { flex: 1, maxWidth: 10, height: 10, borderRadius: radius.pill, backgroundColor: color.onTile, opacity: 0.55 },

  use: { height: 34, paddingHorizontal: space.md + 2, borderRadius: radius.pill, backgroundColor: color.surfaceHigh, justifyContent: 'center' },
  useHeld: { backgroundColor: color.border },
  useText: { ...font.caption, fontWeight: '800', color: color.text },
  name: { ...font.heading, color: color.text, flexShrink: 1 },
  body: { ...font.body, color: color.text },
  muted: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  gapTop: { marginTop: space.md },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, marginTop: space.sm, borderRadius: radius.lg, backgroundColor: color.surfaceHigh },
  pressed: { backgroundColor: color.border },
  dim: { opacity: 0.5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  stack: { gap: space.md, paddingBottom: space.lg },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  day: { gap: 2, padding: space.md, borderRadius: radius.md + 2, backgroundColor: color.surfaceHigh },
  dayLabel: { ...font.label, color: color.text, fontWeight: '800' },
  slot: { ...font.caption, color: color.textMuted },
  swapped: { color: color.textMuted },
});
