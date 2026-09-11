import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, confirm, EmptyState, Icon, IconButton, Pill, PrimaryButton, ReasonLine, Sheet, toast } from '@/components';
import { useLive } from '@/db/live';
import type { Exercise } from '@/db/repositories/exercises';
import { getDay } from '@/db/repositories/program';
import {
  addSessionExercise,
  cancelSession,
  deleteSet,
  finishSession,
  getLastPerformance,
  getSession,
  getSessionPlan,
  getSessionSets,
  insertSet,
  isReadinessDone,
  removeSessionExercise,
  restoreSessionExercise,
  setSessionOrder,
  skipExercise,
  swapSessionExercise,
  unskipExercise,
  type PlannedExercise,
  type SetRow,
} from '@/db/repositories/sessions';
import { useSettings } from '@/db/repositories/settings';
import { ExerciseInfoSheet } from '@/features/exercises/ExerciseInfoSheet';
import { ExercisePicker } from '@/features/exercises/ExercisePicker';
import { EditSetSheet } from '@/features/session/EditSetSheet';
import { Elapsed } from '@/features/session/Elapsed';
import { PlateSheet } from '@/features/session/PlateSheet';
import { readinessFrom, suggestFor, suggestionContext, VERDICT_LABEL, VERDICT_TONE } from '@/features/session/prescription';
import { ReadinessPrompt } from '@/features/session/ReadinessPrompt';
import { RestTimerBar } from '@/features/session/RestTimerBar';
import { SetControls } from '@/features/session/SetControls';
import { fmtClock, fmtDayLabel } from '@/lib/date';
import { kg, kgNum } from '@/lib/format';
import { cancelRest, startRest } from '@/services/restTimer';
import { color, font, hit, layout, radius, space } from '@/theme/tokens';

type ExState = 'done' | 'partial' | 'todo' | 'skipped';
const STATE_COLOR: Record<ExState, string> = {
  done: color.positive,
  partial: color.accent,
  todo: color.surfaceHigh,
  skipped: color.textFaint,
};

type Picker = { mode: 'add' } | { mode: 'swap'; from: PlannedExercise };

export default function SessionScreen() {
  useKeepAwake();
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id);
  const insets = useSafeAreaInsets();
  const settings = useSettings();

  const session = useLive(() => getSession(id), ['session'], [id]);
  const plan = useLive(() => getSessionPlan(id), ['session_exercise', 'set_log', 'exercise'], [id]);
  const sets = useLive(() => getSessionSets(id), ['set_log'], [id]);
  const readinessDone = useLive(() => isReadinessDone(id), ['setting'], [id]);
  const ctx = useMemo(() => suggestionContext(), []);

  const [index, setIndex] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [plates, setPlates] = useState(false);
  const [editing, setEditing] = useState<SetRow | null>(null);
  const [info, setInfo] = useState<Exercise | null>(null);
  const [showWarmups, setShowWarmups] = useState(false);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sets) if (s.isWarmup === 0) m.set(s.exerciseId, (m.get(s.exerciseId) ?? 0) + 1);
    return m;
  }, [sets]);
  const targetOf = (p: PlannedExercise) => p.slot?.targetSets ?? 3;
  const stateOf = (p: PlannedExercise): ExState => {
    const n = counts.get(p.exerciseId) ?? 0;
    return p.skipped ? 'skipped' : n >= targetOf(p) ? 'done' : n > 0 ? 'partial' : 'todo';
  };

  // Resume where you were: the first exercise neither skipped nor finished.
  const firstOpen = useMemo(() => {
    const i = plan.findIndex((p) => stateOf(p) === 'todo' || stateOf(p) === 'partial');
    return i < 0 ? Math.max(0, plan.length - 1) : i;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.length]);
  const idx = Math.min(index ?? firstOpen, Math.max(0, plan.length - 1));
  const current = plan[idx];

  const readiness = useMemo(
    () => readinessFrom(session),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.sleepHours, session?.soreness, session?.stress, session?.bodyweightKg],
  );
  // Prescribe when an exercise is opened — never per keystroke (docs/02).
  const suggestion = useMemo(
    () => (current ? suggestFor(current.exercise, current.slot, readiness, ctx) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current?.exerciseId, current?.slot?.targetSets, readiness, ctx],
  );
  const last = useMemo(
    () => (current ? getLastPerformance(current.exerciseId, id) : undefined),
    [current?.exerciseId, id], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const exSets = current ? sets.filter((s) => s.exerciseId === current.exerciseId) : [];
  const exWork = exSets.filter((s) => s.isWarmup === 0);
  const exWarm = exSets.filter((s) => s.isWarmup === 1);

  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(8);
  const [rir, setRir] = useState(2);
  const [pain, setPain] = useState(false);

  const prefill = () => {
    if (!current || !suggestion) return;
    const lastWork = exWork[exWork.length - 1];
    if (lastWork) {
      setWeight(lastWork.weight);
      setReps(lastWork.reps);
    } else if (suggestion.verdict === 'CALIBRATE') {
      const prevTop = last?.sets.filter((s) => s.isWarmup === 0).reduce((m, s) => Math.max(m, s.weight), 0) ?? 0;
      setWeight(current.slot?.startWeight ?? (prevTop || (current.exercise.loadType === 'barbell' ? 20 : 0)));
      setReps(suggestion.repTarget[1]);
    } else {
      setWeight(suggestion.weight);
      setReps(suggestion.repTarget[0]);
    }
    setRir(suggestion.targetRIR);
    setPain(false);
  };

  useEffect(prefill, [current?.exerciseId, suggestion]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session || session.endedAt) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top + space.xl, paddingHorizontal: layout.screenPadding }]}>
        <EmptyState message="This workout is closed." actionLabel="Back to Today" onAction={() => router.replace('/')} />
      </View>
    );
  }

  const day = session.routineDayId ? getDay(session.routineDayId) : undefined;
  const doneCount = plan.filter((p) => stateOf(p) === 'done' || stateOf(p) === 'skipped').length;
  const totalWork = sets.filter((s) => s.isWarmup === 0).length;
  const step = current?.exercise.loadStep ?? 2.5;
  const restSeconds = current?.slot?.restSeconds ?? 120;
  const target = current ? targetOf(current) : 3;
  const currentState = current ? stateOf(current) : 'todo';
  const next = plan.slice(idx + 1).find((p) => stateOf(p) !== 'done' && stateOf(p) !== 'skipped');
  const nextIdx = next ? plan.indexOf(next) : -1;

  const goTo = (i: number) => {
    setIndex(Math.max(0, Math.min(i, plan.length - 1)));
    setShowWarmups(false);
  };

  const logSet = (asWarmup = false, w = weight, r = reps) => {
    if (!current || !suggestion) return;
    const prev = sets[sets.length - 1];
    const row = insertSet({
      sessionId: id,
      exerciseId: current.exerciseId,
      weight: w,
      reps: r,
      rir: asWarmup ? 5 : rir,
      isWarmup: asWarmup,
      painFlag: asWarmup ? false : pain,
      wasOverride: !asWarmup && suggestion.verdict !== 'CALIBRATE' && Math.abs(w - suggestion.weight) > 1e-6,
      restTakenSeconds: prev ? Math.round((Date.now() - Date.parse(prev.loggedAt)) / 1000) : undefined,
    });
    setIndex(idx); // stay here, even once the target is reached
    if (settings.hapticsEnabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPain(false);
    if (asWarmup) return;
    if (settings.restTimerAutoStart) void startRest(id, restSeconds, current.exercise.name);
    toast(`Set ${exWork.length + 1} logged · ${kgNum(w)} kg × ${r}`, {
      label: 'Undo',
      onPress: () => {
        deleteSet(row.id);
        void cancelRest();
      },
    });
  };

  const move = (from: number, dir: -1 | 1) => {
    const ids = plan.map((p) => p.exerciseId);
    const a = ids[from];
    const b = ids[from + dir];
    if (a === undefined || b === undefined) return;
    ids[from] = b;
    ids[from + dir] = a;
    setSessionOrder(id, ids);
    if (idx === from) setIndex(from + dir);
    else if (idx === from + dir) setIndex(from);
  };

  const skip = (p: PlannedExercise) => {
    skipExercise(id, p.exerciseId);
    if (nextIdx >= 0) goTo(nextIdx);
    toast(`Skipped ${p.exercise.name}`, { label: 'Undo', onPress: () => unskipExercise(id, p.exerciseId) });
  };

  const remove = (p: PlannedExercise) => {
    const removed = removeSessionExercise(id, p.exerciseId);
    toast(`Removed ${p.exercise.name}`, { label: 'Undo', onPress: () => restoreSessionExercise(removed) });
  };

  const finish = () => {
    setMenuOpen(false);
    void cancelRest();
    const r = finishSession(id);
    if (r.discarded) {
      toast('Nothing was logged, so the workout was discarded.');
      router.replace('/');
    } else {
      router.replace(`/session/summary/${id}`);
    }
  };

  const cancel = () => {
    setMenuOpen(false);
    const leave = (keep: boolean) => {
      void cancelRest();
      cancelSession(id, keep);
      toast(keep ? 'Workout cancelled — logged sets kept' : 'Workout discarded');
      router.replace('/');
    };
    if (totalWork === 0) return leave(false);
    confirm({
      title: 'Cancel this workout?',
      message: `You logged ${totalWork} ${totalWork === 1 ? 'set' : 'sets'}. Keep them in history (the day won't count as done), or delete everything.`,
      confirmLabel: 'Delete all',
      destructive: true,
      onConfirm: () => leave(false),
      alternative: { label: 'Keep sets', onPress: () => leave(true) },
    });
  };

  const meta = current
    ? [
        current.slot ? `${current.slot.targetSets} × ${current.slot.repLo}–${current.slot.repHi}` : suggestion ? `${suggestion.sets} × ${suggestion.repTarget[0]}–${suggestion.repTarget[1]}` : '',
        `RIR ${current.slot?.targetRir ?? suggestion?.targetRIR ?? 2}`,
        `rest ${fmtClock(restSeconds)}`,
        current.slot?.supersetGroup ? `superset ${current.slot.supersetGroup}` : '',
        current.adHoc ? 'added today' : '',
      ]
        .filter(Boolean)
        .join('  ·  ')
    : '';
  const calibrating = suggestion?.verdict === 'CALIBRATE';
  const differs = suggestion && !calibrating && (Math.abs(weight - suggestion.weight) > 1e-6 || reps < suggestion.repTarget[0]);

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton
          icon="close"
          accessibilityLabel="Leave the workout open and go back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {day?.label ?? 'Workout'}
          </Text>
          <Text style={styles.headerMeta}>
            {plan.length ? `${doneCount}/${plan.length} done  ·  ` : ''}
            <Elapsed since={session.startedAt} />
          </Text>
        </View>
        <IconButton icon="more" accessibilityLabel="Workout menu: exercises, finish, cancel" onPress={() => setMenuOpen(true)} />
      </View>

      <View style={styles.strip}>
        {plan.map((p, i) => (
          <Pressable
            key={p.exerciseId}
            onPress={() => goTo(i)}
            hitSlop={{ top: 12, bottom: 12 }}
            accessibilityLabel={`${p.exercise.name}: ${stateOf(p)}`}
            style={[styles.stripSeg, { backgroundColor: STATE_COLOR[stateOf(p)] }, i === idx && styles.stripOn]}
          />
        ))}
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
        {!readinessDone && sets.length === 0 ? <ReadinessPrompt sessionId={id} /> : null}

        {!current ? (
          <EmptyState message="No exercises yet. Add one to start logging." actionLabel="Add exercise" onAction={() => setPicker({ mode: 'add' })} />
        ) : (
          <>
            <View style={styles.exHead}>
              <IconButton icon="chevronLeft" accessibilityLabel="Previous exercise" disabled={idx === 0} onPress={() => goTo(idx - 1)} />
              <Pressable style={styles.exTitle} onPress={() => setInfo(current.exercise)} accessibilityRole="button" accessibilityHint="Shows how to do it">
                <View style={styles.exNameRow}>
                  <Text style={styles.exName} numberOfLines={2}>
                    {current.exercise.name}
                  </Text>
                  <Icon name="info" size={18} color={color.textMuted} />
                </View>
                <Text style={styles.meta}>{meta}</Text>
              </Pressable>
              <IconButton icon="chevronRight" accessibilityLabel="Next exercise" disabled={idx >= plan.length - 1} onPress={() => goTo(idx + 1)} />
            </View>

            {current.skipped ? (
              <Card>
                <View style={styles.rowBetween}>
                  <Text style={styles.body}>Skipped for today</Text>
                  <PrimaryButton label="Un-skip" tone="neutral" onPress={() => unskipExercise(id, current.exerciseId)} />
                </View>
              </Card>
            ) : suggestion ? (
              <Card tone={suggestion.verdict === 'BACKOFF' || suggestion.verdict === 'RESET' ? 'warning' : 'default'}>
                <View style={styles.rowBetween}>
                  <View style={styles.flex1}>
                    <Text style={styles.hero}>{calibrating ? (current.slot?.startWeight ? kg(current.slot.startWeight) : 'Your pick') : kg(suggestion.weight)}</Text>
                    <Text style={styles.heroSub}>
                      {suggestion.sets} sets · {suggestion.repTarget[0]}–{suggestion.repTarget[1]} reps
                    </Text>
                  </View>
                  <Pill label={VERDICT_LABEL[suggestion.verdict]} tone={VERDICT_TONE[suggestion.verdict]} />
                </View>
                <ReasonLine text={suggestion.reason} />
                <View style={styles.chips}>
                  {differs ? <PrimaryButton label="Use target" tone="neutral" onPress={prefill} /> : null}
                  {suggestion.warmups.length ? (
                    <PrimaryButton
                      label={showWarmups ? 'Hide warm-ups' : `Warm-ups · ${exWarm.length}/${suggestion.warmups.length}`}
                      tone="ghost"
                      onPress={() => setShowWarmups(!showWarmups)}
                    />
                  ) : null}
                  {current.exercise.loadType === 'barbell' ? <PrimaryButton label="Plates" tone="ghost" onPress={() => setPlates(true)} /> : null}
                </View>
                {showWarmups
                  ? suggestion.warmups.map((w, i) => {
                      const done = exWarm.length > i;
                      return (
                        <Pressable key={i} disabled={done} onPress={() => logSet(true, w.weight, w.reps)} style={styles.warm}>
                          <Text style={[styles.body, done && styles.mutedText]}>
                            {kgNum(w.weight)} kg × {w.reps}
                          </Text>
                          {done ? <Icon name="check" size={18} color={color.positive} /> : <Text style={styles.caption}>tap when done</Text>}
                        </Pressable>
                      );
                    })
                  : null}
              </Card>
            ) : null}

            {!current.skipped ? (
              <View style={styles.sets}>
                {Array.from({ length: Math.max(target, exWork.length) }, (_, i) => {
                  const s = exWork[i];
                  if (s) {
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => setEditing(s)}
                        accessibilityLabel={`Set ${i + 1}: ${kgNum(s.weight)} kilos for ${s.reps}. Tap to edit.`}
                        style={({ pressed }) => [styles.setTile, styles.setDone, pressed && styles.pressed]}
                      >
                        <Text style={styles.setVal}>
                          {kgNum(s.weight)}×{s.reps}
                        </Text>
                        <Text style={styles.setSub}>{s.painFlag ? 'pain' : `RIR ${s.rir}`}</Text>
                      </Pressable>
                    );
                  }
                  return (
                    <View key={`todo-${i}`} style={[styles.setTile, i === exWork.length && styles.setNext]}>
                      <Text style={styles.setTodo}>Set {i + 1}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            <Text style={styles.last}>
              <Text style={styles.lastLabel}>{last ? `Last · ${fmtDayLabel(last.date)}   ` : ''}</Text>
              {last
                ? last.sets
                    .filter((s) => s.isWarmup === 0)
                    .map((s) => `${kgNum(s.weight)}×${s.reps}`)
                    .join('   ')
                : 'First time on this exercise.'}
            </Text>

            {currentState === 'done' ? (
              <Card tone="positive">
                <View style={styles.rowBetween}>
                  <View style={styles.flex1}>
                    <Text style={styles.body}>All {target} sets done</Text>
                    <Text style={styles.caption}>{next ? `Next: ${next.exercise.name}` : 'That was the last one.'}</Text>
                  </View>
                  {next ? (
                    <PrimaryButton label="Next" icon={<Icon name="chevronRight" size={18} color={color.onAccent} />} onPress={() => goTo(nextIdx)} />
                  ) : (
                    <PrimaryButton label="Finish" onPress={finish} />
                  )}
                </View>
              </Card>
            ) : null}

            <View style={styles.actions}>
              <IconButton icon="swap" label="Swap" accessibilityLabel="Swap this exercise for today" tone="neutral" onPress={() => setPicker({ mode: 'swap', from: current })} />
              {current.adHoc ? (
                <IconButton icon="trash" label="Remove" accessibilityLabel="Remove this exercise from today" tone="neutral" onPress={() => remove(current)} />
              ) : current.skipped ? (
                <IconButton icon="undo" label="Un-skip" accessibilityLabel="Un-skip this exercise" tone="neutral" onPress={() => unskipExercise(id, current.exerciseId)} />
              ) : (
                <IconButton icon="skip" label="Skip" accessibilityLabel="Skip this exercise today" tone="neutral" onPress={() => skip(current)} />
              )}
              <IconButton icon="info" label="How-to" accessibilityLabel="How to do this exercise" tone="neutral" onPress={() => setInfo(current.exercise)} />
              <IconButton icon="plus" label="Add" accessibilityLabel="Add an exercise" tone="neutral" onPress={() => setPicker({ mode: 'add' })} />
            </View>
          </>
        )}
      </ScrollView>

      {current && !current.skipped ? (
        <View style={[styles.controls, { paddingBottom: insets.bottom + space.sm }]}>
          <RestTimerBar sessionId={id} />
          <SetControls
            weight={weight}
            reps={reps}
            rir={rir}
            pain={pain}
            step={step}
            logLabel={`Log set ${exWork.length + 1}`}
            onWeight={setWeight}
            onReps={setReps}
            onRir={setRir}
            onPain={setPain}
            onLog={() => logSet(false)}
          />
        </View>
      ) : null}

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title="Workout">
        {plan.map((p, i) => {
          const st = stateOf(p);
          return (
            <View key={p.exerciseId} style={styles.listRow}>
              <View style={[styles.dot, { backgroundColor: STATE_COLOR[st] }]} />
              <Pressable
                style={styles.flex1}
                onPress={() => {
                  goTo(i);
                  setMenuOpen(false);
                }}
              >
                <Text style={[styles.body, i === idx && styles.accentText, p.skipped && styles.mutedText]} numberOfLines={1}>
                  {p.exercise.name}
                </Text>
                <Text style={styles.caption}>
                  {p.skipped ? 'Skipped' : `${counts.get(p.exerciseId) ?? 0} / ${targetOf(p)} sets`}
                  {p.adHoc ? ' · added' : ''}
                </Text>
              </Pressable>
              <IconButton icon="chevronUp" accessibilityLabel={`Move ${p.exercise.name} up`} disabled={i === 0} onPress={() => move(i, -1)} />
              <IconButton icon="chevronDown" accessibilityLabel={`Move ${p.exercise.name} down`} disabled={i === plan.length - 1} onPress={() => move(i, 1)} />
            </View>
          );
        })}
        <PrimaryButton
          label="Add exercise"
          tone="neutral"
          icon={<Icon name="plus" size={18} />}
          style={styles.gapTop}
          onPress={() => {
            setMenuOpen(false);
            setPicker({ mode: 'add' });
          }}
        />
        <View style={styles.menuEnd}>
          <PrimaryButton label="Finish workout" size="gym" icon={<Icon name="check" size={20} color={color.onAccent} />} onPress={finish} />
          <PrimaryButton label="Cancel workout" tone="ghost" onPress={cancel} />
          <Text style={styles.captionCenter}>Finish saves what you did — unfinished exercises count as partial. Cancel never counts as done.</Text>
        </View>
      </Sheet>

      <Sheet visible={picker !== null} onClose={() => setPicker(null)} title={picker?.mode === 'swap' ? `Swap ${picker.from.exercise.name}` : 'Add exercise'}>
        {picker?.mode === 'swap' ? <Text style={styles.caption}>Today only — your plan stays the same.</Text> : null}
        <ExercisePicker
          excludeIds={plan.map((p) => p.exerciseId)}
          initialMuscle={picker?.mode === 'swap' ? picker.from.exercise.primaryMuscles[0] : undefined}
          onPick={(ex) => {
            if (picker?.mode === 'swap') {
              const from = picker.from;
              swapSessionExercise(id, from.exerciseId, ex.id);
              toast(`Swapped to ${ex.name} for today`, { label: 'Undo', onPress: () => swapSessionExercise(id, ex.id, from.exerciseId) });
            } else {
              addSessionExercise(id, ex.id);
              setIndex(plan.length); // appended last; clamped if the list is shorter
            }
            setPicker(null);
          }}
        />
      </Sheet>

      <PlateSheet visible={plates} weight={weight} onClose={() => setPlates(false)} />
      <EditSetSheet set={editing} step={step} onClose={() => setEditing(null)} />
      <ExerciseInfoSheet exercise={info} onClose={() => setInfo(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  flex1: { flex: 1 },
  scroll: { padding: layout.screenPadding, paddingBottom: space.xxxl, gap: space.md },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, gap: space.sm, paddingBottom: space.sm },
  headerText: { flex: 1, alignItems: 'center' },
  headerTitle: { ...font.body, color: color.text, fontWeight: '700' },
  headerMeta: { ...font.caption, ...font.numeric, color: color.textMuted, marginTop: 2 },
  strip: { flexDirection: 'row', gap: 3, paddingHorizontal: layout.screenPadding, paddingBottom: space.sm },
  stripSeg: { flex: 1, height: 4, borderRadius: radius.pill },
  stripOn: { height: 6, marginTop: -1, borderWidth: 1, borderColor: color.text },
  exHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  exTitle: { flex: 1, alignItems: 'center', paddingVertical: space.xs },
  exNameRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  exName: { ...font.heading, color: color.text, textAlign: 'center', flexShrink: 1 },
  meta: { ...font.caption, ...font.numeric, color: color.textMuted, marginTop: space.xs, textAlign: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  hero: { ...font.display, ...font.numeric, fontSize: 44, color: color.text },
  heroSub: { ...font.label, color: color.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  warm: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: hit.default, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  sets: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  setTile: {
    minWidth: 76,
    flexGrow: 1,
    flexBasis: '22%',
    minHeight: hit.gym,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xs,
  },
  setDone: { borderStyle: 'solid', borderColor: color.surfaceHigh, backgroundColor: color.surfaceHigh },
  setNext: { borderColor: color.accent },
  setVal: { ...font.body, ...font.numeric, color: color.text, fontWeight: '700' },
  setSub: { ...font.caption, color: color.textMuted },
  setTodo: { ...font.caption, color: color.textFaint },
  pressed: { opacity: 0.7 },
  last: { ...font.label, ...font.numeric, color: color.text },
  lastLabel: { color: color.textMuted },
  actions: { flexDirection: 'row', justifyContent: 'space-around', marginTop: space.sm },
  body: { ...font.body, color: color.text },
  caption: { ...font.caption, color: color.textMuted, marginTop: 2 },
  captionCenter: { ...font.caption, color: color.textMuted, textAlign: 'center' },
  mutedText: { color: color.textMuted },
  accentText: { color: color.accent },
  controls: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    backgroundColor: color.bg,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  gapTop: { marginTop: space.md },
  menuEnd: { gap: space.sm, marginTop: space.xl, paddingBottom: space.md },
});
