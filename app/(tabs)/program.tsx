import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, ChipRow, PrimaryButton, Screen, SectionHeader, Sheet } from '@/components';
import { useLive } from '@/db/live';
import { addDay, createRoutine, getDays, getSlots, listRoutines, plannedWeeklySets, setActiveRoutine } from '@/db/repositories/program';
import { VolumeList } from '@/features/program/VolumeList';
import { color, font, hit, radius, space } from '@/theme/tokens';

export default function ProgramScreen() {
  const routines = useLive(listRoutines, ['routine']);
  const active = routines.find((r) => r.active === 1);
  const [viewId, setViewId] = useState<string | null>(null);
  const routine = routines.find((r) => r.id === viewId) ?? active ?? routines[0];

  const detail = useLive(
    () =>
      routine
        ? { days: getDays(routine.id).map((d) => ({ day: d, slots: getSlots(d.id) })), weekly: plannedWeeklySets(routine.id) }
        : { days: [], weekly: {} },
    ['routine_day', 'routine_slot', 'exercise'],
    [routine?.id],
  );

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  return (
    <Screen title="Program" subtitle="Stable exercises, progressed week to week. Nothing here changes on its own.">
      {routines.length > 1 ? (
        <ChipRow options={routines.map((r) => ({ label: r.active ? `${r.name} ●` : r.name, value: r.id }))} value={routine?.id ?? null} onChange={setViewId} fill={false} />
      ) : null}

      {routine ? (
        <>
          <SectionHeader
            title={routine.active ? 'Active routine' : 'Routine'}
            right={routine.active ? undefined : <PrimaryButton label="Make active" tone="neutral" onPress={() => setActiveRoutine(routine.id)} />}
          />
          <Text style={styles.routineName}>{routine.name}</Text>

          {detail.days.map(({ day, slots }) => (
            <Card key={day.id} onPress={() => router.push(`/program/${day.id}`)}>
              <Text style={styles.dayLabel}>{day.label}</Text>
              <Text style={styles.muted} numberOfLines={3}>
                {slots.length ? slots.map((s) => s.exercise.name).join(' · ') : 'No exercises yet — tap to add.'}
              </Text>
            </Card>
          ))}
          <PrimaryButton
            label="Add a day"
            tone="ghost"
            onPress={() => {
              const d = addDay(routine.id, `Day ${detail.days.length + 1}`);
              router.push(`/program/${d.id}`);
            }}
          />

          <SectionHeader title="Weekly hard sets (planned)" />
          <VolumeList weekly={detail.weekly} />
        </>
      ) : null}

      <PrimaryButton label="New routine" tone="neutral" style={styles.gap} onPress={() => setCreating(true)} />

      <Sheet visible={creating} onClose={() => setCreating(false)} title="New routine">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Name"
          placeholderTextColor={color.textFaint}
          style={styles.input}
          autoFocus
        />
        <Text style={styles.muted}>It starts inactive — your current routine keeps running until you switch.</Text>
        <PrimaryButton
          label="Create"
          style={styles.gap}
          disabled={!name.trim()}
          onPress={() => {
            const r = createRoutine(name, 1);
            const d = addDay(r.id, 'Day 1');
            setName('');
            setCreating(false);
            setViewId(r.id);
            router.push(`/program/${d.id}`);
          }}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  routineName: { ...font.heading, color: color.text, marginBottom: space.md },
  dayLabel: { ...font.body, color: color.text, fontWeight: '600' },
  muted: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  gap: { marginTop: space.lg },
  input: {
    ...font.body,
    color: color.text,
    backgroundColor: color.surfaceHigh,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: hit.default,
    marginBottom: space.sm,
  },
});
