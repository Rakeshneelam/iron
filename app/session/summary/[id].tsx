import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, confirm, EmptyState, Icon, IconButton, ListCard, Pill, PrimaryButton, Screen, SectionHeader, StatTile, TextField, toast } from '@/components';
import { CATALOG_BY_ID } from '@/data/catalog';
import { useLive } from '@/db/live';
import { countFinishedWorkouts, recentWorkouts, sessionRecords } from '@/db/repositories/progress';
import { deleteSession, getSessionSummary, isNoTraining, reopenSession, setSessionFeedback, type SetRow } from '@/db/repositories/sessions';
import { workoutMilestone } from '@/engine/records';
import { EditSetSheet } from '@/features/session/EditSetSheet';
import { fmtSet } from '@/features/session/prescription';
import { STATUS_LABEL, STATUS_TONE } from '@/features/session/status';
import { BatteryCard } from '@/features/settings/BatteryCard';
import { minutesLabel } from '@/features/warmup/labels';
import { fmtDayLabel } from '@/lib/date';
import { signed } from '@/lib/format';
import { color, font, gap, hit, radius, space } from '@/theme/tokens';

/** Session RPE, in words — easier than a 1–10 scale after a hard session. */
const EFFORT = [
  { label: 'Easy', value: 5 },
  { label: 'Good', value: 7 },
  { label: 'Hard', value: 8 },
  { label: 'All-out', value: 10 },
];
const measureOf = (exerciseId: string) => CATALOG_BY_ID.get(exerciseId)?.measure ?? 'reps';

/**
 * A workout, whether you just finished it or found it in history.
 *
 * Those are different visits and the screen now says which. Finishing keeps
 * "Workout saved" and Done → Today; browsing an old one gets its own date as the
 * title and Back to wherever you came from (UX-09).
 *
 * Every exercise expands into its actual sets, warm-ups included, each opening the
 * same EditSetSheet the session screen uses. Correcting one recomputes that
 * session's aggregates and nothing else: its timestamps, its status and the plan's
 * position are untouched, and a workout open today is not involved.
 */
export default function SummaryScreen() {
  const params = useLocalSearchParams<{ id: string; just?: string }>();
  const id = String(params.id);
  /** Set only by the finish path. Absent means someone navigated here to look. */
  const justFinished = params.just === '1';
  const summary = useLive(() => getSessionSummary(id), ['session', 'session_exercise', 'set_log', 'exercise', 'exercise_session_stat'], [id]);
  const records = useLive(() => sessionRecords(id), ['set_log', 'session', 'exercise'], [id]);
  const milestone = useLive(
    () => (justFinished && recentWorkouts(1)[0]?.session.id === id ? workoutMilestone(countFinishedWorkouts()) : null),
    ['session'],
    [id, justFinished],
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<SetRow | null>(null);

  /** Back to whoever pushed us; a cold link has no caller, so it falls back. */
  const back = () => (router.canGoBack() ? router.back() : router.replace('/history'));

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
      message: isNoTraining(s.status) ? undefined : `${summary.hardSets} sets will be removed from your history.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => {
        deleteSession(id);
        toast('Workout deleted');
        if (router.canGoBack()) router.back();
        else router.replace('/');
      },
    });

  // Seconds held are not reps. Adding a 600-second plank into a rep count produced
  // a "Reps" figure nobody could act on (UX-09).
  const repsOnly = summary.perExercise.filter((e) => measureOf(e.exerciseId) === 'reps');
  const timed = summary.perExercise.filter((e) => measureOf(e.exerciseId) === 'time');
  const totalReps = repsOnly.reduce((t, e) => t + e.rows.filter((r) => r.isWarmup === 0).reduce((a, r) => a + r.reps, 0), 0);
  const totalSeconds = timed.reduce((t, e) => t + e.rows.filter((r) => r.isWarmup === 0).reduce((a, r) => a + r.reps, 0), 0);

  const title = justFinished ? (isNoTraining(s.status) ? STATUS_LABEL[s.status] : 'Workout saved') : (summary.session.routineDayId ? undefined : 'Workout');

  const perExercise = (
    <>
      <SectionHeader title="What you did" hint="Tap an exercise to see and fix its sets." />
      <ListCard>
        {summary.perExercise.map((e, i) => {
          const measure = measureOf(e.exerciseId);
          const delta = e.prevBestE1rm === null ? null : e.bestE1rm - e.prevBestE1rm;
          const open = expanded === e.exerciseId;
          return (
            <View key={e.exerciseId} style={[i > 0 && styles.divider]}>
              <Pressable
                style={styles.row}
                onPress={() => setExpanded(open ? null : e.exerciseId)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={`${e.name}, ${e.sets} sets, best ${fmtSet(measure, e.topWeight, e.topReps)}. ${open ? 'Hide' : 'Show'} its sets.`}
              >
                <View style={styles.flex1}>
                  <Text style={styles.name} numberOfLines={1}>
                    {e.name}
                  </Text>
                  <Text style={styles.muted}>
                    {e.sets} {e.sets === 1 ? 'set' : 'sets'}, best {fmtSet(measure, e.topWeight, e.topReps)}
                  </Text>
                </View>
                {/* An estimated 1RM means nothing for a timed hold, so it is not shown. */}
                {measure === 'reps' ? (
                  <Text style={[styles.delta, { color: delta !== null && delta > 0.05 ? color.positive : color.textMuted }]}>
                    {delta === null ? 'first' : `${signed(delta)} kg`}
                  </Text>
                ) : null}
                <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} color={color.textFaint} />
              </Pressable>
              {open
                ? e.rows.map((r, n) => (
                    <Pressable
                      key={r.id}
                      style={styles.setRow}
                      onPress={() => setEditing(r)}
                      accessibilityRole="button"
                      accessibilityLabel={`${r.isWarmup === 1 ? 'Warm-up' : `Set ${n + 1}`}: ${fmtSet(measure, r.weight, r.reps)}. Tap to correct.`}
                    >
                      <Text style={styles.setIdx}>{r.isWarmup === 1 ? 'warm-up' : `set ${n + 1}`}</Text>
                      <Text style={[styles.setVal, styles.flex1]}>{fmtSet(measure, r.weight, r.reps)}</Text>
                      {r.painFlag === 1 ? <Text style={styles.pain}>pain</Text> : null}
                      {r.isWarmup === 0 && measure === 'reps' ? <Text style={styles.muted}>RIR {r.rir}</Text> : null}
                      <Icon name="edit" size={16} color={color.textMuted} />
                    </Pressable>
                  ))
                : null}
            </View>
          );
        })}
      </ListCard>
      <Text style={styles.legend}>Change is in estimated 1-rep max vs last time.</Text>
    </>
  );

  return (
    <Screen
      title={title ?? fmtDayLabel(s.date)}
      subtitle={justFinished ? `${fmtDayLabel(s.date)}, ${summary.durationMin} minutes` : `${summary.durationMin} minutes`}
      // Just finished: Done goes to Today. Browsing: Back goes where you came from.
      back={justFinished ? undefined : back}
      // The cool-down used to be offered here, after the workout had been filed.
      // It is a stage of the workout now — between the last lift and this screen
      // (features/session/stages) — so by the time you are reading a summary it
      // has already been done or skipped, and offering it again would be asking
      // twice.
      dock={justFinished ? <PrimaryButton label="Done" size="gym" onPress={() => router.replace('/')} /> : undefined}
    >
      <View style={styles.pills}>
        <Pill label={STATUS_LABEL[s.status]} tone={STATUS_TONE[s.status]} />
        {milestone ? <Pill label={milestone} tone="muted" /> : null}
      </View>
      {isNoTraining(s.status) ? (
        <Text style={styles.note}>
          {s.status === 'rest'
            ? 'A day off, on purpose. Your plan is exactly where it was — this costs you nothing.'
            : 'This planned workout did not happen. Your plan moved on to the next day.'}
        </Text>
      ) : (
        <>
          <View style={styles.tiles}>
            <StatTile label="Hard sets" value={String(summary.hardSets)} />
            <StatTile label="Volume, kg" value={summary.totalTonnage >= 10000 ? `${(summary.totalTonnage / 1000).toFixed(1)}k` : String(Math.round(summary.totalTonnage))} />
            <StatTile label="New bests" value={String(records.length)} tone={records.length ? 'positive' : 'default'} />
          </View>
          {/* Seconds held are not reps: timed work gets its own sentence, never a sum with reps (UX-09). */}
          {totalSeconds > 0 ? (
            <Text style={styles.note}>
              {totalReps > 0 ? `${totalReps} reps, plus ${minutesLabel(totalSeconds)} of timed work.` : `${minutesLabel(totalSeconds)} of timed work.`}
            </Text>
          ) : null}
          {summary.progress.planned > 0 ? (
            <Text style={styles.note}>
              {summary.progress.done} of {summary.progress.planned} planned exercises done
              {summary.progress.skipped ? ` · ${summary.progress.skipped} skipped` : ''}
            </Text>
          ) : null}

          {records.length ? (
            <Card tone="positive" style={styles.records}>
              <View style={styles.row}>
                <Icon name="star" size={18} color={color.positive} />
                <Text style={[styles.name, styles.flex1]}>
                  {records.length === 1 ? 'One lift went past its best' : `${records.length} lifts went past their best`}
                </Text>
              </View>
              {records.map((r) => (
                <Text key={r.exerciseId} style={styles.recordLine}>
                  <Text style={styles.recordName}>{r.name}</Text> — {r.events.map((e) => e.label).join(', ')}
                </Text>
              ))}
            </Card>
          ) : null}

          {perExercise}

          <SectionHeader title="How did it feel?" />
          <ChipRow options={EFFORT} value={s.sessionRpe} onChange={(v) => setSessionFeedback(id, { sessionRpe: v })} />
          <TextField
            value={s.notes ?? ''}
            onCommit={(v) => setSessionFeedback(id, { notes: v || null })}
            placeholder="Notes (optional)"
            multiline
            style={styles.input}
          />
          {justFinished ? (
            <View style={styles.aside}>
              <BatteryCard />
            </View>
          ) : null}
        </>
      )}

      <View style={styles.secondary}>
        {!isNoTraining(s.status) ? <PrimaryButton label="Reopen" tone="ghost" icon={<Icon name="undo" size={16} color={color.textMuted} />} style={styles.flex1} onPress={reopen} /> : null}
        {/* Permanent deletion, kept in the corner it belongs in. */}
        <IconButton icon="trash" label="Delete" accessibilityLabel="Delete this workout permanently" onPress={remove} />
      </View>
      <Text style={styles.legend}>
        {justFinished ? 'Finished by mistake? Reopen puts you back in the workout.' : 'Correcting a set here leaves this workout’s date and status exactly as they are.'}
      </Text>

      {/* The same editor the session screen uses. Corrections rebuild this
          session's aggregates and touch nothing else. */}
      <EditSetSheet set={editing} step={2.5} correcting onClose={() => setEditing(null)} />

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
  records: { gap: space.sm },
  recordLine: { ...font.caption, fontSize: 14, lineHeight: 20, color: color.textMuted },
  recordName: { color: color.text, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, minHeight: hit.gym },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: hit.default,
    paddingLeft: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  setIdx: { ...font.caption, color: color.textMuted, minWidth: 56 },
  setVal: { ...font.body, ...font.numeric, color: color.text, fontWeight: '600' },
  pain: { ...font.caption, color: color.danger },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  name: { ...font.body, color: color.text, fontWeight: '600' },
  muted: { ...font.caption, ...font.numeric, color: color.textMuted, marginTop: 2 },
  delta: { ...font.label, ...font.numeric },
  legend: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  aside: { marginTop: gap.section },
  secondary: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
});
