import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, Icon, IconButton, ListCard, ListRow, Pill, PrimaryButton, Screen, SectionHeader, toast } from '@/components';
import { CATALOG_BY_ID } from '@/data/catalog';
import { useLive } from '@/db/live';
import { getActiveRoutine, getDay, getDays, getSlots, resolveNextDay } from '@/db/repositories/program';
import { recentMuscles, recentWorkouts } from '@/db/repositories/progress';
import { deleteSession, getActiveSession, getSessionSets, listSessions, planProgress, savedSetCount, skipDay, startSession, type SessionStatus } from '@/db/repositories/sessions';
import { useSettings } from '@/db/repositories/settings';
import { estimateSeconds, fitSession, type FitSlot } from '@/engine/planner';
import { recoverySession } from '@/engine/recovery';
import { WARMUP_BUDGET_S } from '@/engine/warmup';
import { CheckInRow } from '@/features/checkin/CheckInRow';
import { CheckInSheet } from '@/features/checkin/CheckInSheet';
import { drillKit } from '@/features/profile';
import { cancelWorkout } from '@/features/session/cancel';
import { Elapsed } from '@/features/session/Elapsed';
import { fmtSet, suggestFor, suggestionContext } from '@/features/session/prescription';
import { STATUS_LABEL, STATUS_TONE } from '@/features/session/status';
import { RoutineSheet } from '@/features/warmup/RoutineSheet';
import { addDays, fmtDayLabel, parseISODate, todayISO, weekStartISO } from '@/lib/date';
import { kg } from '@/lib/format';
import { color, font, radius, space } from '@/theme/tokens';

const BUDGETS = [0, 45, 30, 20];
const WEEK_STATUSES: readonly SessionStatus[] = ['completed', 'partial', 'skipped', 'cancelled'];
/** Only these count as work done today. Cancelled is never completed (AGENTS §1.4). */
const TRAINED: readonly SessionStatus[] = ['completed', 'partial'];
const WEEK_WORDS: Record<SessionStatus, string> = {
  completed: 'trained',
  partial: 'trained, partly',
  cancelled: 'started, cancelled',
  skipped: 'skipped',
  active: 'in progress',
};
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Today: the workout, first.
 *
 * It used to open with the check-in card in every state — a title, a hint, three
 * cells and a weight chart — with the workout below it, so on a 360dp phone the
 * thing the screen exists for started below the fold. And Start intercepted itself
 * to offer the check-in sheet whenever none existed that day, which put a modal
 * between someone standing in a gym and their first set (UX-02).
 *
 * Now: what you are doing, then the optional context, then the detail. Start
 * starts, using whatever readiness is already saved; the check-in is a row you can
 * tap, and opening it deliberately still offers Save and start. The full weight
 * trend lives on Body, with the rest of it.
 */
export default function Today() {
  const settings = useSettings();
  const today = todayISO();
  const state = useLive(
    () => {
      const active = getActiveSession();
      const routine = getActiveRoutine();
      const recent = listSessions(10);
      return {
        active,
        activeSets: active ? getSessionSets(active.id).filter((s) => s.isWarmup === 0).length : 0,
        // Every persisted row, warm-ups included: what cancelling would destroy.
        activeSaved: active ? savedSetCount(active.id) : 0,
        activeProgress: active ? planProgress(active.id) : null,
        activeDay: active?.routineDayId ? getDay(active.routineDayId) : undefined,
        routine,
        days: routine ? getDays(routine.id) : [],
        next: routine ? resolveNextDay(routine.id) : undefined,
        // A workout cancelled today is not a workout done today.
        finishedToday: recent.find((s) => s.date === today && TRAINED.includes(s.status)),
        week: listSessions(20, WEEK_STATUSES),
        recent: recentWorkouts(2),
      };
    },
    ['session', 'set_log', 'session_exercise', 'exercise', 'routine', 'routine_day', 'check_in', 'setting'],
    [today],
  );

  const [pickedDayId, setPickedDayId] = useState<string | null>(null);
  const [budget, setBudget] = useState(0);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [checkIn, setCheckIn] = useState(false);
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
  const week = (
    <>
      <SectionHeader title="This week" />
      <WeekStrip today={today} sessions={state.week} trainingDays={settings.trainingDays} />
      <Text style={styles.footnote}>A missed day is just an empty ring. Nothing counts against you.</Text>
    </>
  );
  const recent = state.recent.length ? (
    <>
      <SectionHeader title="Recent workouts" action={{ label: 'See all', onPress: () => router.push('/history'), accessibilityLabel: 'See all workout history' }} />
      <ListCard>
        {state.recent.map((w, i) => (
          <ListRow
            key={w.session.id}
            divider={i > 0}
            title={w.dayLabel ?? 'Workout'}
            sub={`${fmtDayLabel(w.session.date)} · ${w.sets} ${w.sets === 1 ? 'set' : 'sets'}`}
            right={<Pill label={STATUS_LABEL[w.session.status]} tone={STATUS_TONE[w.session.status]} />}
            onPress={() => router.push(`/session/summary/${w.session.id}`)}
          />
        ))}
        <ListRow divider title="All workout history" tone="accent" onPress={() => router.push('/history')} />
      </ListCard>
    </>
  ) : null;
  const checkInRow = <CheckInRow onCheckIn={() => setCheckIn(true)} />;
  const checkInSheet = <CheckInSheet visible={checkIn} onClose={() => setCheckIn(false)} />;
  const startEmpty = () => router.push(`/session/${startSession(null).id}`);

  const restDay = !settings.trainingDays.includes(new Date().getDay());
  const recoveryCard = (
    <ListCard>
      <ListRow left={<Icon name="moon" size={20} color={color.accent} />} title="Easy mobility" sub="About 8 minutes, gentle. Optional." onPress={() => setRecoveryOpen(true)} />
    </ListCard>
  );
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
    return (
      <Screen
        title={title}
        subtitle={subtitle}
        right={gear}
        tab
        dock={<PrimaryButton label="Resume workout" size="gym" icon={<Icon name="play" size={18} color={color.onAccent} />} onPress={() => router.push(`/session/${a.id}`)} />}
      >
        <Card tone="accent" style={styles.hero}>
          <Text style={styles.eyebrow}>In progress</Text>
          <Text style={styles.dayTitle}>{state.activeDay?.label ?? 'Workout'}</Text>
          <View style={styles.stats}>
            <Stat value={String(state.activeSets)} label="sets" />
            {p && p.planned > 0 ? <Stat value={`${p.done + p.skipped}/${p.planned}`} label="exercises" /> : null}
            <Stat value={<Elapsed since={a.startedAt} />} label="elapsed" />
          </View>
        </Card>
        {checkInRow}
        <PrimaryButton
          label="Cancel workout"
          tone="ghost"
          style={styles.gapTop}
          icon={<Icon name="trash" size={16} color={color.textMuted} />}
          onPress={() => cancelWorkout(a.id, state.activeSaved)}
        />
        {week}
        {checkInSheet}
      </Screen>
    );
  }

  /* ------------------------------ no plan -------------------------------- */
  if (!state.routine || !day) {
    const routine = state.routine;
    return (
      <Screen
        title={title}
        subtitle={subtitle}
        right={gear}
        tab
        dock={<PrimaryButton label="Start an empty workout" size="gym" icon={<Icon name="plus" size={18} color={color.onAccent} />} onPress={startEmpty} />}
      >
        <Card style={styles.hero}>
          <Text style={styles.eyebrow}>{routine ? routine.name : 'Plans'}</Text>
          <Text style={styles.cardTitle}>{routine ? `${routine.name} has no days yet` : 'No active plan'}</Text>
          <Text style={styles.muted}>{routine ? 'Add a day and some exercises to get started.' : 'Pick a ready-made plan or build your own.'}</Text>
          <PrimaryButton label={routine ? 'Edit plan' : 'Choose a plan'} tone="neutral" style={styles.gapTop} onPress={() => router.push(routine ? `/plan/${routine.id}` : '/program')} />
        </Card>
        {checkInRow}
        {restDay ? <View style={styles.gapTop}>{recoveryCard}</View> : null}
        {week}
        {recent}
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
  /** One tap, with or without a check-in: the engine uses whatever readiness is saved. */
  const start = () => router.push(`/session/${startSession(day.id, fit ? { fit: fit.slots } : {}).id}`);

  // Three states share this screen: a rest day, a workout already finished today,
  // or neither. They change the words and the emphasis, not the layout.
  const done = state.finishedToday;
  const eyebrow = done ? 'Done for today' : restDay ? `Rest day · ${state.routine.name}` : `${day.id === state.next?.id ? 'Up next' : 'Chosen'} · ${state.routine.name}`;
  const startLabel = done ? 'Start another workout' : restDay ? 'Train anyway' : `Start ${day.label}${fit ? ` · ${budget} min` : ''}`;

  return (
    <Screen
      title={title}
      subtitle={subtitle}
      right={gear}
      tab
      dock={
        <PrimaryButton
          label={startLabel}
          size="gym"
          // Quieter once the day's work is already logged — still one tap away.
          tone={done ? 'neutral' : 'accent'}
          icon={<Icon name="play" size={18} color={done ? color.text : color.onAccent} />}
          onPress={start}
        />
      }
    >
      {/* What you are doing, and the two decisions that change it, in one card. */}
      <Card style={styles.hero}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <View style={styles.titleRow}>
          <Text style={styles.dayTitle} numberOfLines={1}>
            {done ? (done.status === 'partial' ? 'Workout logged' : 'Workout done') : day.label}
          </Text>
          <Text style={styles.titleMeta}>
            {done
              ? `${day.label} is next`
              : `${preview.length} ${preview.length === 1 ? 'exercise' : 'exercises'} · about ${fit ? fit.minutes : fullMinutes} min`}
          </Text>
        </View>
        {restDay && !done ? <Text style={styles.muted}>Not a training day. Train anyway if you want to.</Text> : null}
        {!done && state.days.length > 1 ? (
          <Choice label="Day">
            <ChipRow
              options={state.days.map((d) => ({ label: d.label, value: d.id }))}
              value={day.id}
              onChange={(v) => setPickedDayId(v)}
              columns={Math.min(4, state.days.length)}
            />
          </Choice>
        ) : null}
        {!done && budgets.length > 1 ? (
          <Choice label="Time">
            <ChipRow options={budgets.map((m) => ({ label: m === 0 ? 'Full' : `${m} min`, value: m }))} value={budget} onChange={setBudget} columns={4} />
          </Choice>
        ) : null}
        {fit ? (
          <Text style={styles.muted}>
            Keeps the main lifts{fit.trimmed.length ? `, trims ${fit.trimmed.length}` : ''}
            {fit.dropped.length ? `, leaves out ${fit.dropped.length}` : ''}, quick warm-up{fit.over ? ', still a little over' : ''}
          </Text>
        ) : null}
      </Card>

      {/* Optional context, one row. */}
      {checkInRow}

      <ListCard style={styles.gapTop}>
        {preview.length === 0 ? <ListRow title="No exercises on this day yet." tone="muted" /> : null}
        {preview.map(({ slot, suggestion }, i) => {
          const cut = fit !== null && !fitSets.has(slot.exerciseId);
          const sets = fitSets.get(slot.exerciseId) ?? slot.targetSets;
          const measure = suggestion.measure;
          const load =
            suggestion.verdict === 'CALIBRATE'
              ? slot.startWeight
                ? kg(slot.startWeight)
                : 'new'
              : measure === 'time'
                ? fmtSet('time', suggestion.weight, suggestion.repTarget[0])
                : suggestion.weight > 0
                  ? kg(suggestion.weight)
                  : '—';
          return (
            <ListRow
              key={slot.id}
              divider={i > 0}
              left={<Text style={styles.exIdx}>{i + 1}</Text>}
              title={slot.exercise.name}
              sub={cut ? 'left out today' : `${sets} × ${slot.repLo}–${slot.repHi}${measure === 'time' ? ' s' : ''}${slot.supersetGroup ? `   with ${slot.supersetGroup}` : ''}`}
              tone={cut ? 'muted' : 'default'}
              right={cut ? null : <Text style={styles.exWeight}>{load}</Text>}
            />
          );
        })}
      </ListCard>

      <SectionHeader title="Other options" />
      <View style={styles.pair}>
        <PrimaryButton label="Skip day" tone="neutral" icon={<Icon name="skip" size={16} />} style={styles.flex1} onPress={skip} />
        <PrimaryButton label="Empty workout" tone="neutral" icon={<Icon name="plus" size={16} />} style={styles.flex1} onPress={startEmpty} />
      </View>
      <View style={styles.gapTop}>{recoveryCard}</View>
      {week}
      {recent}
      {recoverySheet}
      {checkInSheet}
    </Screen>
  );
}

/** A labelled row of chips inside the hero card: "Day", "Time". */
function Choice({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.choice}>
      <Text style={styles.choiceLabel}>{label}</Text>
      <View style={styles.flex1}>{children}</View>
    </View>
  );
}

/**
 * The current week at a glance. Deliberately not a streak: a missed day is a plain
 * empty ring, never a broken chain (AGENTS §6).
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
        // A cancelled day is shown as having happened, never as completed — the
        // filled dot is reserved for 'completed' and says so to a screen reader.
        const trained = status === 'completed' || status === 'partial' || status === 'cancelled';
        const word = trained ? 'trained' : status === 'skipped' ? 'skipped' : planned && date > today ? 'planned' : '';
        return (
          <View
            key={date}
            style={styles.weekDay}
            accessible
            accessibilityLabel={`${DAY_NAMES[i]}: ${status ? WEEK_WORDS[status] : planned ? 'planned' : 'nothing planned'}`}
          >
            <Text style={[styles.weekLabel, isToday && styles.weekLabelOn]}>{'MTWTFSS'[i]}</Text>
            <View
              style={[
                styles.weekDot,
                trained && { backgroundColor: status === 'completed' ? color.accent : color.accentSoft, borderColor: color.surfaceHigh },
                !trained && planned && styles.weekPlanned,
                isToday && !trained && styles.weekToday,
              ]}
            />
            <Text style={styles.weekWord}>{word}</Text>
          </View>
        );
      })}
    </View>
  );
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
  week: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg + 2,
    paddingVertical: space.md + 2,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
  },
  weekDay: { alignItems: 'center', gap: space.sm },
  weekLabel: { ...font.caption, fontSize: 12, fontWeight: '500', color: color.textMuted },
  weekLabelOn: { color: color.text, fontWeight: '700' },
  weekDot: { width: 12, height: 12, borderRadius: radius.pill, borderWidth: 1.5, borderColor: color.surfaceHigh },
  weekPlanned: { borderColor: color.border },
  weekToday: { borderColor: color.accent },
  weekWord: { ...font.caption, fontSize: 10, lineHeight: 12, color: color.textFaint, minHeight: 12 },
  footnote: { ...font.caption, fontSize: 12, color: color.textFaint, marginTop: space.sm },
  flex1: { flex: 1 },
  pair: { flexDirection: 'row', gap: space.sm },
  gapTop: { marginTop: space.md },
  hero: { gap: space.md, marginBottom: space.md },
  eyebrow: { ...font.eyebrow, color: color.textFaint },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: space.sm },
  dayTitle: { ...font.title, fontSize: 30, lineHeight: 36, color: color.text, flexShrink: 1 },
  titleMeta: { ...font.caption, color: color.textMuted },
  cardTitle: { ...font.heading, color: color.text },
  muted: { ...font.caption, color: color.textMuted },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.md - 2 },
  choiceLabel: { ...font.caption, fontSize: 12, fontWeight: '600', color: color.textFaint, width: 44 },
  exIdx: { ...font.caption, fontWeight: '600', ...font.numeric, color: color.textFaint, width: 14 },
  exWeight: { ...font.label, fontSize: 16, fontWeight: '700', ...font.numeric, color: color.text },
  stats: { flexDirection: 'row', gap: space.xl },
  stat: { gap: 2 },
  statValue: { ...font.heading, ...font.numeric, color: color.text },
  statLabel: { ...font.caption, color: color.textMuted },
});
