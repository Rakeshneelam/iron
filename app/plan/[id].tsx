import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, confirm, EmptyState, Icon, IconButton, Pill, PrimaryButton, Screen, SectionHeader, Stepper, TextField, toast } from '@/components';
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
    <Screen title="Edit plan" right={<PrimaryButton label="Done" tone="ghost" onPress={() => router.back()} />}>
      <TextField
        value={routine.name}
        onCommit={(v) => v && renameRoutine(id, v)}
        style={styles.nameInput}
        placeholder="Plan name"
        accessibilityLabel="Plan name"
      />
      <View style={styles.statusRow}>
        {routine.active ? <Pill label="Active plan" tone="accent" /> : <PrimaryButton label="Use this plan" onPress={activate} />}
      </View>

      <Card style={styles.gapTop}>
        <Stepper label="Workouts per week" value={routine.daysPerWeek} step={1} min={1} max={7} onChange={(v) => setDaysPerWeek(id, v)} />
        <Text style={styles.hint}>Days run in order, one after another — a missed day waits for you instead of being skipped.</Text>
      </Card>

      <SectionHeader title={`Days · ${detail.days.length}`} />
      {detail.days.map(({ day, slots }, i) => (
        <Card key={day.id} onPress={() => router.push(`/program/${day.id}`)}>
          <View style={styles.dayRow}>
            <View style={styles.flex1}>
              <Text style={styles.dayLabel}>{day.label}</Text>
              <Text style={styles.muted} numberOfLines={2}>
                {slots.length ? slots.map((s) => s.exercise.name).join(' · ') : 'No exercises yet — tap to add'}
              </Text>
            </View>
            <IconButton icon="chevronUp" accessibilityLabel={`Move ${day.label} earlier`} disabled={i === 0} onPress={() => moveDay(day.id, -1)} />
            <IconButton icon="chevronDown" accessibilityLabel={`Move ${day.label} later`} disabled={i === detail.days.length - 1} onPress={() => moveDay(day.id, 1)} />
          </View>
        </Card>
      ))}
      <PrimaryButton
        label="Add a day"
        tone="ghost"
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
      <View style={styles.actions}>
        <IconButton
          icon="copy"
          label="Duplicate"
          tone="neutral"
          accessibilityLabel="Duplicate this plan"
          onPress={() => {
            const copy = duplicateRoutine(id);
            if (copy) {
              toast(`Created ${copy.name}`);
              router.replace(`/plan/${copy.id}`);
            }
          }}
        />
        <IconButton icon="archive" label="Archive" tone="neutral" accessibilityLabel="Archive this plan" onPress={archive} />
        <IconButton
          icon="trash"
          label="Delete"
          tone="neutral"
          accessibilityLabel="Delete this plan"
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
      </View>
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
  statusRow: { flexDirection: 'row', marginTop: space.md },
  gapTop: { marginTop: space.lg },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dayLabel: { ...font.body, color: color.text, fontWeight: '600' },
  muted: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', justifyContent: 'space-around' },
});
