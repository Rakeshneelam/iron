import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, confirm, EmptyState, Icon, Pill, PrimaryButton, Screen, SectionHeader, StatTile, TextField, toast } from '@/components';
import { useLive } from '@/db/live';
import { getExercise } from '@/db/repositories/exercises';
import { countFinishedWorkouts, recentWorkouts, sessionRecords } from '@/db/repositories/progress';
import { deleteSession, getSessionSummary, reopenSession, setSessionFeedback } from '@/db/repositories/sessions';
import { useSettings } from '@/db/repositories/settings';
import { cooldown, type CooldownLength } from '@/engine/recovery';
import { workoutMilestone } from '@/engine/records';
import { drillKit } from '@/features/profile';
import { STATUS_LABEL, STATUS_TONE } from '@/features/session/status';
import { BatteryCard } from '@/features/settings/BatteryCard';
import { minutesLabel } from '@/features/warmup/labels';
import { RoutineSheet } from '@/features/warmup/RoutineSheet';
import { fmtDayLabel } from '@/lib/date';
import { signed } from '@/lib/format';
import { color, font, hit, radius, space } from '@/theme/tokens';

/** Session RPE, in words — easier than a 1–10 scale after a hard session. */
const EFFORT = [
  { label: 'Easy', value: 5 },
  { label: 'Good', value: 7 },
  { label: 'Hard', value: 8 },
  { label: 'All-out', value: 10 },
];
const LENGTHS: { label: string; value: CooldownLength }[] = [
  { label: 'Short', value: 'short' },
  { label: 'Standard', value: 'standard' },
];

/** Facts only: volume, records, change vs last time. Subtle — no confetti, no streak. */
export default function SummaryScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id);
  const settings = useSettings();
  const summary = useLive(() => getSessionSummary(id), ['session', 'session_exercise', 'set_log', 'exercise', 'exercise_session_stat'], [id]);
  const records = useLive(() => sessionRecords(id), ['set_log', 'session', 'exercise'], [id]);
  const milestone = useLive(
    () => (recentWorkouts(1)[0]?.session.id === id ? workoutMilestone(countFinishedWorkouts()) : null),
    ['session'],
    [id],
  );
  const [length, setLength] = useState<CooldownLength>('short');
  const [cooling, setCooling] = useState(false);
  const kit = drillKit(settings);
  const routine = useMemo(
    () => cooldown((summary?.perExercise ?? []).map((e) => ({ primary: getExercise(e.exerciseId)?.primaryMuscles ?? [], sets: e.sets })), length, kit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summary?.perExercise.length, length, settings.tools, settings.equipmentPreset],
  );

  if (!summary) {
    return (
      <Screen title="Workout">
        <EmptyState message="This workout no longer exists." actionLabel="Back to Today" onAction={() => router.replace('/')} />
      </Screen>
    );
  }

  const s = summary.session;
  const reopen = () => {
    if (reopenSession(id)) router.replace(`/session/${id}`);
    else toast('Finish or cancel the workout that is open first.');
  };
  const remove = () =>
    confirm({
      title: 'Delete this workout?',
      message: s.status === 'skipped' ? undefined : `${summary.hardSets} sets will be removed from your history.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => {
        deleteSession(id);
        toast('Workout deleted');
        router.replace('/');
      },
    });

  return (
    <Screen title={s.status === 'skipped' ? 'Skipped day' : 'Workout saved'} subtitle={`${fmtDayLabel(s.date)} · ${summary.durationMin} min`}>
      <View style={styles.pills}>
        <Pill label={STATUS_LABEL[s.status]} tone={STATUS_TONE[s.status]} />
        {milestone ? <Pill label={milestone} tone="muted" /> : null}
      </View>
      {s.status === 'skipped' ? (
        <Text style={styles.note}>This day was skipped on purpose. It moved your plan on to the next day.</Text>
      ) : (
        <>
          <View style={styles.tiles}>
            <StatTile label="Volume" value={`${Math.round(summary.totalTonnage)} kg`} />
            <StatTile label="Sets" value={String(summary.hardSets)} />
            <StatTile label="Reps" value={String(summary.totalReps)} />
          </View>
          {summary.progress.planned > 0 ? (
            <Text style={styles.note}>
              {summary.progress.done} of {summary.progress.planned} planned exercises done
              {summary.progress.skipped ? ` · ${summary.progress.skipped} skipped` : ''}
            </Text>
          ) : null}

          {records.length ? (
            <>
              <SectionHeader title="Personal records" />
              <Card style={styles.list}>
                {records.map((r, i) => (
                  <View key={r.exerciseId} style={[styles.row, i > 0 && styles.divider]}>
                    <Icon name="star" size={16} color={color.positive} />
                    <View style={styles.flex1}>
                      <Text style={styles.name}>{r.name}</Text>
                      <Text style={styles.muted}>{r.events.map((e) => e.label).join(' · ')}</Text>
                    </View>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {routine.items.length ? (
            <Card onPress={() => setCooling(true)}>
              <View style={styles.row}>
                <Icon name="moon" size={20} color={color.accent} />
                <View style={styles.flex1}>
                  <Text style={styles.name}>Cool-down · {minutesLabel(routine.seconds)}</Text>
                  <Text style={styles.muted}>Optional — easy stretches for what you trained</Text>
                </View>
                <Icon name="chevronRight" size={18} color={color.textMuted} />
              </View>
            </Card>
          ) : null}

          <SectionHeader title="How did it feel?" />
          <ChipRow options={EFFORT} value={s.sessionRpe} onChange={(v) => setSessionFeedback(id, { sessionRpe: v })} />
          <TextField
            value={s.notes ?? ''}
            onCommit={(v) => setSessionFeedback(id, { notes: v || null })}
            placeholder="Notes (optional)"
            multiline
            style={styles.input}
          />

          <SectionHeader title="Per exercise" />
          <Card style={styles.list}>
            {summary.perExercise.map((e, i) => {
              const delta = e.prevBestE1rm === null ? null : e.bestE1rm - e.prevBestE1rm;
              return (
                <View key={e.exerciseId} style={[styles.row, i > 0 && styles.divider]}>
                  <View style={styles.flex1}>
                    <Text style={styles.name} numberOfLines={1}>
                      {e.name}
                    </Text>
                    <Text style={styles.muted}>
                      {e.sets} sets · best {e.topSet}
                    </Text>
                  </View>
                  <Text style={[styles.delta, { color: delta !== null && delta > 0.05 ? color.positive : color.textMuted }]}>
                    {delta === null ? 'first' : `${signed(delta)} kg`}
                  </Text>
                </View>
              );
            })}
          </Card>
          <Text style={styles.legend}>Change is in estimated 1-rep max vs last time.</Text>
          <BatteryCard />
        </>
      )}

      <PrimaryButton label="Done" size="gym" style={styles.gapTop} onPress={() => router.replace('/')} />
      <View style={styles.secondary}>
        {s.status !== 'skipped' ? <PrimaryButton label="Reopen" tone="ghost" icon={<Icon name="undo" size={16} />} style={styles.flex1} onPress={reopen} /> : null}
        <PrimaryButton label="Delete" tone="ghost" icon={<Icon name="trash" size={16} color={color.textMuted} />} style={styles.flex1} onPress={remove} />
      </View>
      <Text style={styles.legend}>Finished by mistake? Reopen puts you back in the workout.</Text>

      <RoutineSheet
        visible={cooling}
        title="Cool-down"
        routine={routine}
        available={kit}
        onClose={() => setCooling(false)}
        modes={{ options: LENGTHS, value: length, onChange: setLength }}
        doneLabel="Done"
        onDone={() => {
          setCooling(false);
          toast('Cool-down done');
        }}
        onSkip={() => setCooling(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  pills: { flexDirection: 'row', gap: space.sm },
  tiles: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  note: { ...font.label, color: color.textMuted, marginTop: space.md },
  input: {
    ...font.body,
    color: color.text,
    backgroundColor: color.surfaceHigh,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: hit.gym,
    marginTop: space.md,
  },
  list: { paddingVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  name: { ...font.body, color: color.text, fontWeight: '600' },
  muted: { ...font.caption, ...font.numeric, color: color.textMuted, marginTop: 2 },
  delta: { ...font.label, ...font.numeric },
  legend: { ...font.caption, color: color.textFaint, marginTop: space.sm },
  gapTop: { marginTop: space.xl },
  secondary: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
});
