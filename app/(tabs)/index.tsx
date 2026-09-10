import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, ChipRow, EmptyState, PrimaryButton, Screen, SectionHeader } from '@/components';
import { useLive } from '@/db/live';
import { getWeighIn } from '@/db/repositories/body';
import { getActiveRoutine, getDays, getSlots, resolveNextDay } from '@/db/repositories/program';
import { getActiveSession, getSessionSets, startSession } from '@/db/repositories/sessions';
import { suggestFor, suggestionContext, VERDICT_LABEL } from '@/features/session/prescription';
import { fmtDayLabel, todayISO } from '@/lib/date';
import { kg } from '@/lib/format';
import { color, font, layout, space } from '@/theme/tokens';

export default function Today() {
  const insets = useSafeAreaInsets();
  const state = useLive(() => {
    const active = getActiveSession();
    const routine = getActiveRoutine();
    return {
      active,
      activeSets: active ? getSessionSets(active.id).filter((s) => s.isWarmup === 0).length : 0,
      routine,
      days: routine ? getDays(routine.id) : [],
      next: routine ? resolveNextDay(routine.id) : undefined,
      weighedToday: getWeighIn(todayISO()) !== undefined,
    };
  }, ['session', 'set_log', 'routine', 'routine_day', 'weigh_in']);

  const [pickedDayId, setPickedDayId] = useState<string | null>(null);
  const day = state.days.find((d) => d.id === pickedDayId) ?? state.next;

  const preview = useLive(
    () => {
      if (!day) return [];
      const ctx = suggestionContext();
      return getSlots(day.id).map((s) => ({ slot: s, suggestion: suggestFor(s.exercise, s, undefined, ctx) }));
    },
    ['routine_slot', 'exercise', 'exercise_session_stat', 'exercise_link', 'equipment', 'session'],
    [day?.id],
  );

  const settingsLink = <PrimaryButton label="Settings" tone="ghost" onPress={() => router.push('/settings')} />;

  if (state.active) {
    const activeDay = state.days.find((d) => d.id === state.active?.routineDayId);
    return (
      <View style={styles.flex}>
        <Screen title="Today" subtitle={fmtDayLabel(state.active.date)} right={settingsLink}>
          <Card tone="accent">
            <Text style={styles.cardTitle}>{activeDay?.label ?? 'Workout'} in progress</Text>
            <Text style={styles.muted}>
              {state.activeSets} {state.activeSets === 1 ? 'set' : 'sets'} logged. Everything is saved — pick up where you left off.
            </Text>
          </Card>
        </Screen>
        <View style={[styles.actionBar, { paddingBottom: space.md }]}>
          <PrimaryButton label="Resume workout" size="gym" onPress={() => router.push(`/session/${state.active?.id ?? ''}`)} />
        </View>
      </View>
    );
  }

  if (!state.routine || !day) {
    return (
      <Screen title="Today" right={settingsLink}>
        <EmptyState message="No active routine. Pick or build one in Program." actionLabel="Open Program" onAction={() => router.push('/program')} />
        <PrimaryButton label="Start an empty workout" tone="neutral" onPress={() => router.push(`/session/${startSession(null).id}`)} />
      </Screen>
    );
  }

  return (
    <View style={styles.flex}>
      <Screen title={day.label} subtitle={state.routine.name} right={settingsLink}>
        {!state.weighedToday ? (
          <Card onPress={() => router.push('/body')}>
            <Text style={styles.link}>Log this morning's weight ›</Text>
          </Card>
        ) : null}

        {state.days.length > 1 ? (
          <ChipRow
            options={state.days.map((d) => ({ label: d.label.split(' — ')[0] ?? d.label, value: d.id }))}
            value={day.id}
            onChange={setPickedDayId}
            fill={false}
          />
        ) : null}

        <SectionHeader title={`${preview.length} exercises`} />
        {preview.map(({ slot, suggestion }) => (
          <Card key={slot.id}>
            <View style={styles.rowBetween}>
              <Text style={styles.name} numberOfLines={1}>
                {slot.exercise.name}
              </Text>
              <Text style={styles.weight}>{suggestion.verdict === 'CALIBRATE' ? '—' : kg(suggestion.weight)}</Text>
            </View>
            <Text style={styles.muted}>
              {suggestion.sets} × {suggestion.repTarget[0]}–{suggestion.repTarget[1]} @ RIR {suggestion.targetRIR}
              {slot.supersetGroup ? `  ·  superset ${slot.supersetGroup}` : ''}  ·  {VERDICT_LABEL[suggestion.verdict]}
            </Text>
          </Card>
        ))}
        <PrimaryButton label="Start an empty workout instead" tone="ghost" onPress={() => router.push(`/session/${startSession(null).id}`)} />
      </Screen>
      <View style={[styles.actionBar, { paddingBottom: Math.max(space.md, insets.bottom * 0) + space.md }]}>
        <PrimaryButton label={`Start ${day.label.split(' — ')[0] ?? 'workout'}`} size="gym" onPress={() => router.push(`/session/${startSession(day.id).id}`)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    backgroundColor: color.bg,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md },
  name: { ...font.body, color: color.text, flex: 1, fontWeight: '600' },
  weight: { ...font.heading, ...font.numeric, color: color.text },
  muted: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  cardTitle: { ...font.heading, color: color.text, marginBottom: space.xs },
  link: { ...font.body, color: color.text },
});
