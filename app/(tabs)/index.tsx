import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, FitText, Icon, IconButton, ListCard, ListRow, Pill, Press, PrimaryButton, Screen, SectionHeader, Sheet, toast, type IconName } from '@/components';
import { CATALOG_BY_ID } from '@/data/catalog';
import { useLive } from '@/db/live';
import { deleteEntry as deleteWaterEntry, getDayTotal, logWater } from '@/db/repositories/water';
import { getActiveRoutine, getDay, getDays, getSlots, resolveNextDay } from '@/db/repositories/program';
import { recentMuscles, recentWorkouts } from '@/db/repositories/progress';
import {
  deleteSession,
  getActiveSession,
  getSessionSets,
  getSessionSummary,
  isNoTraining,
  listSessions,
  planProgress,
  savedSetCount,
  skipDay,
  startSession,
  type SessionStatus,
} from '@/db/repositories/sessions';
import { useSettings } from '@/db/repositories/settings';
import { estimateSeconds, fitSession, type FitSlot } from '@/engine/planner';
import { recoverySession } from '@/engine/recovery';
import { hydrationTarget } from '@/services/hydration';
import { WARMUP_BUDGET_S } from '@/engine/warmup';
import { drillKit } from '@/features/profile';
import { cancelWorkout } from '@/features/session/cancel';
import { Elapsed } from '@/features/session/Elapsed';
import { suggestFor, suggestionContext } from '@/features/session/prescription';
import { STATUS_LABEL, STATUS_TONE } from '@/features/session/status';
import { fmtClockOfDay } from '@/features/settings/time';
import { RoutineSheet } from '@/features/warmup/RoutineSheet';
import { addDays, fmtDayLabel, parseISODate, todayISO, weekStartISO } from '@/lib/date';
import { ml } from '@/lib/format';
import { color, font, gap, hit, material, radius, space } from '@/theme/tokens';

const BUDGETS = [0, 45, 30, 20];
const WEEK_STATUSES: readonly SessionStatus[] = ['completed', 'partial', 'skipped', 'rest', 'cancelled'];
/** Only these count as work done today. Cancelled is never completed (AGENTS §1.4). */
const TRAINED: readonly SessionStatus[] = ['completed', 'partial'];
const WEEK_WORDS: Record<SessionStatus, string> = {
  completed: 'trained',
  partial: 'trained, partly',
  cancelled: 'started, cancelled',
  skipped: 'missed',
  rest: 'rest day',
  active: 'in progress',
};
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Today: what you are doing, and one button that starts it.
 *
 * The screen used to answer four questions at once. The plan, the day and the
 * estimate shared a line of small print under the day's name; under that came the
 * check-in row, then every exercise on the day with its suggested load, then a
 * heading called "Other options" with five buttons under it, then the week, then
 * recent workouts. Starting a workout meant reading a preview of it first, and
 * "Rest day" — a decision you make in two seconds from bed — was four screens of
 * scrolling down, under the list of exercises you had just decided not to do.
 *
 * Now there are three things: the card that says what today is, one row of the
 * decisions that change it, and the week. The exercise list is gone from here —
 * it is the first thing the workout itself shows, and showing it twice made Today
 * a table of contents for a screen one tap away. Everything rarer than those
 * lives behind More.
 *
 * The check-in is gone from this screen entirely. It is the workout's first stage
 * now (`features/session/stages`), which is where someone actually knows how they
 * slept and how sore they are — and Body → Recovery is still the editor for any
 * day's answers.
 */
export default function Today() {
  const settings = useSettings();
  const today = todayISO();
  const state = useLive(
    () => {
      const active = getActiveSession();
      const routine = getActiveRoutine();
      const recent = listSessions(10);
      // A workout cancelled today is not a workout done today.
      const finishedToday = recent.find((s) => s.date === today && TRAINED.includes(s.status));
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
        finishedToday,
        /** The numbers the done card reports. Read here so it is one query, not six. */
        doneSummary: finishedToday ? getSessionSummary(finishedToday.id) : undefined,
        doneDay: finishedToday?.routineDayId ? getDay(finishedToday.routineDayId) : undefined,
        week: listSessions(20, WEEK_STATUSES),
        recent: recentWorkouts(3),
        water: getDayTotal(today),
      };
    },
    ['session', 'set_log', 'session_exercise', 'exercise', 'routine', 'routine_day', 'check_in', 'setting', 'water_log'],
    [today],
  );

  const [pickedDayId, setPickedDayId] = useState<string | null>(null);
  const [budget, setBudget] = useState(0);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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
  // Live, because the target moves with bodyweight and with training done today.
  const waterTarget = useLive(() => hydrationTarget().ml, ['setting', 'weigh_in', 'session']);
  const kit = drillKit(settings);
  const recovery = useMemo(() => (recoveryOpen ? recoverySession(recentMuscles(2), kit) : { items: [], seconds: 0 }), [recoveryOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!settings.setupDone) return <Redirect href="/setup" />;

  const title = settings.name ? `Hi, ${settings.name.split(' ')[0]}` : 'Today';
  const subtitle = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const gear = <IconButton icon="settings" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />;
  const restDay = !settings.trainingDays.includes(new Date().getDay());

  /** A workout with no plan behind it: pick exercises as you go (AGENTS §2, Today). */
  const startEmpty = () => router.push(`/session/${startSession(null).id}`);

  /**
   * Marks today as not trained. Works with or without a plan — a day off is a day
   * off either way — and re-marking replaces the previous mark rather than stacking.
   */
  const markedToday = state.week.find((s) => s.date === today && isNoTraining(s.status));
  const markDay = (status: 'rest' | 'skipped') => {
    const id = skipDay(day?.id ?? null, status);
    setPickedDayId(null);
    setMoreOpen(false);
    toast(status === 'rest' ? 'Rest day — your plan stays where it is' : 'Marked as missed', {
      label: 'Undo',
      onPress: () => deleteSession(id),
    });
  };

  /**
   * Water, on the tab people actually open. It lived two taps deep in the More
   * sheet, which is where a thing you do eight times a day should never be.
   * One tap logs a glass; the row itself opens the full screen for anything else.
   */
  const waterRow = (
    <View style={styles.waterRow}>
      <Press
        onPress={() => router.push('/water')}
        accessibilityRole="button"
        accessibilityLabel={`Water: ${ml(state.water)} of ${ml(waterTarget)} today. Opens the water screen.`}
        feedback="highlight"
        touchStyle={styles.flex1}
        style={styles.waterMain}
        pressedStyle={styles.waterHeld}
      >
        <Icon name="water" size={20} color={color.accent} />
        <Text style={styles.waterValue}>
          {ml(state.water)} <Text style={styles.waterOf}>of {ml(waterTarget)}</Text>
        </Text>
      </Press>
      <Press
        onPress={() => {
          const row = logWater(250);
          if (row) toast('Glass logged · 250 ml', { label: 'Undo', onPress: () => deleteWaterEntry(row.id) });
        }}
        accessibilityRole="button"
        accessibilityLabel="Log a 250 millilitre glass of water"
        style={styles.waterAdd}
        pressedStyle={styles.waterAddHeld}
      >
        <Text style={styles.waterAddText}>+250</Text>
      </Press>
    </View>
  );

  const week = (
    <View style={styles.weekBlock}>
      <SectionHeader title="This week" />
      <WeekStrip today={today} sessions={state.week} trainingDays={settings.trainingDays} />
      <Text style={styles.footnote}>A missed day is just an empty ring. Nothing counts against you.</Text>
    </View>
  );

  /**
   * Everything that is not "start the workout".
   *
   * One sheet rather than a column of five buttons under a heading. They are all
   * decisions you make occasionally, and a decision you make occasionally should
   * cost one extra tap rather than costing the main action its place on screen.
   */
  const moreSheet = (
    <Sheet visible={moreOpen} onClose={() => setMoreOpen(false)} title="Today" subtitle={markedToday ? `Marked as ${markedToday.status === 'rest' ? 'a rest day' : 'missed'}` : subtitle}>
      <ListCard>
        {/* `startSession` returns the open one rather than a second, so during a
            workout this row would silently mean "resume" — which the dock already
            says in plain words. */}
        {state.active ? null : (
          <ListRow
            left={<Icon name="plus" size={20} color={color.accent} />}
            title="Log a different workout"
            sub="Pick any exercises. Your plan stays as it is."
            onPress={() => {
              setMoreOpen(false);
              startEmpty();
            }}
          />
        )}
        {/*
          Not while a workout is open. `skipDay` writes a closed row, so it cannot
          clash with the session in progress — but "today was a rest day" is not a
          thing to offer someone four sets into today.
        */}
        {state.active ? null : (
          <>
            <ListRow
              divider
              left={<Icon name="moon" size={20} color={color.textMuted} />}
              title="Rest day"
              sub="On purpose. Your plan stays where it is."
              onPress={() => markDay('rest')}
            />
            <ListRow
              divider
              left={<Icon name="skip" size={20} color={color.textMuted} />}
              title="Missed it"
              sub="It did not happen. Your plan moves on."
              onPress={() => markDay('skipped')}
            />
          </>
        )}
        <ListRow
          // First row in the card while a workout is open, so no rule above it.
          divider={!state.active}
          left={<Icon name="pulse" size={20} color={color.textMuted} />}
          title="Easy mobility"
          sub="About 8 minutes, gentle. Optional."
          onPress={() => {
            setMoreOpen(false);
            setRecoveryOpen(true);
          }}
        />
        <ListRow
          divider
          left={<Icon name="water" size={20} color={color.accent} />}
          title="Water"
          sub={`${ml(state.water)} logged today`}
          onPress={() => {
            setMoreOpen(false);
            router.push('/water');
          }}
        />
      </ListCard>

      {markedToday ? <Text style={styles.footnote}>Marking the day again replaces the previous mark.</Text> : null}

      {state.recent.length ? (
        <>
          <SectionHeader
            title="Recent workouts"
            action={{ label: 'See all', onPress: () => { setMoreOpen(false); router.push('/history'); }, accessibilityLabel: 'See all workout history' }}
          />
          <ListCard>
            {state.recent.map((w, i) => (
              <ListRow
                key={w.session.id}
                divider={i > 0}
                title={w.dayLabel ?? 'Workout'}
                sub={`${fmtDayLabel(w.session.date)} · ${w.sets} ${w.sets === 1 ? 'set' : 'sets'}`}
                right={<Pill label={STATUS_LABEL[w.session.status]} tone={STATUS_TONE[w.session.status]} />}
                onPress={() => {
                  setMoreOpen(false);
                  router.push(`/session/summary/${w.session.id}`);
                }}
              />
            ))}
          </ListCard>
        </>
      ) : null}
      <View style={styles.sheetTail} />
    </Sheet>
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
          <Text style={styles.dayTitle} numberOfLines={2}>
            {state.activeDay?.label ?? 'Workout'}
          </Text>
          <View style={styles.statRow}>
            <Stat value={String(state.activeSets)} label="sets" />
            {p && p.planned > 0 ? <Stat value={`${p.done + p.skipped}/${p.planned}`} label="exercises" /> : null}
            <Stat value={<Elapsed since={a.startedAt} />} label="elapsed" />
          </View>
        </Card>

        <View style={styles.actionRow}>
          <ActionTile icon="list" label="More" onPress={() => setMoreOpen(true)} />
          {/*
            A real alternative, so it looks like one. As a `ghost` it was muted grey
            text with no frame — the same weight the app gives "dismiss" — which on
            the one destructive action here read as a disabled button (§1). It now
            always asks before it does anything (features/session/cancel).
          */}
          <ActionTile icon="close" label="Cancel workout" tone="danger" wide onPress={() => cancelWorkout(a.id, state.activeSaved)} />
        </View>

        {waterRow}
        {waterRow}
      {week}
        {moreSheet}
        {recoverySheet}
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
        dock={<PrimaryButton label="Log a workout" size="gym" icon={<Icon name="plus" size={18} color={color.onAccent} />} onPress={startEmpty} />}
      >
        <Card style={styles.hero}>
          <Text style={styles.eyebrow}>{routine ? routine.name : 'Plans'}</Text>
          <Text style={styles.cardTitle}>{routine ? `${routine.name} has no days yet` : 'No active plan'}</Text>
          {/* A plan is optional, and the screen has to say so: the button below logs
              a workout right now, choosing exercises as you go. */}
          <Text style={styles.muted}>
            {routine ? 'Add a day and some exercises to get started.' : 'You do not need one — log a workout below and pick exercises as you go.'}
          </Text>
          <PrimaryButton label={routine ? 'Edit plan' : 'Choose a plan'} tone="neutral" style={styles.gapTop} onPress={() => router.push(routine ? `/plan/${routine.id}` : '/program')} />
        </Card>

        <View style={styles.actionRow}>
          <ActionTile icon="moon" label="Rest day" onPress={() => markDay('rest')} />
          <ActionTile icon="skip" label="Missed it" onPress={() => markDay('skipped')} />
          <ActionTile icon="list" label="More" onPress={() => setMoreOpen(true)} />
        </View>

        {waterRow}
        {waterRow}
      {week}
        {moreSheet}
        {recoverySheet}
      </Screen>
    );
  }

  /* --------------------------- done for today ---------------------------- */
  const done = state.finishedToday;
  if (done && state.doneSummary) {
    const s = state.doneSummary;
    const at = new Date(done.endedAt ?? done.startedAt);
    return (
      <Screen
        title={title}
        subtitle={subtitle}
        right={gear}
        tab
        dock={
          <PrimaryButton
            label="Start another workout"
            size="gym"
            // Quieter once the day's work is logged — still one tap away.
            tone="neutral"
            icon={<Icon name="play" size={18} color={color.text} />}
            onPress={() => router.push(`/session/${startSession(day.id).id}`)}
          />
        }
      >
        {/*
          The day's work, reported rather than re-offered. Today used to keep
          showing the planned workout with "Done for today" in small print above
          it and the whole exercise list underneath, so the screen still looked
          like a to-do list for something already finished (§6).
        */}
        <Card style={styles.hero}>
          <View style={styles.doneHead}>
            <View style={styles.tick}>
              <Icon name="check" size={20} color={color.bg} strokeWidth={3} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.eyebrowPositive}>
                {done.status === 'completed' ? 'Workout completed' : 'Workout logged'} · {fmtClockOfDay(at.getHours() * 60 + at.getMinutes())}
              </Text>
              <Text style={styles.dayTitle} numberOfLines={2}>
                {state.doneDay?.label ?? 'Workout'}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.statRow}>
            <Stat value={String(s.hardSets)} label={s.hardSets === 1 ? 'set' : 'sets'} />
            {s.totalReps > 0 ? <Stat value={String(s.totalReps)} label="reps" /> : null}
            {s.totalTonnage > 0 ? (
              <Stat value={s.totalTonnage >= 10000 ? `${(s.totalTonnage / 1000).toFixed(1)}k` : String(Math.round(s.totalTonnage))} label="kg lifted" />
            ) : null}
            <Stat value={`${s.durationMin}m`} label="duration" />
          </View>

          <Text style={styles.muted}>
            {s.progress.planned > 0
              ? `${s.progress.done} of ${s.progress.planned} planned ${s.progress.planned === 1 ? 'exercise' : 'exercises'} done${s.progress.skipped ? ` · ${s.progress.skipped} skipped` : ''}`
              : `${s.perExercise.length} ${s.perExercise.length === 1 ? 'exercise' : 'exercises'} logged`}
          </Text>

          <PrimaryButton
            label="View full details"
            tone="neutral"
            icon={<Icon name="chevronRight" size={16} />}
            style={styles.gapTop}
            onPress={() => router.push(`/session/summary/${done.id}`)}
          />
        </Card>

        <Text style={styles.nextUp}>
          Next up: <Text style={styles.nextUpStrong}>{day.label}</Text>
          {restDay ? '' : ` · ${preview.length} ${preview.length === 1 ? 'exercise' : 'exercises'}`}
        </Text>

        <View style={styles.actionRow}>
          <ActionTile icon="list" label="More" onPress={() => setMoreOpen(true)} />
          <ActionTile icon="progress" label="Progress" wide onPress={() => router.push('/review')} />
        </View>

        {waterRow}
        {waterRow}
      {week}
        {moreSheet}
        {recoverySheet}
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
  const setCount = (fit?.slots ?? slots).reduce((t, x) => t + x.sets, 0);

  /** One tap in. The check-in is the workout's first stage, not a gate in front of it. */
  const start = () => router.push(`/session/${startSession(day.id, fit ? { fit: fit.slots } : {}).id}`);

  return (
    <Screen
      title={title}
      subtitle={subtitle}
      right={gear}
      tab
      dock={
        <PrimaryButton
          label={restDay ? 'Train anyway' : 'Start workout'}
          size="gym"
          icon={<Icon name="play" size={18} color={color.onAccent} />}
          onPress={start}
          accessibilityLabel={`Start ${day.label}${fit ? `, shortened to ${budget} minutes` : ''}. Begins with the check-in.`}
        />
      }
    >
      {/*
        What today is, in the order it is asked: which plan, which day, how long.
        The three figures are the card's content, not its footnotes — they used to
        be one line of 13pt grey text beside the day's name.
      */}
      <Card style={styles.hero}>
        <View style={styles.planRow}>
          <Icon name="plans" size={14} color={color.accent} />
          <Text style={styles.planName} numberOfLines={1}>
            {state.routine.name}
          </Text>
          <Pill label={day.id === state.next?.id ? 'Up next' : 'Chosen'} tone="accent" />
        </View>

        <Text style={styles.dayTitle} numberOfLines={2}>
          {day.label}
        </Text>

        {restDay ? <Text style={styles.muted}>Not a training day. Train anyway if you want to.</Text> : null}

        <View style={styles.divider} />

        <View style={styles.statRow}>
          <Stat value={String(preview.length)} label={preview.length === 1 ? 'exercise' : 'exercises'} />
          <Stat value={String(setCount)} label="sets" />
          <Stat value={`${fit ? fit.minutes : fullMinutes}m`} label="estimated" />
          <Stat value={fmtClockOfDay(settings.reminders.workout.minutes)} label="usual time" />
        </View>

        {/* The two decisions that change what the button above does. Inside the
            card, because they rewrite the card. */}
        {(!restDay && state.days.length > 1) || budgets.length > 1 ? <View style={styles.divider} /> : null}
        {state.days.length > 1 ? (
          <Choice label="Day">
            <ChipRow
              options={state.days.map((d) => ({ label: d.label, value: d.id }))}
              value={day.id}
              onChange={(v) => setPickedDayId(v)}
              columns={Math.min(4, state.days.length)}
            />
          </Choice>
        ) : null}
        {budgets.length > 1 ? (
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

      {/* The decisions that replace the workout, one row, always above the fold. */}
      <View style={styles.actionRow}>
        <ActionTile icon="moon" label="Rest day" onPress={() => markDay('rest')} />
        <ActionTile icon="skip" label="Missed it" onPress={() => markDay('skipped')} />
        <ActionTile icon="list" label="More" onPress={() => setMoreOpen(true)} />
      </View>

      {waterRow}
      {week}
      {moreSheet}
      {recoverySheet}
    </Screen>
  );
}

/**
 * One of the decisions that changes today, as a tile rather than a full-width
 * button in a stack under a heading.
 *
 * They were five stacked `PrimaryButton`s below the exercise list, which put
 * "Rest day" about 600dp down a 640dp screen. Three tiles in a row cost 76dp and
 * sit under the card they act on.
 */
function ActionTile({ icon, label, tone = 'neutral', wide, onPress }: { icon: IconName; label: string; tone?: 'neutral' | 'danger'; wide?: boolean; onPress: () => void }) {
  const danger = tone === 'danger';
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      feedback="highlight"
      touchStyle={wide ? styles.flex2 : styles.flex1}
      style={[styles.tile, danger && styles.tileDanger]}
      pressedStyle={styles.tileHeld}
    >
      <Icon name={icon} size={20} color={danger ? color.danger : color.textMuted} />
      <Text style={[styles.tileLabel, danger && styles.tileLabelDanger]} numberOfLines={2}>
        {label}
      </Text>
    </Press>
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
        const word = trained ? 'trained' : status === 'rest' ? 'rest' : status === 'skipped' ? 'missed' : planned && date > today ? 'planned' : '';
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
      <FitText style={styles.statValue} numberOfLines={1} minimumFontScale={0.7}>
        {value}
      </FitText>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
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
  weekBlock: { marginTop: gap.section },
  weekDay: { alignItems: 'center', gap: space.sm },
  weekLabel: { ...font.caption, fontSize: 12, fontWeight: '500', color: color.textMuted },
  weekLabelOn: { color: color.text, fontWeight: '700' },
  weekDot: { width: 12, height: 12, borderRadius: radius.pill, borderWidth: 1.5, borderColor: color.surfaceHigh },
  weekPlanned: { borderColor: color.border },
  weekToday: { borderColor: color.accent },
  weekWord: { ...font.caption, fontSize: 10, lineHeight: 12, color: color.textFaint, minHeight: 12 },
  footnote: { ...font.caption, fontSize: 12, color: color.textFaint, marginTop: space.sm },

  flex1: { flex: 1 },
  flex2: { flex: 2 },
  gapTop: { marginTop: space.md },
  hero: { gap: space.md, marginBottom: space.lg },
  eyebrow: { ...font.eyebrow, color: color.textFaint },
  eyebrowPositive: { ...font.eyebrow, color: color.positive },
  dayTitle: { ...font.title, fontSize: 32, lineHeight: 38, color: color.text },
  cardTitle: { ...font.heading, color: color.text },
  muted: { ...font.caption, fontSize: 14, color: color.textMuted },

  planRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  planName: { ...font.label, fontWeight: '600', color: color.textMuted, flexShrink: 1 },
  divider: { height: 1, backgroundColor: color.border, marginVertical: space.xs },

  /**
   * Four figures across a 360dp card, each one allowed to shrink its own digits
   * rather than the row wrapping — "usual time" is 5 characters wide and must stay
   * on the same baseline as a 2-digit set count.
   */
  statRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  stat: { flex: 1, minWidth: 0, gap: 1 },
  waterRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, paddingRight: space.sm, overflow: 'hidden' },
  waterMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hit.default, paddingLeft: space.lg, paddingVertical: space.sm },
  waterHeld: { backgroundColor: color.surfaceHigh },
  waterValue: { ...font.label, fontSize: 16, fontWeight: '700', ...font.numeric, color: color.text },
  waterOf: { fontWeight: '400', color: color.textFaint },
  waterAdd: { minHeight: hit.default, minWidth: 64, alignItems: 'center', justifyContent: 'center', borderRadius: radius.button, borderWidth: 1, borderColor: color.border },
  waterAddHeld: { backgroundColor: color.surfaceHigh },
  waterAddText: { ...font.label, fontWeight: '700', ...font.numeric, color: color.accent },
  statValue: { ...font.numeric, fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.8, color: color.text },
  statLabel: { ...font.caption, fontSize: 11, lineHeight: 14, color: color.textMuted },

  doneHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tick: { width: 38, height: 38, borderRadius: radius.pill, backgroundColor: color.positive, alignItems: 'center', justifyContent: 'center' },
  nextUp: { ...font.label, color: color.textMuted, marginBottom: space.lg },
  nextUpStrong: { color: color.text, fontWeight: '600' },

  actionRow: { flexDirection: 'row', gap: space.sm },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: 72,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    boxShadow: material.edge,
  },
  tileDanger: { borderColor: color.danger },
  tileHeld: { backgroundColor: color.surfaceHigh },
  tileLabel: { ...font.caption, fontSize: 12, lineHeight: 15, fontWeight: '600', color: color.text, textAlign: 'center' },
  tileLabelDanger: { color: color.danger },

  choice: { flexDirection: 'row', alignItems: 'center', gap: space.md - 2, minHeight: hit.default - 8 },
  choiceLabel: { ...font.caption, fontSize: 12, fontWeight: '600', color: color.textFaint, width: 44 },

  sheetTail: { height: space.lg },
});
