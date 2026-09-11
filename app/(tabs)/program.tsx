import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, confirm, Icon, IconButton, Pill, PrimaryButton, Screen, SectionHeader, Sheet, toast } from '@/components';
import { useLive } from '@/db/live';
import {
  archiveRoutine,
  createPlan,
  deleteRoutine,
  getActiveRoutine,
  getDays,
  getSlots,
  listRoutines,
  setActiveRoutine,
  type Routine,
} from '@/db/repositories/program';
import { PLAN_TEMPLATES, type PlanTemplate } from '@/db/seed/templates';
import { color, font, hit, radius, space } from '@/theme/tokens';

/** All saved plans. Nothing here changes on its own; switching is one tap and undoable. */
export default function PlansScreen() {
  const plans = useLive(
    () =>
      listRoutines().map((r) => {
        const days = getDays(r.id);
        return { routine: r, days: days.map((d) => d.label), exercises: days.reduce((n, d) => n + getSlots(d.id).length, 0) };
      }),
    ['routine', 'routine_day', 'routine_slot'],
  );
  const archived = useLive(() => listRoutines({ archived: true }), ['routine']);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const activate = (r: Routine) => {
    const prev = getActiveRoutine();
    setActiveRoutine(r.id);
    toast(`${r.name} is now your plan`, prev ? { label: 'Undo', onPress: () => setActiveRoutine(prev.id) } : undefined);
  };

  const fromTemplate = (t: PlanTemplate | null) => {
    const hasActive = getActiveRoutine() !== undefined;
    const r = t
      ? createPlan({ name: t.name, daysPerWeek: t.daysPerWeek, days: t.days }, { activate: !hasActive })
      : createPlan({ name: 'My plan', daysPerWeek: 3, days: [{ label: 'Day 1', slots: [] }] }, { activate: !hasActive });
    setCreating(false);
    router.push(`/plan/${r.id}`);
  };

  return (
    <Screen title="Plans" right={<IconButton icon="plus" tone="neutral" accessibilityLabel="New plan" onPress={() => setCreating(true)} />}>
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
            {r.daysPerWeek}× a week · {days.length} {days.length === 1 ? 'day' : 'days'} · {exercises} exercises
          </Text>
          {days.length ? (
            <Text style={styles.days} numberOfLines={1}>
              {days.join('  ·  ')}
            </Text>
          ) : null}
          {!r.active ? <PrimaryButton label="Use this plan" tone="neutral" style={styles.gapTop} onPress={() => activate(r)} /> : null}
        </Card>
      ))}

      {archived.length ? (
        <>
          <Pressable style={styles.toggle} onPress={() => setShowArchived(!showArchived)} accessibilityRole="button">
            <SectionHeader title={`Archived · ${archived.length}`} />
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

      <Sheet visible={creating} onClose={() => setCreating(false)} title="New plan">
        <Text style={styles.muted}>Templates are copied — edit anything afterwards.</Text>
        {PLAN_TEMPLATES.map((t) => (
          <Pressable key={t.id} style={({ pressed }) => [styles.option, pressed && styles.pressed]} onPress={() => fromTemplate(t)}>
            <View style={styles.flex1}>
              <Text style={styles.body}>{t.name}</Text>
              <Text style={styles.muted}>{t.summary}</Text>
            </View>
            <Icon name="chevronRight" size={20} color={color.textMuted} />
          </Pressable>
        ))}
        <Pressable style={({ pressed }) => [styles.option, pressed && styles.pressed]} onPress={() => fromTemplate(null)}>
          <View style={styles.flex1}>
            <Text style={styles.body}>Blank plan</Text>
            <Text style={styles.muted}>Build your own from scratch</Text>
          </View>
          <Icon name="plus" size={20} color={color.textMuted} />
        </Pressable>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
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
});
