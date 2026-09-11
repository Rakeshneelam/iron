import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, ChipRow, confirm, EmptyState, Icon, Pill, PrimaryButton, Screen, SectionHeader, StatTile, toast } from '@/components';
import { useLive } from '@/db/live';
import { deleteSession, getSessionSummary, reopenSession, setSessionFeedback } from '@/db/repositories/sessions';
import { STATUS_LABEL, STATUS_TONE } from '@/features/session/status';
import { BatteryCard } from '@/features/settings/BatteryCard';
import { fmtDayLabel } from '@/lib/date';
import { kgNum, signed } from '@/lib/format';
import { color, font, hit, radius, space } from '@/theme/tokens';

/** Session RPE, in words — easier than a 1–10 scale after a hard session. */
const EFFORT = [
  { label: 'Easy', value: 5 },
  { label: 'Good', value: 7 },
  { label: 'Hard', value: 8 },
  { label: 'All-out', value: 10 },
];

/** Facts only: volume, change vs last time, e1RM highs. No celebration, no streak. */
export default function SummaryScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id);
  const summary = useLive(() => getSessionSummary(id), ['session', 'set_log', 'exercise_session_stat'], [id]);
  const [notes, setNotes] = useState(() => summary?.session.notes ?? '');

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
      <Pill label={STATUS_LABEL[s.status]} tone={STATUS_TONE[s.status]} />
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

          <SectionHeader title="How did it feel?" />
          <ChipRow options={EFFORT} value={s.sessionRpe} onChange={(v) => setSessionFeedback(id, { sessionRpe: v })} />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            onEndEditing={() => setSessionFeedback(id, { notes: notes.trim() || null })}
            placeholder="Notes (optional)"
            placeholderTextColor={color.textFaint}
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
                  {e.isPR ? <Icon name="star" size={16} color={color.positive} /> : null}
                  <Text style={[styles.delta, { color: delta === null ? color.textMuted : delta > 0.05 ? color.positive : color.textMuted }]}>
                    {delta === null ? 'first' : `${signed(delta)} kg`}
                  </Text>
                </View>
              );
            })}
          </Card>
          <Text style={styles.legend}>Change is in estimated 1-rep max vs last time. ★ = best ever.</Text>
          <BatteryCard />
        </>
      )}

      <PrimaryButton label="Done" size="gym" style={styles.gapTop} onPress={() => router.replace('/')} />
      <View style={styles.secondary}>
        {s.status !== 'skipped' ? (
          <PrimaryButton label="Reopen" tone="ghost" icon={<Icon name="undo" size={16} />} style={styles.flex1} onPress={reopen} />
        ) : null}
        <PrimaryButton label="Delete" tone="ghost" icon={<Icon name="trash" size={16} color={color.textMuted} />} style={styles.flex1} onPress={remove} />
      </View>
      <Text style={styles.legend}>Finished by mistake? Reopen puts you back in the workout.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
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
