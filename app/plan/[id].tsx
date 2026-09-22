import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, confirm, EmptyState, Icon, IconButton, ListCard, ListRow, PrimaryButton, Screen, SectionHeader, Stepper, TextField, toast } from '@/components';
import { useLive } from '@/db/live';
import {
  addDay,
  archiveRoutine,
  deleteRoutine,
  duplicateRoutine,
  getActiveRoutine,
  getDays,
  getRoutine,
  getSlots,
  moveDay,
  plannedWeeklySets,
  renameRoutine,
  setActiveRoutine,
  setDaysPerWeek,
} from '@/db/repositories/program';
import { VolumeList } from '@/features/program/VolumeList';
import { color, font, hit, radius, space } from '@/theme/tokens';

/** One plan: name, schedule, days (tap to edit), and plan-level actions. */
export default function PlanScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id);
  const routine = useLive(() => getRoutine(id), ['routine'], [id]);
  const detail = useLive(
    () => ({ days: getDays(id).map((d) => ({ day: d, slots: getSlots(d.id) })), weekly: plannedWeeklySets(id) }),
    ['routine_day', 'routine_slot', 'exercise'],
    [id],
  );
  const [showVolume, setShowVolume] = useState(false);

  if (!routine) {
    return (
      <Screen title="Plan">
        <EmptyState message="This plan no longer exists." actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const activate = () => {
    const prev = getActiveRoutine();
    setActiveRoutine(id);
    toast(`${routine.name} is now your plan`, prev ? { label: 'Undo', onPress: () => setActiveRoutine(prev.id) } : undefined);
  };

  const archive = () => {
    const wasActive = routine.active === 1;
    archiveRoutine(id, true);
    toast(`Archived ${routine.name}`, {
      label: 'Undo',
      onPress: () => (wasActive ? setActiveRoutine(id) : archiveRoutine(id, false)),
    });
    router.back();
  };

  return (
    <Screen
      title="Edit plan"
      subtitle={routine.active ? 'Your active plan' : 'Not in use'}
      back
      dock={routine.active ? undefined : <PrimaryButton label="Use this plan" size="gym" onPress={activate} />}
    >
      <TextField
        value={routine.name}
        onCommit={(v) => v && renameRoutine(id, v)}
        style={styles.nameInput}
        placeholder="Plan name"
        accessibilityLabel="Plan name"
      />

      <Card style={styles.gapTop}>
        <Stepper label="Workouts per week" value={routine.daysPerWeek} step={1} min={1} max={7} onChange={(v) => setDaysPerWeek(id, v)} />
        <Text style={styles.hint}>Days run in order, one after another — a missed day waits for you instead of being skipped.</Text>
      </Card>

      <SectionHeader title={`Days · ${detail.days.length}`} />
      <ListCard>
        {detail.days.map(({ day, slots }, i) => (
          <ListRow
            key={day.id}
            divider={i > 0}
            title={day.label}
            sub={slots.length ? slots.map((s) => s.exercise.name).join(' · ') : 'No exercises yet — tap to add'}
            chevron={false}
            onPress={() => router.push(`/program/${day.id}`)}
            right={
              <View style={styles.dayRow}>
                <IconButton icon="chevronUp" accessibilityLabel={`Move ${day.label} earlier`} disabled={i === 0} onPress={() => moveDay(day.id, -1)} />
                <IconButton icon="chevronDown" accessibilityLabel={`Move ${day.label} later`} disabled={i === detail.days.length - 1} onPress={() => moveDay(day.id, 1)} />
              </View>
            }
          />
        ))}
      </ListCard>
      <PrimaryButton
        label="Add a day"
        tone="neutral"
        icon={<Icon name="plus" size={16} />}
        onPress={() => router.push(`/program/${addDay(id, `Day ${detail.days.length + 1}`).id}`)}
      />

      <Pressable style={styles.toggle} onPress={() => setShowVolume(!showVolume)} accessibilityRole="button">
        <SectionHeader title="Weekly sets per muscle" />
        <Icon name={showVolume ? 'chevronUp' : 'chevronDown'} size={18} color={color.textMuted} />
      </Pressable>
      {showVolume ? (
        <>
          <Text style={styles.hint}>Green is the productive range for most people. Grey is below the minimum; red is more than most recover from.</Text>
          <VolumeList weekly={detail.weekly} />
        </>
      ) : null}

      <SectionHeader title="Plan" />
      <View style={styles.pair}>
        <PrimaryButton
          label="Duplicate"
          tone="neutral"
          icon={<Icon name="copy" size={16} />}
          style={styles.flex1}
          onPress={() => {
            const copy = duplicateRoutine(id);
            if (copy) {
              toast(`Created ${copy.name}`);
              router.replace(`/plan/${copy.id}`);
            }
          }}
        />
        <PrimaryButton label="Archive" tone="neutral" icon={<Icon name="archive" size={16} />} style={styles.flex1} onPress={archive} />
      </View>
      <PrimaryButton
        label="Delete plan"
        tone="dangerOutline"
        icon={<Icon name="trash" size={16} color={color.danger} />}
        style={styles.gapTop}
        onPress={() =>
          confirm({
            title: `Delete ${routine.name}?`,
            message: 'Your workout history is kept, but those workouts lose their day names. Archive instead to keep everything.',
            confirmLabel: 'Delete',
            destructive: true,
            onConfirm: () => {
              deleteRoutine(id);
              toast(`Deleted ${routine.name}`);
              router.back();
            },
          })
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  nameInput: {
    ...font.heading,
    color: color.text,
    backgroundColor: color.surfaceHigh,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: hit.gym,
  },
  pair: { flexDirection: 'row', gap: space.sm },
  gapTop: { marginTop: space.lg },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  dayRow: { flexDirection: 'row', alignItems: 'center' },
  muted: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
