import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, EmptyState, FitText, Icon, IconButton, ListCard, ListRow, Pill, type PillTone, Press, PrimaryButton, SectionHeader, setToastObstruction, Sheet, toast, useReducedMotion, type IconName } from '@/components';
import { CATALOG, CATALOG_BY_ID, type Stress } from '@/data/catalog';
import { useLive } from '@/db/live';
import type { Exercise } from '@/db/repositories/exercises';
import { getDay, getSlots } from '@/db/repositories/program';
import {
  addSessionExercise,
  cooldownSettled,
  deleteSet,
  exerciseSessions,
  finishSession,
  getSessionStage,
  getLastPerformance,
  getSession,
  getSessionPlan,
  getSessionSets,
  getWarmupState,
  insertSet,
  removeSessionExercise,
  restoreSessionExercise,
  sessionTargetSets,
  setSessionOrder,
  setSessionStage,
  setSessionTargetSets,
  settleCooldown,
  setWarmupState,
  skipExercise,
  swapSessionExercise,
  unskipExercise,
  type PlannedExercise,
  type SetRow,
} from '@/db/repositories/sessions';
import { setSetting, useSettings } from '@/db/repositories/settings';
import { RULE_TEXT } from '@/engine/adjust';
import { e1RM, type Readiness } from '@/engine/progression';
import { cooldown } from '@/engine/recovery';
import { substitutes } from '@/engine/substitute';
import { sessionWarmup } from '@/engine/warmup';
import { CheckInForm } from '@/features/checkin/CheckInSheet';
import { ExerciseInfoSheet } from '@/features/exercises/ExerciseInfoSheet';
import { ExercisePicker } from '@/features/exercises/ExercisePicker';
import { drillKit, toolsOf } from '@/features/profile';
import { cancelWorkout } from '@/features/session/cancel';
import { allSettled, isSettled, nextPendingIndex, type ExState } from '@/features/session/order';
import { LoadLine } from '@/features/progress/LoadLine';
import { DrillStage } from '@/features/session/DrillStage';
import { EditSetSheet } from '@/features/session/EditSetSheet';
import { Elapsed } from '@/features/session/Elapsed';
import { PlateSheet } from '@/features/session/PlateSheet';
import { nextStage, resolveStage, STAGE_LABEL, stagesShown, type SessionStage, type StageContent } from '@/features/session/stages';
import { fmtSet, fmtSetList, liftOf, rampFor, readinessFrom, suggestFor, suggestionContext, verdictLabel, VERDICT_TONE, type SuggestionContext } from '@/features/session/prescription';
import { RestTimerBar } from '@/features/session/RestTimerBar';
import { AdvanceButton, SetControls, type Advance } from '@/features/session/SetControls';
import { minutesLabel, MODE_OPTIONS } from '@/features/warmup/labels';
import { fmtClock, fmtDayLabel } from '@/lib/date';
import { kg, kgNum } from '@/lib/format';
import { success } from '@/lib/haptics';
import { cancelRest, startRest, useRestTimer } from '@/services/restTimer';
import { CSS_EASE_OUT, type AnimatedViewStyle } from '@/theme/curves';
import { color, font, hit, layout, radius, space } from '@/theme/tokens';

/**
 * The one piece of delight in the app, and it fires once per logged set.
 *
 * A tile that has just been filled in starts at the accent and cools to the same
 * grey as the sets before it. That is the whole visual thesis in one transition:
 * heat marks where work is being done, and it fades as the work becomes history.
 * It is also the only acknowledgement of a commit that survives the toast — you
 * can look away, look back, and still see which set you just did.
 *
 * `to` is deliberately identical to the tile's resting style, so when the
 * animation finishes there is nothing to unwind and no fill mode to get wrong.
 */
const COOLING: AnimatedViewStyle = {
  animationName: {
    from: { backgroundColor: color.accentWash, borderColor: color.accent },
    to: { backgroundColor: color.surface, borderColor: color.border },
  },
  animationDuration: 900,
  animationTimingFunction: CSS_EASE_OUT,
};

const STATE_COLOR: Record<ExState, string> = {
  done: color.positive,
  partial: color.accentSoft,
  todo: color.surfaceHigh,
  skipped: color.border,
};

const TONE_COLOR: Record<PillTone, string> = {
  accent: color.accent,
  positive: color.positive,
  warning: color.warning,
  danger: color.danger,
  muted: color.textMuted,
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
  // Plan notes are read live, not snapshotted: editing a cue should show up next workout.
  const notes = useLive(
    () => new Map((session?.routineDayId ? getSlots(session.routineDayId) : []).map((s) => [s.exerciseId, s.notes])),
    ['routine_slot', 'exercise'],
    [session?.routineDayId],
  );
  const warmupState = useLive(() => getWarmupState(id), ['setting'], [id]);
  // Both live on the `setting` table, so one subscription covers the stage, the
  // warm-up state and the cool-down's "already dealt with" mark.
  const savedStage = useLive(() => getSessionStage(id), ['setting'], [id]);
  const cooledDown = useLive(() => cooldownSettled(id), ['setting'], [id]);
  // Subscribed here, not inside the bar: rest keeps running whatever the exercise
  // list is doing, so the dock must be able to mount without a current exercise.
  const rest = useRestTimer(id);
  // The dock is this screen's; leaving takes its reservation with it. Cleared on
  // every stage change too: the check-in has no dock at all, so the reservation
  // the warm-up's left behind would push a toast into the middle of the screen.
  useEffect(() => () => setToastObstruction(0), []);
  useEffect(() => {
    setToastObstruction(0);
  }, [savedStage]);
  const ctx = useMemo(() => suggestionContext(), []);

  const [index, setIndex] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [plates, setPlates] = useState(false);
  const [editing, setEditing] = useState<SetRow | null>(null);
  const [info, setInfo] = useState<Exercise | null>(null);
  const [showWarmups, setShowWarmups] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  /** Set by "Add another set": keeps the inputs open past the target sets. */
  const [addingExtra, setAddingExtra] = useState(false);
  /** The set whose tile is still cooling. One id, not a flag — see COOLING. */
  const [justLogged, setJustLogged] = useState<string | null>(null);
  const reduced = useReducedMotion();

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sets) if (s.isWarmup === 0) m.set(s.exerciseId, (m.get(s.exerciseId) ?? 0) + 1);
    return m;
  }, [sets]);
  // What the workout is running to today, which a deload or an added set moves off
  // the plan. One source for the checklist, the counter and the finish status.
  const targets = useLive(() => sessionTargetSets(id), ['setting'], [id]);
  const targetOf = (p: PlannedExercise) => targets[p.exerciseId] ?? p.slot?.targetSets ?? 3;
  const stateOf = (p: PlannedExercise): ExState => {
    const n = counts.get(p.exerciseId) ?? 0;
    return p.skipped ? 'skipped' : n >= targetOf(p) ? 'done' : n > 0 ? 'partial' : 'todo';
  };

  // Resume where you were: the first exercise neither skipped nor finished.
  const firstOpen = useMemo(() => {
    const i = plan.findIndex((p) => !isSettled(stateOf(p)));
    return i < 0 ? Math.max(0, plan.length - 1) : i;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.length]);
  const idx = Math.min(index ?? firstOpen, Math.max(0, plan.length - 1));
  const current = plan[idx];

  // The session's lifts in order (skipped ones don't warm anything up).
  const active = useMemo(() => plan.filter((p) => !p.skipped), [plan]);
  const lifts = useMemo(() => active.map((p) => liftOf(p.exercise, p.slot)), [active]);
  const liftIdx = current ? active.findIndex((p) => p.exerciseId === current.exerciseId) : -1;

  const kit = useMemo(() => drillKit(settings), [settings]);
  const warmup = useMemo(
    () =>
      sessionWarmup(lifts, settings.warmupMode, {
        level: settings.experience,
        available: kit,
        avoidImpact: settings.limitations.includes('impact'),
      }),
    [lifts, settings, kit],
  );

  /**
   * The cool-down, built from what was actually logged rather than from what was
   * planned: three exercises skipped is three regions that need nothing stretched.
   * Empty until something is logged, which is also what keeps the stage out of the
   * flow on a workout where nothing happened.
   */
  const cooldownRoutine = useMemo(() => {
    const trained = plan
      .map((pe) => ({ primary: pe.exercise.primaryMuscles, sets: counts.get(pe.exerciseId) ?? 0 }))
      .filter((t) => t.sets > 0);
    return cooldown(trained, 'short', kit);
  }, [plan, counts, kit]);

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

  /**
   * Every finished session of this lift, for the history strip. Live on
   * `set_log` so a set logged seconds ago is already part of the picture the
   * next exercise's strip is drawn from.
   */
  const history = useLive(
    () => (current ? exerciseSessions(current.exerciseId) : []),
    ['set_log', 'session'],
    [current?.exerciseId],
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
      setReps(suggestion.repTarget[suggestion.measure === 'time' ? 0 : 1]);
    } else {
      setWeight(suggestion.weight);
      setReps(suggestion.repTarget[0]);
    }
    setRir(suggestion.targetRIR);
    setPain(false);
  };

  // Prefill when an exercise opens or its prescription changes. Adjusted during
  // render rather than in an effect, so the right numbers are on the first frame.
  const [prefilledFor, setPrefilledFor] = useState<typeof suggestion | undefined>(undefined);
  if (prefilledFor !== suggestion) {
    setPrefilledFor(suggestion);
    setWhyOpen(false);
    setAddingExtra(false);
    prefill();
  }

  // Record the set count the user is actually shown. Planned exercises only: an
  // added one has no slot, and giving it one would hand it the wrong rest default.
  useEffect(() => {
    if (!current?.slot || current.adHoc || !suggestion) return;
    if (targets[current.exerciseId] === suggestion.sets) return;
    setSessionTargetSets(id, current.exerciseId, suggestion.sets);
  }, [current?.exerciseId, suggestion?.sets]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The suggestion's own numbers. Distinct from prefill, which repeats your last set. */
  const useSuggestion = () => {
    if (!suggestion) return;
    setWeight(suggestion.weight);
    setReps(suggestion.repTarget[0]);
    setRir(suggestion.targetRIR);
  };

  if (!session || session.endedAt) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top + space.xl, paddingHorizontal: layout.screenPadding }]}>
        <EmptyState message="This workout is closed." actionLabel="Back to Today" onAction={() => router.replace('/')} />
      </View>
    );
  }

  const day = session.routineDayId ? getDay(session.routineDayId) : undefined;
  const doneCount = plan.filter((p) => isSettled(stateOf(p))).length;
  const step = current?.exercise.loadStep ?? 2.5;
  const target = current ? targetOf(current) : 3;
  const currentState = current ? stateOf(current) : 'todo';
  /**
   * The next exercise with work left — anywhere in the session, wrapping past the
   * end. It used to search only after the selected one, so jumping to the last
   * exercise, finishing it, and having three unfinished ones above left the primary
   * action offering to end the workout (UX-04).
   */
  const exStates = plan.map(stateOf);
  const nextIdx = nextPendingIndex(exStates, idx);
  const next = nextIdx >= 0 ? plan[nextIdx] : undefined;
  /** Worth saying out loud: it changes how much someone leaves in the tank. */
  const nextIsLast = nextIdx >= 0 && exStates.filter((st) => !isSettled(st)).length === 1;
  /** Everything is done or deliberately skipped: only now is Finish the normal end. */
  const settled = allSettled(exStates);

  const entry = current ? CATALOG_BY_ID.get(current.exerciseId) : undefined;
  // Added-today exercises have no slot: a compound needs far more rest than a curl.
  const restSeconds = current?.slot?.restSeconds ?? (entry?.compound === false ? 75 : 150);
  const measure = suggestion?.measure ?? 'reps';
  const loadType = current?.exercise.loadType ?? 'barbell';
  const repHi = current?.slot?.repHi ?? suggestion?.repTarget[1] ?? 12;
  const unit: 'reps' | 'sec' | 'min' = measure === 'time' ? (repHi >= 180 ? 'min' : 'sec') : 'reps';
  const cardio = entry?.pattern === 'conditioning';
  const weightLabel = cardio ? null : loadType === 'band' ? 'band' : loadType === 'bodyweight' ? '+kg' : 'kg';
  const setText = (w: number, r: number) => fmtSet(measure, w, r, loadType);

  /**
   * A set as a tile: the figure that changes, and the one that qualifies it.
   *
   * `fmtSet` gives one string — "102.5×12" — and at the size this number has to
   * be read at (24pt, see `styles.tile`) that is 96dp of text in a cell 58dp
   * wide on a 360dp phone with four sets on the row. Which is how it ended up at
   * 16pt: three numbers were being crammed into a box with room for one.
   *
   * So the load gets the big line and the reps the small one, and RIR comes off
   * the tile. It is still recorded, still in the "why" box's last-time line,
   * still in the summary, and still one tap away in the editor the tile opens —
   * it is just not one of the two numbers §3 asks to be readable at arm's length.
   */
  const tileText = (w: number, r: number): { big: string; small: string } => {
    if (measure === 'time') return r >= 180 ? { big: String(Math.round(r / 60)), small: 'min' } : { big: String(r), small: 'sec' };
    if (loadType === 'band') return w > 0 ? { big: `L${kgNum(w)}`, small: `× ${r}` } : { big: String(r), small: 'reps' };
    if (w === 0) return { big: String(r), small: 'reps' };
    return { big: kgNum(w), small: `× ${r}` };
  };

  const workKg = suggestion ? (suggestion.verdict === 'CALIBRATE' ? (current?.slot?.startWeight ?? 0) : suggestion.weight) : 0;
  const ramp = current && liftIdx >= 0 ? rampFor(lifts, liftIdx, workKg, step, warmupState !== 'skipped') : [];

  // Exercises paired with the current one (same superset letter), in plan order.
  const group = current?.slot?.supersetGroup ?? null;
  const partners = group ? plan.filter((p) => !p.skipped && p.slot?.supersetGroup === group) : [];

  const goTo = (i: number) => {
    setIndex(Math.max(0, Math.min(i, plan.length - 1)));
    setShowWarmups(false);
  };

  const logSet = (asWarmup = false, w = weight, r = reps) => {
    if (!current || !suggestion) return;
    const row = insertSet({
      sessionId: id,
      exerciseId: current.exerciseId,
      weight: w,
      reps: r,
      rir: asWarmup ? 5 : rir,
      isWarmup: asWarmup,
      painFlag: asWarmup ? false : pain,
      wasOverride: !asWarmup && suggestion.verdict !== 'CALIBRATE' && Math.abs(w - suggestion.weight) > 1e-6,
    });
    setIndex(idx); // stay here, even once the target is reached
    if (warmupState === 'pending' && !asWarmup) setWarmupState(id, 'skipped');
    // Which tile is allowed to flash. Reopening the screen with ten sets already
    // logged must not set the whole grid off, so it is this one id and not "is new".
    setJustLogged(row.id);
    success(); // gated centrally now — lib/haptics reads the user's setting
    setPain(false);
    if (asWarmup) {
      // A warm-up is a persisted row like any other, so it gets the same Undo.
      toast(`Warm-up logged · ${setText(w, r)}`, { label: 'Undo', onPress: () => deleteSet(row.id) });
      return;
    }
    // Superset: move straight to the partner that is a set behind and rest only
    // once the round is finished — that alternation is the point of pairing them.
    const behind = partners.find((p) => p.exerciseId !== current.exerciseId && (counts.get(p.exerciseId) ?? 0) < exWork.length + 1 && (counts.get(p.exerciseId) ?? 0) < targetOf(p));
    if (behind) {
      goTo(plan.indexOf(behind));
      toast(`Set ${exWork.length + 1} logged · ${setText(w, r)} · next: ${behind.exercise.name}`, {
        label: 'Undo',
        onPress: () => deleteSet(row.id),
      });
      return;
    }
    const roundStart = partners.length > 1 ? partners.find((p) => (counts.get(p.exerciseId) ?? 0) < targetOf(p)) : undefined;
    if (roundStart && roundStart.exerciseId !== current.exerciseId) goTo(plan.indexOf(roundStart));
    if (settings.restTimerAutoStart && !cardio) void startRest(id, restSeconds, current.exercise.name);
    toast(`Set ${exWork.length + 1} logged · ${setText(w, r)}`, {
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

  /**
   * Off today's list, and nothing else. `removeSessionExercise` touches
   * `session_exercise` and `set_log` for this session only — the plan's own slot
   * row is never involved, so next week's workout is unchanged.
   *
   * Its sets go with it, which is why the toast counts them: there is an Undo, so
   * this needs no dialog (AGENTS §1.4), but it does need to say what it took.
   */
  const remove = (p: PlannedExercise) => {
    const removed = removeSessionExercise(id, p.exerciseId);
    const n = removed.sets.length;
    toast(n ? `Removed ${p.exercise.name} and its ${n} logged ${n === 1 ? 'set' : 'sets'}` : `Removed ${p.exercise.name} from today`, {
      label: 'Undo',
      onPress: () => restoreSessionExercise(removed),
    });
  };

  /**
   * Which stages this workout actually has. A warm-up already done or deliberately
   * skipped is not a stage to walk back into, so `warmupState` is part of the
   * answer and not just whether drills exist.
   */
  const content: StageContent = {
    warmup: warmupState === 'pending' && warmup.items.length > 0,
    cooldown: !cooledDown && cooldownRoutine.items.length > 0,
  };
  /**
   * `resolveStage` can answer 'finish' — the saved stage emptied out, which in
   * practice means the app was killed between settling the cool-down and closing
   * the workout. Showing the lifts with everything ticked and Finish under a thumb
   * is the honest recovery; finishing it for them on open is not.
   */
  const resolved = resolveStage(savedStage, content);
  const stage: SessionStage = resolved === 'finish' ? 'main' : resolved;

  /** Closes the workout for real and shows what was done. The end of the flow. */
  const close = () => {
    setMenuOpen(false);
    void cancelRest();
    const r = finishSession(id);
    if (r.discarded) {
      toast('Nothing was logged, so the workout was discarded.');
      router.replace('/');
    } else {
      router.replace(`/session/summary/${id}?just=1`);
    }
  };

  /**
   * Leaving the lifts behind. The cool-down is a stage of the workout now, not an
   * offer on the summary screen after it has been filed, so Finish walks on to it
   * when there is one and closes the workout when there is not.
   */
  const finish = () => {
    setMenuOpen(false);
    if (content.cooldown) {
      void cancelRest();
      setSessionStage(id, 'cooldown');
      return;
    }
    close();
  };

  const cancel = () => {
    setMenuOpen(false);
    // Every persisted row, warm-ups included — see features/session/cancel.ts.
    cancelWorkout(id, sets.length, () => router.replace('/'));
  };

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  /** On to whatever comes after this stage, closing the workout if nothing does. */
  const advanceFrom = (from: SessionStage) => {
    const to = nextStage(from, content);
    if (to === 'finish') close();
    else setSessionStage(id, to);
  };

  /* ---------------------------- the stages ------------------------------ */

  /**
   * Check-in → warm-up → the lifts → cool-down → summary.
   *
   * Which stages exist at all is data, not a constant: a day with no drills has no
   * warm-up to show, and a workout with nothing logged has nothing to cool down
   * from. `features/session/stages` owns the walk and is tested on its own; this
   * screen only ever asks where to go next.
   */
  /**
   * The strip draws the SHAPE of the workout, not what is left of it.
   *
   * `content` shrinks as you go — a warm-up you have done is no longer a stage to
   * walk into — and using it here made the strip re-draw itself mid-workout: four
   * segments during the warm-up, three during the lifts, with "Cool-down" landing
   * where "Workout" had been. So the shape is "does this workout have drills" and
   * "does a workout end in a cool-down" (it does, unless nothing was logged, in
   * which case the workout is discarded and there is no strip to read).
   */
  const strip = <StageStrip stages={stagesShown({ warmup: warmup.items.length > 0, cooldown: true })} current={stage} />;

  if (stage === 'checkin') {
    return (
      <View style={[styles.flex, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <IconButton icon="chevronLeft" accessibilityLabel="Leave the workout open and go back" onPress={leave} />
          <View style={styles.headerText}>
            <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
              Before you start
            </Text>
            <Text style={styles.headerMeta} numberOfLines={1}>
              {day?.label ?? 'Workout'} · optional
            </Text>
          </View>
        </View>
        {strip}
        <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* The same four questions as everywhere else — see CheckInForm. Both
              buttons carry on to the warm-up; neither is a gate. */}
          <CheckInForm
            date={session.date}
            datePicker={false}
            onClose={leave}
            startLabel="Save and continue"
            onStart={() => advanceFrom('checkin')}
            onSkip={() => advanceFrom('checkin')}
          />
        </ScrollView>
      </View>
    );
  }

  if (stage === 'warmup') {
    return (
      <DrillStage
        kind="warmup"
        routine={warmup}
        available={kit}
        totalLabel={minutesLabel(warmup.seconds)}
        title={day?.label ?? 'Workout'}
        strip={strip}
        modes={{ options: MODE_OPTIONS, value: settings.warmupMode, onChange: (m) => setSetting('warmupMode', m as typeof settings.warmupMode) }}
        onBack={leave}
        onFinish={() => {
          setWarmupState(id, 'done');
          advanceFrom('warmup');
        }}
        onSkip={() => {
          // Recorded, because a skipped warm-up earns the first big lift an extra
          // light ramp set (engine/warmup, `generalDone`).
          setWarmupState(id, 'skipped');
          advanceFrom('warmup');
        }}
      />
    );
  }

  if (stage === 'cooldown') {
    const endCooldown = (word: string) => {
      settleCooldown(id);
      toast(word);
      close();
    };
    return (
      <DrillStage
        kind="cooldown"
        routine={cooldownRoutine}
        available={kit}
        totalLabel={minutesLabel(cooldownRoutine.seconds)}
        title={day?.label ?? 'Workout'}
        strip={strip}
        onBack={leave}
        onFinish={() => endCooldown('Cool-down done — workout saved')}
        onSkip={() => endCooldown('Workout saved')}
      />
    );
  }

  const swapSuggestions =
    picker?.mode === 'swap'
      ? (() => {
          const from = CATALOG_BY_ID.get(picker.from.exerciseId);
          return from
            ? substitutes(from, CATALOG, {
                available: toolsOf(settings),
                disliked: new Set(settings.disliked),
                limitations: new Set(settings.limitations as Stress[]),
                exclude: new Set(plan.map((p) => p.exerciseId)),
              }, 4)
            : [];
        })()
      : [];

  const repRange = (p: PlannedExercise) => (p.slot ? ([p.slot.repLo, p.slot.repHi] as const) : p === current && suggestion ? suggestion.repTarget : null);
  const rangeText = (r: readonly [number, number] | null) =>
    !r ? '' : unit === 'min' ? `${Math.round(r[0] / 60)}–${Math.round(r[1] / 60)} min` : unit === 'sec' ? `${r[0]}–${r[1]} s` : `${r[0]}–${r[1]} reps`;
  const range = current ? repRange(current) : null;
  const done = currentState === 'done';
  const meta = current
    ? [
        done ? `${exWork.length} of ${target} sets logged` : `Set ${Math.min(exWork.length + 1, target)} of ${target}`,
        done ? '' : rangeText(range),
        cardio ? '' : `rest ${fmtClock(restSeconds)}`,
        current.slot?.supersetGroup ? `superset ${current.slot.supersetGroup}` : '',
        current.adHoc ? 'added today' : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const calibrating = suggestion?.verdict === 'CALIBRATE';
  const differs = suggestion && !calibrating && (Math.abs(weight - suggestion.weight) > 1e-6 || reps < suggestion.repTarget[0]);
  const loadText = (w: number) =>
    loadType === 'band' ? (w > 0 ? `band ${kgNum(w)}` : 'any band') : loadType === 'bodyweight' && w === 0 ? 'bodyweight' : kg(w);
  const lastWork = last?.sets.filter((sr) => sr.isWarmup === 0) ?? [];

  /*
   * Target and the way back to it live inside the number they explain, never above
   * it: the suggestion must never be louder than the entry (UX-04). One chip, under
   * whichever field comes first, whenever the entry has drifted off the plan.
   */
  const useTarget = differs && suggestion ? <UseTarget label={`Use target ${unit === 'reps' && weightLabel !== null ? kgNum(suggestion.weight) : ''}`.trim()} onPress={useSuggestion} /> : null;
  const weightFooter = !suggestion
    ? null
    : useTarget ?? <Text style={styles.footer}>{calibrating ? (current?.slot?.startWeight ? `plan starts at ${kg(current.slot.startWeight)}` : 'first time — your pick') : `target ${loadText(suggestion.weight)}`}</Text>;
  const repsFooter = weightLabel === null && useTarget ? useTarget : range ? <Text style={styles.footer}>target {rangeText(range).replace(' reps', '')}</Text> : null;

  const verdictTone = suggestion ? TONE_COLOR[VERDICT_TONE[suggestion.verdict]] : color.textMuted;
  const verdictIcon: IconName = !suggestion
    ? 'info'
    : suggestion.verdict.startsWith('ADD')
      ? 'arrowUp'
      : suggestion.verdict === 'BACKOFF' || suggestion.verdict === 'RESET'
        ? 'arrowDown'
        : suggestion.verdict === 'CALIBRATE'
          ? 'spark'
          : 'info';
  const reason = suggestion ? suggestion.reason.replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase()) : '';

  const setList = (rows: readonly SetRow[]) => fmtSetList(rows, measure, loadType);

  // The set that says most about today, by estimated one-rep max.
  const top = exWork.reduce<SetRow | undefined>((b, s) => (!b || e1RM(s.weight, s.reps, s.rir) > e1RM(b.weight, b.reps, b.rir) ? s : b), undefined);
  const lastTop = lastWork.reduce((m, s) => Math.max(m, s.weight), 0);
  const topWeight = exWork.reduce((m, s) => Math.max(m, s.weight), 0);
  const loadDelta = lastWork.length && measure === 'reps' ? Math.round((topWeight - lastTop) * 100) / 100 : 0;

  const tileCount = current && !current.skipped ? Math.max(target, exWork.length) : 0;
  const cols = Math.min(4, Math.max(3, tileCount));

  /**
   * Everything you can do to the exercise you are on.
   *
   * Remove is here for every exercise, not just one added today. It takes the
   * exercise off THIS workout and nothing else — `removeSessionExercise` touches
   * `session_exercise` and `set_log`, never `routine_slot` — so the plan is
   * exactly as it was next week. Skip and Remove are both offered because they
   * are different answers: skipped says "not today" and stays on the record as a
   * decision, removed says "this was never part of today".
   */
  type ToolSpec = { icon: IconName; label: string; a11y: string; on?: boolean; onPress: () => void };
  const tools: ToolSpec[] = current
    ? [
        ...(ramp.length && !current.skipped
          ? [
              {
                icon: 'flame' as IconName,
                label: `Warm-up ${Math.min(exWarm.length, ramp.length)}/${ramp.length}`,
                a11y: showWarmups ? 'Hide warm-up sets' : 'Show warm-up sets',
                on: showWarmups,
                onPress: () => setShowWarmups(!showWarmups),
              },
            ]
          : []),
        ...(loadType === 'barbell' && !current.skipped
          ? [{ icon: 'target' as IconName, label: 'Plates', a11y: 'Plates for this weight', onPress: () => setPlates(true) }]
          : []),
        { icon: 'book' as IconName, label: 'How-to', a11y: `How to do ${current.exercise.name}`, onPress: () => setInfo(current.exercise) },
        { icon: 'swap' as IconName, label: 'Swap', a11y: 'Swap this exercise for today', onPress: () => setPicker({ mode: 'swap', from: current }) },
        current.skipped
          ? { icon: 'undo' as IconName, label: 'Un-skip', a11y: 'Un-skip this exercise', onPress: () => unskipExercise(id, current.exerciseId) }
          : { icon: 'skip' as IconName, label: 'Skip', a11y: 'Skip this exercise today', onPress: () => skip(current) },
        {
          icon: 'trash' as IconName,
          label: 'Remove',
          a11y: `Remove ${current.exercise.name} from today's workout. Your plan is not changed.`,
          onPress: () => remove(current),
        },
      ]
    : [];
  /**
   * The one way out of this exercise, whatever state it is in.
   *
   * It used to be built inline inside `SetControls`' `advance` prop, which meant
   * only a FINISHED exercise could reach it. A skipped one rendered the rest bar
   * and nothing else — so skipping the last exercise left the screen with no
   * control that went anywhere, which is the trap AGENTS §1.4 forbids.
   */
  const wayOn: Advance = next
    ? { eyebrow: nextIsLast ? 'Last exercise' : 'Next exercise', label: next.exercise.name, onPress: () => goTo(nextIdx) }
    : { eyebrow: 'Everything done', label: content.cooldown ? 'Cool-down' : 'Finish workout', onPress: finish };

  /** Up to four across; beyond that, two balanced rows instead of six slivers. */
  const toolCols = tools.length <= 4 ? Math.max(1, tools.length) : Math.ceil(tools.length / 2);

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton icon="chevronLeft" accessibilityLabel="Leave the workout open and go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
            {day?.label ?? 'Workout'}
          </Text>
          <Text style={styles.headerMeta}>
            {plan.length ? `${idx + 1} of ${plan.length} · ` : ''}
            <Elapsed since={session.startedAt} />
          </Text>
        </View>
        {/* One clearly labelled way into the list. A 4dp segment was never a control. */}
        <Pressable
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Exercises: ${doneCount} of ${plan.length} done. Opens the list, where you can also add one, remove one from today, reorder, finish early or cancel.`}
          style={({ pressed }) => [styles.listBtn, pressed && styles.pressed]}
        >
          <Icon name="list" size={18} />
          <Text style={styles.listBtnText}>
            {doneCount}/{plan.length}
          </Text>
        </Pressable>
      </View>

      {/*
        No stage strip here, deliberately. This is the most vertically pressed
        screen in the app — header, strip, then a dock holding two hero steppers,
        the effort chips, the rest row and Log set — and it is also the one stage
        nobody can mistake for another. The strip rides on check-in, warm-up and
        cool-down, where "which part of this am I in" is a real question, and the
        menu's Finish button is what says a cool-down is still coming.
      */}

      {/* An indicator, not a row of 4dp tap targets. The list above is the control. */}
      <View
        style={styles.strip}
        accessibilityRole="progressbar"
        accessibilityLabel={`${doneCount} of ${plan.length} exercises done`}
        importantForAccessibility="no-hide-descendants"
      >
        {plan.map((p, i) => {
          const st = stateOf(p);
          return <View key={p.exerciseId} style={[styles.stripSeg, { backgroundColor: i === idx && st !== 'done' ? color.accent : STATE_COLOR[st] }]} />;
        })}
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
        {/*
          The warm-up card that used to sit here — a title, the drill names, three
          mode chips and Start/Skip — is gone. It was an advert for a sheet, above
          the exercise you came here to log, on every workout until you dismissed
          it. The warm-up is a stage before the lifts now (features/session/stages),
          so by the time this screen is on, it has already been done or skipped.
        */}
        {!current ? (
          <EmptyState message="No exercises yet." hint="Add one and you can start logging sets." actionLabel="Add exercise" onAction={() => setPicker({ mode: 'add' })} />
        ) : (
          <>
            <View>
              <Text style={styles.exName} numberOfLines={2}>
                {current.exercise.name}
              </Text>
              <Text style={styles.meta}>{current.skipped ? 'Skipped for today' : meta}</Text>
            </View>

            {notes.get(current.exerciseId) ? (
              <View style={styles.note}>
                <Icon name="info" size={14} color={color.accent} />
                <Text style={[styles.caption, styles.flex1]}>{notes.get(current.exerciseId)}</Text>
              </View>
            ) : null}

            {current.skipped ? (
              <Card>
                <View style={styles.rowBetween}>
                  <Text style={styles.body}>Skipped for today</Text>
                  <PrimaryButton label="Un-skip" tone="neutral" onPress={() => unskipExercise(id, current.exerciseId)} />
                </View>
              </Card>
            ) : suggestion && !done ? (
              <View>
                <Pressable
                  onPress={() => setWhyOpen(!whyOpen)}
                  style={styles.reason}
                  accessibilityRole="button"
                  accessibilityHint={whyOpen ? 'Hides the rule behind this' : 'Shows the rule behind this'}
                >
                  <View style={styles.reasonIcon}>
                    <Icon name={verdictIcon} size={14} color={verdictTone} strokeWidth={2.4} />
                  </View>
                  <Text style={styles.reasonText}>
                    <Text style={[styles.reasonVerdict, { color: verdictTone }]}>{verdictLabel(suggestion)},</Text> {reason}{' '}
                    <Text style={styles.why}>{whyOpen ? 'Hide' : 'Why?'}</Text>
                  </Text>
                </Pressable>
                {whyOpen ? (
                  <View style={styles.whyBox}>
                    {/*
                      The number you are dialling, drawn against every session of
                      this lift you have ever logged. The hollow mark IS the
                      stepper: move the weight and it moves, so "is this more than
                      last time" is answered by looking rather than by arithmetic.
                      This is the one place current and historical performance are
                      the same picture.
                    */}
                    <LoadLine sessions={history} proposed={{ weight, reps }} measure={measure} height={120} />
                    <Text style={styles.caption}>{RULE_TEXT[suggestion.verdict]}</Text>
                    {last ? (
                      <Text style={styles.caption}>
                        Last time ({fmtDayLabel(last.date)}
                        {suggestion.daysSinceLast !== null && suggestion.daysSinceLast > 7 ? `, ${suggestion.daysSinceLast} days ago` : ''}):{' '}
                        {lastWork.map((s) => `${setText(s.weight, s.reps)} @ RIR ${s.rir}`).join(', ')}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            {tileCount ? (
              <View style={styles.tiles}>
                {Array.from({ length: tileCount }, (_, i) => {
                  const s = exWork[i];
                  const w = { width: `${100 / cols}%` as const };
                  if (s) {
                    return (
                      <View key={s.id} style={[styles.tileCell, w]}>
                        <Press
                          onPress={() => setEditing(s)}
                          accessibilityLabel={`Set ${i + 1}: ${setText(s.weight, s.reps)}${s.painFlag ? ', pain flagged' : ''}. Tap to edit.`}
                          // The set just logged arrives warm and cools into the row
                          // of the ones before it. See COOLING.
                          style={[styles.tile, s.id === justLogged && !reduced && COOLING]}
                          pressedStyle={styles.tileHeld}
                        >
                          <View style={styles.tileHead}>
                            <Text style={styles.tileLabel}>Set {i + 1}</Text>
                            <Icon name={s.painFlag ? 'flag' : 'check'} size={13} color={s.painFlag ? color.danger : color.positive} strokeWidth={2.6} />
                          </View>
                          <FitText style={styles.tileVal} numberOfLines={1} minimumFontScale={0.65}>
                            {tileText(s.weight, s.reps).big}
                          </FitText>
                          <Text style={styles.tileSub} numberOfLines={1}>
                            {tileText(s.weight, s.reps).small}
                          </Text>
                        </Press>
                      </View>
                    );
                  }
                  const now = i === exWork.length;
                  const prev = lastWork[i];
                  const ghost = prev
                    ? tileText(prev.weight, prev.reps)
                    : suggestion && !calibrating
                      ? tileText(suggestion.weight, suggestion.repTarget[0])
                      : null;
                  return (
                    <View key={`todo-${i}`} style={[styles.tileCell, w]}>
                      <View style={[styles.tile, now ? styles.tileNow : styles.tileTodo]}>
                        <Text style={[styles.tileLabel, now && styles.accentText]}>Set {i + 1}</Text>
                        <FitText style={styles.tileGhost} numberOfLines={1} minimumFontScale={0.65}>
                          {ghost ? ghost.big : '—'}
                        </FitText>
                        {/* The grey number has to say where it came from, or it reads
                            as a target when it is what you did last Tuesday. */}
                        <Text style={styles.tileSub} numberOfLines={1}>
                          {ghost ? `${ghost.small} ${prev ? 'last' : 'target'}` : ' '}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {done && !addingExtra ? (
              <View style={styles.doneCard}>
                <View style={styles.doneHead}>
                  <View style={styles.doneTick}>
                    <Icon name="check" size={22} color={color.bg} strokeWidth={2.8} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.doneTitle}>All {exWork.length} sets logged</Text>
                    {top && measure === 'reps' && top.weight > 0 ? (
                      <Text style={styles.caption}>
                        Top set {kgNum(top.weight)} × {top.reps} · est. 1-rep max {Math.round(e1RM(top.weight, top.reps, top.rir))} kg
                      </Text>
                    ) : null}
                  </View>
                </View>
                {lastWork.length ? (
                  <View style={styles.doneFoot}>
                    <Text style={[styles.caption, styles.flex1]}>
                      Last time <Text style={styles.strong}>{setList(lastWork)}</Text>
                    </Text>
                    {loadDelta !== 0 ? (
                      <Text style={[styles.delta, { color: loadDelta > 0 ? color.positive : color.textMuted }]}>
                        {loadDelta > 0 ? '+' : '−'}
                        {kg(Math.abs(loadDelta))}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            {done && !addingExtra && next ? <UpNext p={next} readiness={readiness} ctx={ctx} onPress={() => goTo(nextIdx)} /> : null}

            {/*
              Two rows rather than six cells crammed into one. Six 11pt labels
              across a 360dp phone gives each about 50dp, which clipped "Warm-up
              3/4" and "Remove" — and the way to remove an exercise is not a
              feature to hide behind an ellipsis (§3).
            */}
            <View style={styles.tools}>
              {tools.map((t) => (
                <View key={t.label} style={[styles.toolCell, { width: `${100 / toolCols}%` }]}>
                  <Tool {...t} />
                </View>
              ))}
            </View>

            {showWarmups && !current.skipped ? (
              <ListCard>
                {/* Saved warm-ups beyond the planned ramp still get a row: a working
                    set re-flagged as a warm-up in EditSetSheet must not vanish. */}
                {Array.from({ length: Math.max(ramp.length, exWarm.length) }, (_, i) => {
                  const w = ramp[i];
                  const saved = exWarm[i];
                  if (saved) {
                    return (
                      <ListRow
                        key={saved.id}
                        divider={i > 0}
                        title={setText(saved.weight, saved.reps)}
                        sub={w ? `${w.pct}% · logged` : 'logged'}
                        tone="muted"
                        chevron={false}
                        right={<Icon name="check" size={18} color={color.positive} />}
                        onPress={() => setEditing(saved)}
                        accessibilityLabel={`Warm-up ${i + 1}: ${setText(saved.weight, saved.reps)}. Tap to edit.`}
                      />
                    );
                  }
                  if (!w) return null;
                  return (
                    <ListRow
                      key={`ramp-${i}`}
                      divider={i > 0}
                      title={`${kgNum(w.kg)} kg × ${w.reps}`}
                      sub={`${w.pct}% · tap when done`}
                      chevron={false}
                      onPress={() => logSet(true, w.kg, w.reps)}
                    />
                  );
                })}
              </ListCard>
            ) : null}
          </>
        )}
      </ScrollView>

      {rest.running || current ? (
        <View
          style={[styles.dock, { paddingBottom: insets.bottom + space.md }]}
          // Undo has to sit above Log set, not on it. Measured, because this dock
          // changes height with the rest row, the effort chips and text size (UX-11).
          onLayout={(e) => setToastObstruction(e.nativeEvent.layout.height)}
        >
          {current && !current.skipped ? (
            <SetControls
              weight={weight}
              reps={reps}
              rir={rir}
              pain={pain}
              step={loadType === 'band' ? 1 : step}
              unit={unit}
              weightLabel={weightLabel === null ? null : loadType === 'band' ? 'Band' : loadType === 'bodyweight' ? 'Added weight' : 'Weight'}
              weightSuffix={loadType === 'band' ? undefined : 'kg'}
              weightFooter={weightFooter}
              repsFooter={repsFooter}
              showEffort={!cardio}
              logLabel={`Log set ${exWork.length + 1}`}
              rest={
                <RestTimerBar
                  timer={rest}
                  seconds={cardio ? null : restSeconds}
                  autoStart={settings.restTimerAutoStart}
                  onAutoStart={(v) => setSetting('restTimerAutoStart', v)}
                  onStart={() => void startRest(id, restSeconds, current.exercise.name)}
                />
              }
              expanded={addingExtra}
              onExpand={() => setAddingExtra(true)}
              /*
               * One primary action, in one place: Log set until the target is met,
               * then the next exercise with work left, then — only once everything is
               * done or skipped — on to the cool-down, or the end.
               *
               * The destination is a name the user chose, so it gets its own line
               * under a fixed eyebrow rather than being squeezed into one row with
               * a chevron. See `AdvanceButton`.
               */
              advance={done ? wayOn : undefined}
              onWeight={setWeight}
              onReps={setReps}
              onRir={setRir}
              onPain={setPain}
              onLog={() => logSet(false)}
            />
          ) : (
            // Skipped, or no exercise at all: rest keeps running, and the way on
            // is the same button a finished exercise gets.
            <View style={styles.restOnlyDock}>
              <RestTimerBar timer={rest} seconds={null} autoStart={settings.restTimerAutoStart} onAutoStart={() => undefined} onStart={() => undefined} />
              {current ? <AdvanceButton {...wayOn} /> : null}
            </View>
          )}
        </View>
      ) : null}

      <Sheet
        visible={menuOpen}
        onClose={() => {
          setMenuOpen(false);
          setReordering(false);
        }}
        title="Exercises"
        subtitle={
          <>
            {doneCount} of {plan.length} done · <Elapsed since={session.startedAt} />
          </>
        }
      >
        <SectionHeader
          title="Today's exercises"
          hint={reordering ? 'Move one up or down, or take it off today. Your plan is not changed.' : undefined}
          action={plan.length ? { label: reordering ? 'Done' : 'Edit list', onPress: () => setReordering(!reordering) } : undefined}
        />
        <ListCard>
          {plan.map((p, i) => {
            const st = stateOf(p);
            const work = sets.filter((s) => s.exerciseId === p.exerciseId && s.isWarmup === 0);
            const isNow = i === idx;
            const r = repRange(p);
            const sub = p.skipped
              ? 'Skipped today'
              : work.length && (st === 'done' || !isNow)
                ? setList(work)
                : isNow
                  ? `Set ${work.length + 1} of ${targetOf(p)}${p === current && weightLabel !== null ? ` · ${loadText(weight)}` : ''}`
                  : [`${targetOf(p)} × ${r ? `${r[0]}–${r[1]}` : '?'}`, p.slot?.supersetGroup ? `superset ${p.slot.supersetGroup}` : ''].filter(Boolean).join(' · ');
            return (
              <ListRow
                key={p.exerciseId}
                divider={i > 0}
                left={<StatusMark state={st} now={isNow} />}
                title={p.exercise.name}
                sub={p.adHoc ? `${sub} · added` : sub}
                tone={st === 'todo' || st === 'skipped' ? 'muted' : 'default'}
                chevron={!reordering && !isNow}
                onPress={() => {
                  goTo(i);
                  setMenuOpen(false);
                  setReordering(false);
                }}
                right={
                  reordering ? (
                    <View style={styles.row}>
                      <IconButton icon="chevronUp" accessibilityLabel={`Move ${p.exercise.name} up`} disabled={i === 0} onPress={() => move(i, -1)} />
                      <IconButton icon="chevronDown" accessibilityLabel={`Move ${p.exercise.name} down`} disabled={i === plan.length - 1} onPress={() => move(i, 1)} />
                      {/* Today only. Removing here cannot touch the plan — see `tools`. */}
                      <IconButton
                        icon="trash"
                        accessibilityLabel={`Remove ${p.exercise.name} from today's workout. Your plan is not changed.`}
                        onPress={() => remove(p)}
                      />
                    </View>
                  ) : isNow ? (
                    <Pill label="Now" tone="accent" />
                  ) : null
                }
              />
            );
          })}
        </ListCard>
        <View style={styles.menuEnd}>
          <PrimaryButton
            label="Add exercise"
            tone="neutral"
            icon={<Icon name="plus" size={18} />}
            onPress={() => {
              setMenuOpen(false);
              setPicker({ mode: 'add' });
            }}
          />
          {warmup.items.length ? (
            <PrimaryButton
              label={warmupState === 'pending' ? 'Warm up first' : 'Back to the warm-up'}
              tone="neutral"
              icon={<Icon name="flame" size={16} color={color.accent} />}
              onPress={() => {
                setMenuOpen(false);
                // Back to pending as well as back to the stage: a warm-up marked
                // skipped buys the first big lift an extra light ramp set, and
                // going to do it means that no longer applies.
                setWarmupState(id, 'pending');
                setSessionStage(id, 'warmup');
              }}
            />
          ) : null}
          {/*
            Ending the workout lives here, deliberately. The dock offers Finish only
            once everything is done or skipped; leaving early is a decision, and it
            belongs with the list that shows what is being left (UX-04).
          */}
          <PrimaryButton
            label={settled ? (content.cooldown ? 'Cool-down, then finish' : 'Finish workout') : 'Finish early'}
            size="gym"
            icon={<Icon name="check" size={20} color={color.onAccent} />}
            onPress={finish}
          />
          {/*
            A real alternative, so it looks like one. As a `ghost` it was muted grey
            text with no frame — the app's own "dismiss, go back" weight — which on
            the one destructive action here read as disabled (§1).
          */}
          <PrimaryButton label="Cancel workout" tone="dangerOutline" icon={<Icon name="close" size={16} color={color.danger} />} onPress={cancel} />
          <Text style={styles.captionCenter}>
            Finish saves what you did — unfinished exercises count as partial. Cancel asks first, and never counts as done.
          </Text>
        </View>
      </Sheet>

      <Sheet visible={picker !== null} onClose={() => setPicker(null)} title={picker?.mode === 'swap' ? `Swap ${picker.from.exercise.name}` : 'Add exercise'}>
        {picker?.mode === 'swap' ? <Text style={styles.caption}>Today only — your plan stays the same.</Text> : null}
        <ExercisePicker
          excludeIds={plan.map((p) => p.exerciseId)}
          initialMuscle={picker?.mode === 'swap' ? picker.from.exercise.primaryMuscles[0] : undefined}
          suggestions={swapSuggestions}
          onPick={(ex) => {
            if (picker?.mode === 'swap') {
              const from = picker.from;
              swapSessionExercise(id, from.exerciseId, ex.id);
              toast(`Swapped to ${ex.name} for today`, {
                label: 'Undo',
                onPress: () => swapSessionExercise(id, ex.id, from.exerciseId, from.slot?.startWeight ?? null),
              });
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

/**
 * Where you are in the workout: check-in, warm-up, lifts, cool-down.
 *
 * Carried by every stage, which is the point — a cool-down screen that does not
 * say it is the cool-down reads as a workout you have somehow been given extra
 * exercises for. Stages the workout does not have are not drawn at all, so the
 * strip never promises a warm-up that is not coming.
 *
 * Not a streak and not a score: finished stages go grey, not gold, and nothing
 * here can be broken (AGENTS §6).
 */
function StageStrip({ stages, current }: { stages: readonly SessionStage[]; current: SessionStage }) {
  const at = stages.indexOf(current);
  return (
    <View
      style={styles.stageStrip}
      accessibilityRole="progressbar"
      accessibilityLabel={`Stage ${at + 1} of ${stages.length}: ${STAGE_LABEL[current]}`}
    >
      {stages.map((st, i) => (
        <View key={st} style={styles.stageCell} importantForAccessibility="no-hide-descendants">
          <View style={[styles.stageBar, i < at && styles.stageBarDone, i === at && styles.stageBarNow]} />
          <Text style={[styles.stageLabel, i === at && styles.stageLabelNow]} numberOfLines={1}>
            {STAGE_LABEL[st]}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A small outlined chip inside a hero card: back to the planned numbers in one tap. */
function UseTarget({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={{ top: space.md, bottom: space.md, left: space.sm, right: space.sm }}
      style={({ pressed }) => [styles.useTarget, pressed && styles.pressed]}
    >
      <Text style={styles.useTargetText}>{label}</Text>
    </Pressable>
  );
}

/** One cell of the tool strip under the sets. */
function Tool({ icon, label, a11y, on, onPress }: { icon: IconName; label: string; a11y: string; on?: boolean; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={on === undefined ? undefined : { expanded: on }}
      // Highlight, not scale: these are cells of one strip, and a scaling cell
      // pulls away from the borders it shares with its neighbours.
      feedback="highlight"
      touchStyle={styles.flex1}
      style={styles.tool}
      pressedStyle={styles.toolPressed}
    >
      <Icon name={icon} size={20} color={on ? color.accent : color.textMuted} />
      <Text style={[styles.toolText, on && styles.accentText]} numberOfLines={1}>
        {label}
      </Text>
    </Press>
  );
}

/** Done is a filled tick, the current one a ring with a dot, the rest an empty ring. */
function StatusMark({ state, now }: { state: ExState; now: boolean }) {
  if (state === 'done') {
    return (
      <View style={[styles.mark, styles.markDone]}>
        <Icon name="check" size={14} color={color.bg} strokeWidth={3} />
      </View>
    );
  }
  const ring = now || state === 'partial' ? color.accent : color.border;
  return <View style={[styles.mark, { borderColor: ring }]}>{now ? <View style={styles.markDot} /> : null}</View>;
}

/**
 * What comes after this exercise, with its own numbers. A component of its own so
 * its prescription is worked out once when it appears, not on every tick of the
 * rest timer that re-renders the screen around it.
 */
function UpNext({ p, readiness, ctx, onPress }: { p: PlannedExercise; readiness: Readiness | undefined; ctx: SuggestionContext; onPress: () => void }) {
  const s = useMemo(() => suggestFor(p.exercise, p.slot, readiness, ctx), [p.exerciseId, readiness, ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const lo = p.slot?.repLo ?? s.repTarget[0];
  const hi = p.slot?.repHi ?? s.repTarget[1];
  const load = s.verdict === 'CALIBRATE' ? (p.slot?.startWeight ? kg(p.slot.startWeight) : 'your pick') : s.weight > 0 ? kg(s.weight) : '';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Up next: ${p.exercise.name}`} style={({ pressed }) => [styles.upNext, pressed && styles.pressed]}>
      <View style={styles.flex1}>
        <Text style={styles.eyebrow}>Up next{p.slot?.supersetGroup ? ` · superset ${p.slot.supersetGroup}` : ''}</Text>
        <Text style={styles.upNextName} numberOfLines={2}>
          {p.exercise.name}
        </Text>
      </View>
      <View style={styles.upNextNums}>
        <Text style={styles.upNextSets}>
          {s.sets} × {s.measure === 'time' ? `${lo}–${hi} s` : `${lo}–${hi}`}
        </Text>
        {load ? <Text style={styles.footer}>{load}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs },
  flex: { flex: 1, backgroundColor: color.bg },
  flex1: { flex: 1 },
  scroll: { paddingHorizontal: layout.screenPadding, paddingTop: space.xs, paddingBottom: space.xl, gap: space.md },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.sm, paddingRight: space.md, paddingTop: space.md, gap: space.xs },
  headerText: { flex: 1 },
  headerTitle: { ...font.heading, fontSize: 18, fontWeight: '700', color: color.text },
  headerMeta: { ...font.caption, ...font.numeric, color: color.textMuted },
  listBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: hit.default,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.button,
    backgroundColor: color.surfaceHigh,
    borderWidth: 1,
    borderColor: color.border,
  },
  listBtnText: { ...font.label, fontWeight: '700', ...font.numeric, color: color.text },
  strip: { flexDirection: 'row', gap: space.xs, paddingHorizontal: layout.screenPadding, paddingTop: space.xs, paddingBottom: space.md },
  stripSeg: { flex: 1, height: 4, borderRadius: radius.pill },
  stageStrip: { flexDirection: 'row', gap: space.sm, paddingHorizontal: layout.screenPadding, paddingTop: space.sm, paddingBottom: space.sm },
  stageCell: { flex: 1, gap: space.xs, minWidth: 0 },
  stageBar: { height: 3, borderRadius: radius.pill, backgroundColor: color.surfaceHigh },
  stageBarDone: { backgroundColor: color.border },
  stageBarNow: { backgroundColor: color.accent },
  stageLabel: { ...font.caption, fontSize: 11, lineHeight: 14, fontWeight: '600', color: color.textFaint },
  stageLabelNow: { color: color.text },
  row: { flexDirection: 'row', gap: space.sm },
  rowStart: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  gapTop: { marginTop: space.md },
  cardTitle: { ...font.body, color: color.text, fontWeight: '700' },
  exName: { ...font.title, fontSize: 26, lineHeight: 32, color: color.text },
  meta: { ...font.caption, fontSize: 14, ...font.numeric, color: color.textMuted },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md - 2, minHeight: hit.default - 4 },
  reasonIcon: { width: 24, height: 24, borderRadius: radius.pill, backgroundColor: color.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  reasonText: { ...font.caption, fontSize: 14, lineHeight: 20, color: color.textMuted, flex: 1 },
  reasonVerdict: { fontWeight: '600' },
  why: { color: color.accent, fontWeight: '600' },
  whyBox: { gap: space.sm, backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, padding: space.md, marginTop: space.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.xs, rowGap: space.sm },
  tileCell: { paddingHorizontal: space.xs },
  /**
   * A logged set, and what you check when you forget what you just did.
   *
   * It was 64dp tall with its number set at 16pt in `font.label` — the same size
   * as a caption, for the one figure on the card that is a fact rather than a
   * label. At arm's length on a bench that is unreadable. 84dp, 24pt, in the
   * display face, with the sub-line at textMuted instead of textFaint.
   */
  tile: {
    minHeight: 84,
    paddingVertical: space.md - 2,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    justifyContent: 'space-between',
    gap: 2,
  },
  tileHeld: { backgroundColor: color.surfaceHigh },
  tileNow: { backgroundColor: color.surfaceHigh, borderColor: color.accent },
  tileTodo: { backgroundColor: 'transparent', borderStyle: 'dashed' },
  tileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileLabel: { ...font.eyebrow, fontSize: 10, color: color.textFaint },
  tileVal: { ...font.numeric, fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.6, color: color.text },
  tileGhost: { ...font.numeric, fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.6, color: color.textFaint },
  tileSub: { ...font.caption, fontSize: 12, lineHeight: 15, color: color.textMuted },
  doneCard: { backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.positive, padding: space.lg + 2, gap: space.md },
  doneHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  doneTick: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.positive, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { ...font.heading, fontWeight: '700', color: color.text },
  doneFoot: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderTopWidth: 1, borderTopColor: color.border, paddingTop: space.md },
  strong: { color: color.text, fontWeight: '600' },
  delta: { ...font.caption, fontWeight: '600', ...font.numeric },
  upNext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 76,
    paddingHorizontal: space.lg,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
  },
  eyebrow: { ...font.eyebrow, color: color.textFaint },
  upNextName: { ...font.label, fontWeight: '600', color: color.text, marginTop: 2 },
  upNextNums: { alignItems: 'flex-end' },
  upNextSets: { ...font.label, fontWeight: '700', ...font.numeric, color: color.text },
  tools: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: color.surface, borderRadius: radius.button, borderWidth: 1, borderColor: color.border, overflow: 'hidden' },
  toolCell: { minHeight: hit.gym },
  tool: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.sm, minHeight: hit.gym },
  toolPressed: { backgroundColor: color.surfaceHigh },
  toolText: { ...font.caption, fontSize: 11, lineHeight: 14, fontWeight: '600', color: color.textMuted },
  footer: { ...font.caption, fontSize: 13, color: color.textMuted },
  useTarget: { height: 28, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: color.accent, justifyContent: 'center' },
  useTargetText: { ...font.caption, fontSize: 13, fontWeight: '700', color: color.accent },
  pressed: { opacity: 0.7 },
  body: { ...font.body, color: color.text },
  caption: { ...font.caption, color: color.textMuted },
  captionCenter: { ...font.caption, color: color.textMuted, textAlign: 'center' },
  accentText: { color: color.accent },
  dock: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    backgroundColor: color.bg,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  mark: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  markDone: { backgroundColor: color.positive, borderColor: color.positive },
  markDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: color.accent },
  menuEnd: { gap: space.sm, marginTop: space.sm, paddingBottom: space.md },
  restOnlyDock: { gap: space.sm },
});
