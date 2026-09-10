import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, EmptyState, PrimaryButton, ReasonLine, SectionHeader, Sheet } from '@/components';
import { useLive } from '@/db/live';
import { getDay } from '@/db/repositories/program';
import {
  addAdHocExercise,
  endSession,
  getLastPerformance,
  getSession,
  getSessionPlan,
  getSessionSets,
  insertSet,
  isReadinessDone,
  setSessionOrder,
  skipExercise,
  unskipExercise,
  type SetRow,
} from '@/db/repositories/sessions';
import { useSettings } from '@/db/repositories/settings';
import { ExercisePicker } from '@/features/exercises/ExercisePicker';
import { EditSetSheet } from '@/features/session/EditSetSheet';
import { PlateSheet } from '@/features/session/PlateSheet';
import { readinessFrom, suggestFor, suggestionContext, VERDICT_LABEL } from '@/features/session/prescription';
import { ReadinessPrompt } from '@/features/session/ReadinessPrompt';
import { RestTimerBar } from '@/features/session/RestTimerBar';
import { SetControls } from '@/features/session/SetControls';
import { fmtClock, fmtDayLabel } from '@/lib/date';
import { kg, kgNum } from '@/lib/format';
import { cancelRest, startRest } from '@/services/restTimer';
import { color, font, hit, layout, space } from '@/theme/tokens';

export default function SessionScreen() {
  useKeepAwake();
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id);
  const insets = useSafeAreaInsets();
  const settings = useSettings();

  const session = useLive(() => getSession(id), ['session'], [id]);
  const plan = useLive(() => getSessionPlan(id), ['setting', 'routine_slot', 'set_log', 'exercise'], [id]);
  const sets = useLive(() => getSessionSets(id), ['set_log'], [id]);
  const readinessDone = useLive(() => isReadinessDone(id), ['setting'], [id]);
  const ctx = useMemo(() => suggestionContext(), []);

  const [index, setIndex] = useState<number | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [plates, setPlates] = useState(false);
  const [editing, setEditing] = useState<SetRow | null>(null);
  const [showWarmups, setShowWarmups] = useState(false);

  const workingCount = (exerciseId: string) => sets.filter((s) => s.exerciseId === exerciseId && s.isWarmup === 0).length;

  // Resume where he was: the first exercise neither skipped nor finished.
  const firstOpen = useMemo(() => {
    const i = plan.findIndex((p) => !p.skipped && workingCount(p.exerciseId) < (p.slot?.targetSets ?? 3));
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
    [current?.exerciseId, readiness, ctx],
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
      setWeight(prevTop || (current.exercise.loadType === 'barbell' ? 20 : 0));
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
  const doneCount = plan.filter((p) => p.skipped || workingCount(p.exerciseId) >= (p.slot?.targetSets ?? 3)).length;
  const step = current?.exercise.loadStep ?? 2.5;
  const target = current?.slot ?? null;
  const restSeconds = target?.restSeconds ?? 120;

  const logSet = (asWarmup = false, w = weight, r = reps) => {
    if (!current || !suggestion) return;
    const prev = sets[sets.length - 1];
    insertSet({
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
    if (settings.hapticsEnabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPain(false);
    if (!asWarmup && settings.restTimerAutoStart) void startRest(id, restSeconds, current.exercise.name);
  };

  const move = (from: number, dir: -1 | 1) => {
    const ids = plan.map((p) => p.exerciseId);
    const to = from + dir;
    const a = ids[from];
    const b = ids[to];
    if (a === undefined || b === undefined) return;
    ids[from] = b;
    ids[to] = a;
    setSessionOrder(id, ids);
    if (idx === from) setIndex(to);
    else if (idx === to) setIndex(from);
  };

  const finish = () => {
    void cancelRest();
    const { discarded } = endSession(id);
    router.replace(discarded ? '/' : `/session/summary/${id}`);
  };

  const elapsed = Math.round((Date.now() - Date.parse(session.startedAt)) / 1000);

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} accessibilityLabel="Back to Today">
          <Text style={styles.headerBtnText}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {day?.label ?? 'Workout'}
          </Text>
          <Text style={styles.muted}>
            {doneCount} of {plan.length} · {fmtClock(elapsed)} · {fmtDayLabel(session.date)}
          </Text>
        </View>
        <Pressable onPress={() => setListOpen(true)} style={styles.headerBtn} accessibilityLabel="Exercise list">
          <Text style={styles.headerBtnText}>☰</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
        {!readinessDone && sets.length === 0 ? <ReadinessPrompt sessionId={id} /> : null}

        {!current ? (
          <EmptyState message="Add an exercise to start logging." actionLabel="Add exercise" onAction={() => setAdding(true)} />
        ) : (
          <>
            <View style={styles.exNav}>
              <Pressable disabled={idx === 0} onPress={() => setIndex(idx - 1)} style={styles.navBtn}>
                <Text style={[styles.navText, idx === 0 && styles.dim]}>‹</Text>
              </Pressable>
              <View style={styles.flex}>
                <Text style={styles.exName}>{current.exercise.name}</Text>
                <Text style={styles.muted}>
                  {target ? `${target.targetSets} × ${target.repLo}–${target.repHi} @ RIR ${target.targetRir}` : 'Ad-hoc'}
                  {' · rest '}
                  {fmtClock(restSeconds)}
                  {target?.supersetGroup ? ` · superset ${target.supersetGroup}` : ''}
                </Text>
              </View>
              <Pressable disabled={idx >= plan.length - 1} onPress={() => setIndex(idx + 1)} style={styles.navBtn}>
                <Text style={[styles.navText, idx >= plan.length - 1 && styles.dim]}>›</Text>
              </Pressable>
            </View>

            {suggestion ? (
              <Card tone={suggestion.verdict === 'BACKOFF' || suggestion.verdict === 'RESET' ? 'warning' : 'default'}>
                <View style={styles.rowBetween}>
                  <Text style={styles.hero}>{suggestion.verdict === 'CALIBRATE' ? 'Calibrate' : kg(suggestion.weight)}</Text>
                  <Text style={styles.verdict}>{VERDICT_LABEL[suggestion.verdict]}</Text>
                </View>
                <Text style={styles.muted}>
                  {suggestion.sets} sets · {suggestion.repTarget[0]}–{suggestion.repTarget[1]} reps · RIR {suggestion.targetRIR}
                </Text>
                <ReasonLine text={suggestion.reason} />
                <View style={styles.chips}>
                  {suggestion.verdict !== 'CALIBRATE' ? <PrimaryButton label="Use suggestion" tone="neutral" onPress={prefill} /> : null}
                  {current.exercise.loadType === 'barbell' ? <PrimaryButton label="Plates" tone="neutral" onPress={() => setPlates(true)} /> : null}
                  {suggestion.warmups.length ? (
                    <PrimaryButton
                      label={showWarmups ? 'Hide warm-ups' : `Warm-ups (${suggestion.warmups.length})`}
                      tone="ghost"
                      onPress={() => setShowWarmups(!showWarmups)}
                    />
                  ) : null}
                </View>
                {showWarmups
                  ? suggestion.warmups.map((w, i) => {
                      const done = exWarm.length > i;
                      return (
                        <Pressable key={i} onPress={() => !done && logSet(true, w.weight, w.reps)} style={styles.warm}>
                          <Text style={[styles.body, done && styles.muted]}>
                            {done ? '✓ ' : ''}
                            {kgNum(w.weight)} kg × {w.reps}
                          </Text>
                          {!done ? <Text style={styles.muted}>tap to log</Text> : null}
                        </Pressable>
                      );
                    })
                  : null}
              </Card>
            ) : null}

            <SectionHeader title={`Today · ${exWork.length} of ${target?.targetSets ?? suggestion?.sets ?? 3}`} />
            {exWork.length === 0 ? <Text style={styles.muted}>No sets yet. Long-press a logged set to edit it.</Text> : null}
            {exWork.map((s, i) => (
              <Pressable key={s.id} onLongPress={() => setEditing(s)} style={styles.setRow}>
                <Text style={styles.setIdx}>{i + 1}</Text>
                <Text style={styles.setVal}>
                  {kgNum(s.weight)} kg × {s.reps}
                </Text>
                <Text style={styles.muted}>RIR {s.rir}</Text>
                {s.painFlag ? <Text style={styles.pain}>pain</Text> : null}
              </Pressable>
            ))}

            <SectionHeader title={last ? `Last time · ${fmtDayLabel(last.date)}` : 'Last time'} />
            <Text style={styles.body}>
              {last
                ? last.sets
                    .filter((s) => s.isWarmup === 0)
                    .map((s) => `${kgNum(s.weight)}×${s.reps}`)
                    .join('   ')
                : 'Nothing logged yet for this exercise.'}
            </Text>

            <View style={styles.chips}>
              {current.skipped ? (
                <PrimaryButton label="Un-skip" tone="neutral" onPress={() => unskipExercise(id, current.exerciseId)} />
              ) : (
                <PrimaryButton
                  label="Skip today"
                  tone="ghost"
                  onPress={() => {
                    skipExercise(id, current.exerciseId);
                    if (idx < plan.length - 1) setIndex(idx + 1);
                  }}
                />
              )}
              {idx < plan.length - 1 ? (
                <PrimaryButton
                  label="Next exercise ›"
                  tone={exWork.length >= (target?.targetSets ?? 3) ? 'accent' : 'neutral'}
                  onPress={() => setIndex(idx + 1)}
                />
              ) : (
                <PrimaryButton label="Finish workout" tone={doneCount === plan.length ? 'accent' : 'neutral'} onPress={finish} />
              )}
            </View>
          </>
        )}
      </ScrollView>

      {current ? (
        <View style={[styles.controls, { paddingBottom: insets.bottom + space.sm }]}>
          <RestTimerBar sessionId={id} />
          <SetControls
            weight={weight}
            reps={reps}
            rir={rir}
            pain={pain}
            step={step}
            onWeight={setWeight}
            onReps={setReps}
            onRir={setRir}
            onPain={setPain}
            onLog={() => logSet(false)}
          />
        </View>
      ) : null}

      <Sheet visible={listOpen} onClose={() => setListOpen(false)} title="Exercises">
        {plan.map((p, i) => (
          <View key={p.exerciseId} style={styles.listRow}>
            <Pressable
              style={styles.flex}
              onPress={() => {
                setIndex(i);
                setListOpen(false);
              }}
            >
              <Text style={[styles.body, i === idx && styles.accent, p.skipped && styles.muted]}>
                {p.exercise.name}
                {p.skipped ? ' · skipped' : ''}
              </Text>
              <Text style={styles.muted}>
                {workingCount(p.exerciseId)} / {p.slot?.targetSets ?? '—'} sets{p.adHoc ? ' · added' : ''}
              </Text>
            </Pressable>
            <Pressable onPress={() => move(i, -1)} disabled={i === 0} style={styles.navBtn}>
              <Text style={[styles.navText, i === 0 && styles.dim]}>↑</Text>
            </Pressable>
            <Pressable onPress={() => move(i, 1)} disabled={i === plan.length - 1} style={styles.navBtn}>
              <Text style={[styles.navText, i === plan.length - 1 && styles.dim]}>↓</Text>
            </Pressable>
          </View>
        ))}
        <View style={styles.chips}>
          <PrimaryButton
            label="Add exercise"
            tone="neutral"
            onPress={() => {
              setListOpen(false);
              setAdding(true);
            }}
          />
          <PrimaryButton label="Finish workout" onPress={finish} />
        </View>
      </Sheet>

      <Sheet visible={adding} onClose={() => setAdding(false)} title="Add exercise">
        <ExercisePicker
          excludeIds={plan.map((p) => p.exerciseId)}
          onPick={(ex) => {
            addAdHocExercise(id, ex.id);
            setAdding(false);
            setIndex(plan.length);
          }}
        />
      </Sheet>

      <PlateSheet visible={plates} weight={weight} onClose={() => setPlates(false)} />
      <EditSetSheet set={editing} step={step} onClose={() => setEditing(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  scroll: { padding: layout.screenPadding, paddingBottom: space.xxxl },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, gap: space.sm, paddingBottom: space.sm },
  headerBtn: { width: hit.default, height: hit.default, alignItems: 'center', justifyContent: 'center' },
  headerBtnText: { ...font.title, color: color.text },
  headerText: { flex: 1 },
  headerTitle: { ...font.heading, color: color.text },
  exNav: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  navBtn: { width: hit.default, height: hit.default, alignItems: 'center', justifyContent: 'center' },
  navText: { ...font.title, color: color.text },
  dim: { color: color.textFaint },
  exName: { ...font.title, color: color.text },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  hero: { ...font.display, ...font.numeric, color: color.text },
  verdict: { ...font.label, color: color.accent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  warm: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.sm, minHeight: hit.default, alignItems: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, minHeight: hit.default },
  setIdx: { ...font.label, color: color.textFaint, width: space.xl },
  setVal: { ...font.heading, ...font.numeric, color: color.text, flex: 1 },
  pain: { ...font.caption, color: color.danger },
  body: { ...font.body, color: color.text },
  muted: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  accent: { color: color.accent },
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
    gap: space.xs,
    paddingVertical: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
});
