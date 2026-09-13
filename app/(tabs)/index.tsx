import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, confirm, Icon, IconButton, PrimaryButton, Screen, toast } from '@/components';
import { CATALOG_BY_ID } from '@/data/catalog';
import { useLive } from '@/db/live';
import { getCheckIn } from '@/db/repositories/body';
import { getActiveRoutine, getDay, getDays, getSlots, resolveNextDay } from '@/db/repositories/program';
import { recentMuscles } from '@/db/repositories/progress';
import { cancelSession, deleteSession, getActiveSession, getSessionSets, listSessions, planProgress, skipDay, startSession, type SessionStatus } from '@/db/repositories/sessions';
import { useSettings } from '@/db/repositories/settings';
import { estimateSeconds, fitSession, type FitSlot } from '@/engine/planner';
import { recoverySession } from '@/engine/recovery';
import { WARMUP_BUDGET_S } from '@/engine/warmup';
import { CheckInCard } from '@/features/checkin/CheckInCard';
import { CheckInSheet } from '@/features/checkin/CheckInSheet';
import { drillKit } from '@/features/profile';
import { Elapsed } from '@/features/session/Elapsed';
import { fmtSet, suggestFor, suggestionContext } from '@/features/session/prescription';
import { RoutineSheet } from '@/features/warmup/RoutineSheet';
import { addDays, parseISODate, todayISO, weekStartISO } from '@/lib/date';
import { kg } from '@/lib/format';
import { cancelRest } from '@/services/restTimer';
import { color, font, layout, space } from '@/theme/tokens';

const BUDGETS = [0, 45, 30, 20];
const WEEK_STATUSES: readonly SessionStatus[] = ['completed', 'partial', 'skipped', 'cancelled'];

/**
 * Today: the check-in first, then the workout. Start offers the check-in once a
 * day — optional, one tap to skip — so the workout begins with today's readiness.
 */
export default function Today() {
  const settings = useSettings();
  const today = todayISO();
  const state = useLive(
    () => {
      const active = getActiveSession();
      const routine = getActiveRoutine();
      return {
        active,
        activeSets: active ? getSessionSets(active.id).filter((s) => s.isWarmup === 0).length : 0,
        activeProgress: active ? planProgress(active.id) : null,
        activeDay: active?.routineDayId ? getDay(active.routineDayId) : undefined,
        routine,
        days: routine ? getDays(routine.id) : [],
        next: routine ? resolveNextDay(routine.id) : undefined,
        checkedIn: getCheckIn(today) !== undefined,
        trainedToday: listSessions(5).some((s) => s.date === today),
        week: listSessions(20, WEEK_STATUSES),
      };
    },
    ['session', 'set_log', 'session_exercise', 'exercise', 'routine', 'routine_day', 'check_in', 'setting'],
    [today],
  );

  const [pickedDayId, setPickedDayId] = useState<string | null>(null);
  const [budget, setBudget] = useState(0);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  /** Open check-in sheet; `start` is set when it was opened by a Start button. */
  const [checkIn, setCheckIn] = useState<{ start?: () => void } | null>(null);
  const day = state.days.find((d) => d.id === pickedDayId) ?? state.next;

  const preview = useLive(
    () => {
      if (!day) return [];
      const ctx = suggestionContext();
      return getSlots(day.id).map((s) => ({ slot: s, suggestion: suggestFor(s.exercise, s, undefined, ctx) }));
    },
    ['routine', 'routine_day', 'routine_slot', 'exercise', 'exercise_session_stat', 'exercise_link', 'equipment', 'session', 'set_log', 'setting'],
    [day?.id],
  );
  const kit = drillKit(settings);
  const recovery = useMemo(() => (recoveryOpen ? recoverySession(recentMuscles(2), kit) : { items: [], seconds: 0 }), [recoveryOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!settings.setupDone) return <Redirect href="/setup" />;

  const title = settings.name ? `Hi, ${settings.name.split(' ')[0]}` : 'Today';
  const subtitle = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const gear = <IconButton icon="settings" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />;
  const weekStrip = <WeekStrip today={today} sessions={state.week} trainingDays={settings.trainingDays} />;

  const begin = (start: () => void) => (state.checkedIn ? start() : setCheckIn({ start }));
  const pendingStart = checkIn?.start;
  const checkInCard = <CheckInCard trend onCheckIn={() => setCheckIn({})} />;
  const checkInSheet = (
    <CheckInSheet
      visible={checkIn !== null}
      onClose={() => setCheckIn(null)}
      onStart={
        pendingStart
          ? () => {
              setCheckIn(null);
              pendingStart();
            }
          : undefined
      }
    />
  );
  const startEmpty = () => begin(() => router.push(`/session/${startSession(null).id}`));

  const restDay = !settings.trainingDays.includes(new Date().getDay());
  const recoveryCard =
    restDay || state.trainedToday ? (
      <Card onPress={() => setRecoveryOpen(true)}>
        <View style={styles.rowCenter}>
          <Icon name="moon" size={20} color={color.accent} />
          <View style={styles.flex1}>
            <Text style={styles.rowTitle}>{state.trainedToday ? 'Done for today' : 'Rest day'}: easy mobility</Text>
            <Text style={styles.muted}>About 8 minutes, gentle. Optional.</Text>
          </View>
          <Icon name="chevronRight" size={18} color={color.textMuted} />
        </View>
      </Card>
    ) : null;
  const recoverySheet = (
    <RoutineSheet
      visible={recoveryOpen}
      title="Recovery"
      routine={recovery}
      available={kit}
      onClose={() => setRecoveryOpen(false)}
      doneLabel="Done"
      onDone={() => {
        setRecoveryOpen(false);
        toast('Nice — recovery done');
      }}
    />
  );

  /* ---------------------------- in progress ----------------------------- */
  if (state.active) {
    const a = state.active;
    const p = state.activeProgress;
    const discard = () => {
      const drop = (keep: boolean) => {
        void cancelRest();
        cancelSession(a.id, keep);
        toast(keep ? 'Workout cancelled — logged sets kept' : 'Workout discarded');
      };
      if (state.activeSets === 0) return drop(false);
      confirm({
        title: 'Discard this workout?',
        message: `You logged ${state.activeSets} ${state.activeSets === 1 ? 'set' : 'sets'}. Keep them in history (the day won't count as done), or delete everything.`,
        confirmLabel: 'Delete all',
        destructive: true,
        onConfirm: () => drop(false),
        alternative: { label: 'Keep sets', onPress: () => drop(true) },
      });
    };
    return (
      <View style={styles.flex}>
        <Screen title={title} subtitle={subtitle} right={gear}>
          {checkInCard}
          <Card tone="accent">
            <Text style={styles.eyebrow}>In progress</Text>
            <Text style={styles.cardTitle}>{state.activeDay?.label ?? 'Workout'}</Text>
            <View style={styles.stats}>
              <Stat value={String(state.activeSets)} label="sets" />
              {p && p.planned > 0 ? <Stat value={`${p.done + p.skipped}/${p.planned}`} label="exercises" /> : null}
              <Stat value={<Elapsed since={a.startedAt} />} label="elapsed" />
            </View>
          </Card>
          <PrimaryButton label="Discard workout" tone="ghost" icon={<Icon name="trash" size={16} color={color.textMuted} />} onPress={discard} />
          <View style={styles.gap} />
          {weekStrip}
          {checkInSheet}
        </Screen>
        <ActionBar>
          <PrimaryButton label="Resume workout" size="gym" icon={<Icon name="play" size={18} color={color.onAccent} />} onPress={() => router.push(`/session/${a.id}`)} />
        </ActionBar>
      </View>
    );
  }

  /* ------------------------------ no plan -------------------------------- */
  if (!state.routine || !day) {
    const routine = state.routine;
    return (
      <Screen title={title} subtitle={subtitle} right={gear}>
        {checkInCard}
        <Card>
          <Text style={styles.cardTitle}>{routine ? `${routine.name} has no days yet` : 'No active plan'}</Text>
          <Text style={styles.muted}>{routine ? 'Add a day and some exercises to get started.' : 'Pick a ready-made plan or build your own.'}</Text>
          <PrimaryButton label={routine ? 'Edit plan' : 'Choose a plan'} style={styles.gapTop} onPress={() => router.push(routine ? `/plan/${routine.id}` : '/program')} />
        </Card>
        <PrimaryButton label="Start an empty workout" tone="ghost" icon={<Icon name="plus" size={16} />} onPress={startEmpty} />
        {recoveryCard}
        <View style={styles.gap} />
        {weekStrip}
        {recoverySheet}
        {checkInSheet}
      </Screen>
    );
  }

  /* ----------------------------- next day -------------------------------- */
  const slots: FitSlot[] = preview.map(({ slot }) => {
    const c = CATALOG_BY_ID.get(slot.exerciseId);
    return { exerciseId: slot.exerciseId, sets: slot.targetSets, restSeconds: slot.restSeconds, compound: c?.compound ?? true, repHi: slot.repHi, measure: c?.measure };
  });
  const fullMinutes = Math.round((estimateSeconds(slots) + WARMUP_BUDGET_S[settings.warmupMode]) / 60 / 5) * 5;
  const budgets = BUDGETS.filter((m) => m === 0 || m < fullMinutes);
  const fit = budget > 0 && budget < fullMinutes ? fitSession(slots, budget, WARMUP_BUDGET_S.quick) : null;
  const fitSets = new Map((fit?.slots ?? []).map((s) => [s.exerciseId, s.sets]));

  const skip = () => {
    const id = skipDay(day.id);
    setPickedDayId(null);
    toast(`Skipped ${day.label}`, { label: 'Undo', onPress: () => deleteSession(id) });
  };

  return (
    <View style={styles.flex}>
      <Screen title={title} subtitle={subtitle} right={gear}>
        {checkInCard}
        {restDay && !state.trainedToday ? recoveryCard : null}

        <View style={styles.workoutHead}>
          <Text style={styles.eyebrow}>
            {day.id === state.next?.id ? 'Up next in' : 'Chosen from'} {state.routine.name}
          </Text>
          <Text style={styles.dayTitle}>{day.label}</Text>
          <Text style={styles.muted}>
            {preview.length} {preview.length === 1 ? 'exercise' : 'exercises'}, about {fit ? fit.minutes : fullMinutes} minutes
          </Text>
        </View>

        {state.days.length > 1 ? (
          <View style={styles.chipsGap}>
            <ChipRow options={state.days.map((d) => ({ label: d.label, value: d.id }))} value={day.id} onChange={setPickedDayId} fill={false} />
          </View>
        ) : null}

        <Card style={styles.list}>
          {preview.length === 0 ? <Text style={styles.muted}>No exercises on this day yet.</Text> : null}
          {preview.map(({ slot, suggestion }, i) => {
            const cut = fit !== null && !fitSets.has(slot.exerciseId);
            const sets = fitSets.get(slot.exerciseId) ?? slot.targetSets;
            const measure = suggestion.measure;
            return (
              <View key={slot.id} style={[styles.exRow, i > 0 && styles.divider, cut && styles.cut]}>
                <Text style={styles.exIdx}>{i + 1}</Text>
                <View style={styles.flex1}>
                  <Text style={[styles.exName, cut && styles.strike]} numberOfLines={1}>
                    {slot.exercise.name}
                  </Text>
                  <Text style={styles.exMeta}>
                    {cut ? 'left out today' : `${sets} × ${slot.repLo}–${slot.repHi}${measure === 'time' ? ' s' : ''}`}
                    {!cut && slot.supersetGroup ? <Text style={styles.exAside}>{`   with ${slot.supersetGroup}`}</Text> : null}
                  </Text>
                </View>
                {!cut ? (
                  <Text style={styles.exWeight}>
                    {suggestion.verdict === 'CALIBRATE'
                      ? slot.startWeight
                        ? kg(slot.startWeight)
                        : 'new'
                      : measure === 'time'
                        ? fmtSet('time', suggestion.weight, suggestion.repTarget[0])
                        : suggestion.weight > 0
                          ? kg(suggestion.weight)
                          : '—'}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </Card>

        {budgets.length > 1 ? (
          <View style={styles.budget}>
            <Text style={styles.label}>Short on time?</Text>
            <ChipRow options={budgets.map((m) => ({ label: m === 0 ? 'Full' : `${m} min`, value: m }))} value={budget} onChange={setBudget} />
            {fit ? (
              <Text style={styles.muted}>
                Keeps the main lifts{fit.trimmed.length ? `, trims ${fit.trimmed.length}` : ''}
                {fit.dropped.length ? `, leaves out ${fit.dropped.length}` : ''}, quick warm-up{fit.over ? ', still a little over' : ''}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.secondary}>
          <PrimaryButton label="Skip day" tone="ghost" icon={<Icon name="skip" size={16} />} style={styles.flex1} onPress={skip} />
          <PrimaryButton label="Empty workout" tone="ghost" icon={<Icon name="plus" size={16} />} style={styles.flex1} onPress={startEmpty} />
        </View>
        {state.trainedToday ? recoveryCard : null}
        <View style={styles.gap} />
        {weekStrip}
        {recoverySheet}
        {checkInSheet}
      </Screen>
      <ActionBar>
        <PrimaryButton
          label={`Start ${day.label}${fit ? ` · ${budget} min` : ''}`}
          size="gym"
          icon={<Icon name="play" size={18} color={color.onAccent} />}
          onPress={() => begin(() => router.push(`/session/${startSession(day.id, fit ? { fit: fit.slots } : {}).id}`))}
        />
      </ActionBar>
    </View>
  );
}

/**
 * The current week at a glance. Deliberately not a streak: a missed day is a plain
 * empty circle, never a broken chain (AGENTS §6).
 */
function WeekStrip({ today, sessions, trainingDays }: { today: string; sessions: { date: string; status: SessionStatus }[]; trainingDays: number[] }) {
  const start = weekStartISO(today);
  const byDate = new Map(sessions.map((s) => [s.date, s.status]));
  return (
    <View style={styles.week}>
      {Array.from({ length: 7 }, (_, i) => {
        const date = addDays(start, i);
        const status = byDate.get(date);
        const planned = trainingDays.includes(parseISODate(date).getDay());
        const isToday = date === today;
        const trained = status === 'completed' || status === 'partial' || status === 'cancelled';
        return (
          <View key={date} style={styles.weekDay}>
            <Text style={[styles.weekLabel, isToday && styles.weekLabelOn]}>{'MTWTFSS'[i]}</Text>
            <View
              style={[
                styles.weekDot,
                trained && { backgroundColor: status === 'completed' ? color.accent : color.accentSoft },
                !trained && planned && styles.weekPlanned,
                isToday && styles.weekToday,
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

function ActionBar({ children }: { children: React.ReactNode }) {
  return <View style={styles.actionBar}>{children}</View>;
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  week: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.sm, marginBottom: space.md },
  weekDay: { alignItems: 'center', gap: space.xs },
  weekLabel: { ...font.caption, color: color.textFaint },
  weekLabelOn: { color: color.text, fontWeight: '700' },
  weekDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.surfaceHigh },
  weekPlanned: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.border },
  weekToday: { borderWidth: 1, borderColor: color.accent },
  flex: { flex: 1, backgroundColor: color.bg },
  flex1: { flex: 1 },
  gap: { height: space.lg },
  gapTop: { marginTop: space.lg },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowTitle: { ...font.body, color: color.text, fontWeight: '600' },
  // The card above already leaves gap.between; this makes the workout its own section.
  workoutHead: { marginTop: space.lg },
  eyebrow: { ...font.caption, color: color.textMuted },
  exAside: { color: color.textFaint },
  dayTitle: { ...font.title, color: color.text, marginTop: space.xs },
  cardTitle: { ...font.heading, color: color.text, marginTop: space.xs },
  muted: { ...font.label, color: color.textMuted, marginTop: space.xs },
  label: { ...font.label, color: color.text, fontWeight: '600' },
  chipsGap: { marginTop: space.lg },
  list: { marginTop: space.lg, paddingVertical: space.xs },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  cut: { opacity: 0.45 },
  strike: { textDecorationLine: 'line-through' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  exIdx: { ...font.label, ...font.numeric, color: color.textFaint, width: space.lg },
  exName: { ...font.body, color: color.text, fontWeight: '600' },
  exMeta: { ...font.caption, ...font.numeric, color: color.textMuted, marginTop: 2 },
  exWeight: { ...font.body, ...font.numeric, color: color.text, fontWeight: '600' },
  budget: { gap: space.sm, marginBottom: space.md },
  secondary: { flexDirection: 'row', gap: space.sm },
  stats: { flexDirection: 'row', gap: space.xl, marginTop: space.md },
  stat: { gap: 2 },
  statValue: { ...font.heading, ...font.numeric, color: color.text },
  statLabel: { ...font.caption, color: color.textMuted },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.md,
    backgroundColor: color.bg,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
});
