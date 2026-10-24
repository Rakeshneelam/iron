import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipRow, Icon, IconButton, ListCard, ListRow, Pill, Press, PrimaryButton, Screen, SectionHeader, Sheet, TitleBlock, toast, useNow, type IconName } from '@/components';
import { CATALOG_BY_ID } from '@/data/catalog';
import { useLive } from '@/db/live';
import { getWeighIn, listWeighIns } from '@/db/repositories/body';
import { getDay as getFoodDay } from '@/db/repositories/food';
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
import { deleteEntry as deleteWaterEntry, getDayEntries, getDayTotal, logWater } from '@/db/repositories/water';
import { weightTrend } from '@/engine/metabolic';
import { estimateSeconds, fitSession, type FitSlot } from '@/engine/planner';
import { recoverySession } from '@/engine/recovery';
import { WARMUP_BUDGET_S } from '@/engine/warmup';
import { computeTargets } from '@/features/food/targets';
import { drillKit } from '@/features/profile';
import { cancelWorkout } from '@/features/session/cancel';
import { Elapsed } from '@/features/session/Elapsed';
import { suggestFor, suggestionContext } from '@/features/session/prescription';
import { STATUS_LABEL, STATUS_TONE } from '@/features/session/status';
import { fmtClockOfDay } from '@/features/settings/time';
import { DayScore } from '@/features/today/DayScore';
import { RoutineSheet } from '@/features/warmup/RoutineSheet';
import { addDays, daysBetweenISO, fmtDayLabel, minutesSinceMidnight, parseISODate, todayISO, weekStartISO } from '@/lib/date';
import { ml } from '@/lib/format';
import { success } from '@/lib/haptics';
import { hydrationTarget } from '@/services/hydration';
import { rescheduleAll } from '@/services/notifications';
import { color, font, gap, hit, radius, space } from '@/theme/tokens';

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
/** Past this, the screen says how long it has been — as a fact, never as a reproach. */
const LONG_GAP_DAYS = 10;

const minutesOf = (iso: string) => minutesSinceMidnight(new Date(iso));

/**
 * Today: where you are in your day, and the one thing to do next.
 *
 * Not a dashboard. It used to be a card of four numbers, a row of tiles, a water
 * row and a week strip — four widgets with four ideas of time. Now it is three
 * things, in the order a glance asks for them:
 *
 *   1. The day's work, set as a headline: the workout's own name, large, with its
 *      facts in a title block under it. This is the anchor (brief §12) — the first
 *      five seconds answer "what is today".
 *   2. The day score: everything you have recorded today on one clock, with "now"
 *      drawn through it (features/today/DayScore). Food, water and training are one
 *      record here, not three trackers stapled together (§11).
 *   3. The week, in the same marks as everything else: solid for a day trained,
 *      hollow for one planned — so a missed day is just a hollow mark, as it always
 *      promised to be. Nothing here can be broken.
 *
 * The one action is in the dock, under a thumb, and its words follow the state:
 * Start, Resume, Log a workout, Start another. The exercise list is still not here
 * (the workout shows it first) and neither is a check-in (the workout's first stage
 * asks).
 */
export default function Today() {
  const settings = useSettings();
  const today = todayISO();
  const now = useNow();
  const state = useLive(
    () => {
      const active = getActiveSession();
      const routine = getActiveRoutine();
      const recent = listSessions(10);
      // A workout cancelled today is not a workout done today.
      const finishedToday = recent.find((s) => s.date === today && TRAINED.includes(s.status));
      const weighIns = listWeighIns();
      const trend = weightTrend(weighIns);
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
        /** The numbers the done state reports. Read here so it is one query, not six. */
        doneSummary: finishedToday ? getSessionSummary(finishedToday.id) : undefined,
        doneDay: finishedToday?.routineDayId ? getDay(finishedToday.routineDayId) : undefined,
        lastTrained: recent.find((s) => TRAINED.includes(s.status))?.date ?? null,
        week: listSessions(20, WEEK_STATUSES),
        recent: recentWorkouts(3),
        water: getDayEntries(today),
        waterTotal: getDayTotal(today),
        meals: getFoodDay(today).entries,
        kcalTarget: computeTargets(today).kcal,
        weighIn: getWeighIn(today)?.kg ?? null,
        trend: trend[trend.length - 1]?.trend ?? null,
      };
    },
    ['session', 'set_log', 'session_exercise', 'exercise', 'routine', 'routine_day', 'check_in', 'setting', 'water_log', 'meal_log', 'food', 'recipe', 'recipe_item', 'weigh_in'],
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

  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
  const dateLine = now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  const gear = <IconButton icon="settings" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />;
  const restDay = !settings.trainingDays.includes(now.getDay());

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

  /** A glass, from the day score: the thing done eight times a day, in one tap. */
  const glass = () => {
    const row = logWater(250);
    success();
    void rescheduleAll();
    if (row) {
      toast('Glass logged, 250 ml', {
        label: 'Undo',
        onPress: () => {
          deleteWaterEntry(row.id);
          void rescheduleAll();
        },
      });
    }
  };

  /* ---------------------------- the estimate ----------------------------- */
  const slots: FitSlot[] = preview.map(({ slot }) => {
    const c = CATALOG_BY_ID.get(slot.exerciseId);
    return { exerciseId: slot.exerciseId, sets: slot.targetSets, restSeconds: slot.restSeconds, compound: c?.compound ?? true, repHi: slot.repHi, measure: c?.measure };
  });
  const fullMinutes = Math.round((estimateSeconds(slots) + WARMUP_BUDGET_S[settings.warmupMode]) / 60 / 5) * 5;
  const budgets = BUDGETS.filter((m) => m === 0 || m < fullMinutes);
  const fit = budget > 0 && budget < fullMinutes ? fitSession(slots, budget, WARMUP_BUDGET_S.quick) : null;
  const setCount = (fit?.slots ?? slots).reduce((t, x) => t + x.sets, 0);
  const minutes = fit ? fit.minutes : fullMinutes;

  /* ---------------------------- the day score ---------------------------- */
  const done = state.finishedToday;
  const doneBlocks = state.week
    .filter((s) => s.date === today && TRAINED.includes(s.status) && s.endedAt)
    .map((s) => ({ start: minutesOf(s.startedAt), end: minutesOf(s.endedAt ?? s.startedAt) }));
  const planned =
    state.routine && day && !restDay && !done && !state.active && !markedToday && preview.length ? { at: settings.reminders.workout.minutes, minutes } : null;
  const score = (
    <View style={styles.scoreBlock}>
      <SectionHeader title="Today" hint={undefined} />
      <DayScore
        now={now}
        wake={settings.wakeMinutes}
        sleep={settings.sleepMinutes}
        train={{
          done: doneBlocks,
          live: state.active ? (state.active.date === today ? minutesOf(state.active.startedAt) : settings.wakeMinutes) : null,
          planned,
          idle: markedToday ? (markedToday.status === 'rest' ? 'Rest day, on purpose' : 'Marked as missed') : restDay ? 'Not a training day' : !state.routine ? 'No plan — log one any time' : '',
        }}
        food={{ meals: state.meals.map((m) => ({ at: minutesOf(m.loggedAt), kcal: m.macros.kcal })), kcal: state.meals.reduce((t, m) => t + m.macros.kcal, 0), target: state.kcalTarget }}
        water={{ steps: state.water.map((w) => ({ at: minutesOf(w.loggedAt), ml: w.ml })), total: state.waterTotal, target: waterTarget }}
        body={{ kg: state.weighIn, trend: state.trend }}
        onTrain={() => (state.active ? router.push(`/session/${state.active.id}`) : done ? router.push(`/session/summary/${done.id}`) : setMoreOpen(true))}
        onFood={() => router.push('/food')}
        onWater={() => router.push('/water')}
        onBody={() => router.push('/body?section=weight')}
        onGlass={glass}
      />
    </View>
  );

  const week = (
    <View style={styles.weekBlock}>
      <SectionHeader title="This week" />
      <WeekRhythm today={today} sessions={state.week} trainingDays={settings.trainingDays} />
      <Text style={styles.footnote}>A missed day stays an open mark. Nothing counts against you.</Text>
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
    <Sheet visible={moreOpen} onClose={() => setMoreOpen(false)} title="Today" subtitle={markedToday ? `Marked as ${markedToday.status === 'rest' ? 'a rest day' : 'missed'}` : `${weekday} ${dateLine}`}>
      <ListCard>
        {/* `startSession` returns the open one rather than a second, so during a
            workout this row would silently mean "resume" — which the dock already
            says in plain words. */}
        {state.active ? null : (
          <ListRow
            left={<Icon name="plus" size={20} color={color.text} />}
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
            <ListRow divider left={<Icon name="moon" size={20} color={color.textMuted} />} title="Rest day" sub="On purpose. Your plan stays where it is." onPress={() => markDay('rest')} />
            <ListRow divider left={<Icon name="skip" size={20} color={color.textMuted} />} title="Missed it" sub="It did not happen. Your plan moves on." onPress={() => markDay('skipped')} />
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
          left={<Icon name="water" size={20} color={color.cold} />}
          title="Water"
          sub={`${ml(state.waterTotal)} logged today`}
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
            action={{
              label: 'See all',
              onPress: () => {
                setMoreOpen(false);
                router.push('/history');
              },
              accessibilityLabel: 'See all workout history',
            }}
          />
          <ListCard>
            {state.recent.map((w, i) => (
              <ListRow
                key={w.session.id}
                divider={i > 0}
                title={w.dayLabel ?? 'Workout'}
                sub={`${fmtDayLabel(w.session.date)}, ${w.sets} ${w.sets === 1 ? 'set' : 'sets'}`}
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

  const frame = { title: weekday, subtitle: dateLine, right: gear, tab: true } as const;
  /** Said once, as a fact: a long gap changes nothing you have to do. */
  const sinceLast = state.lastTrained ? daysBetweenISO(state.lastTrained, today) : null;
  const gapNote =
    sinceLast !== null && sinceLast >= LONG_GAP_DAYS && !state.active && !done
      ? `Last workout ${sinceLast} days ago. Your plan picks up where you left it; the first sets back are prescribed from your record.`
      : null;

  /* ---------------------------- in progress ----------------------------- */
  if (state.active) {
    const a = state.active;
    const p = state.activeProgress;
    return (
      <Screen
        {...frame}
        dock={<PrimaryButton label="Resume workout" size="gym" icon={<Icon name="play" size={18} color={color.onAccent} />} onPress={() => router.push(`/session/${a.id}`)} />}
      >
        <Headline kicker="In progress" kickerTone="heat" title={state.activeDay?.label ?? 'Workout'} />
        <TitleBlock
          cells={[
            { label: 'Sets', value: String(state.activeSets) },
            ...(p && p.planned > 0 ? [{ label: 'Exercises', value: `${p.done + p.skipped}/${p.planned}` }] : []),
            { label: 'Elapsed', value: <Elapsed since={a.startedAt} />, tone: 'heat' as const },
          ]}
        />
        <View style={styles.decisions}>
          <Decision icon="list" label="More" onPress={() => setMoreOpen(true)} />
          {/* Always asks first (features/session/cancel); cancelling never counts as done. */}
          <Decision icon="close" label="Cancel workout" tone="danger" onPress={() => cancelWorkout(a.id, state.activeSaved)} />
        </View>
        {score}
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
      <Screen {...frame} dock={<PrimaryButton label="Log a workout" size="gym" icon={<Icon name="plus" size={18} color={color.onAccent} />} onPress={startEmpty} />}>
        <Headline kicker={routine ? routine.name : 'No active plan'} title={routine ? `${routine.name} has no days yet` : 'Train without a plan'} />
        {/* A plan is optional, and the screen has to say so: the button below logs
            a workout right now, choosing exercises as you go. */}
        <Text style={styles.lede}>
          {routine ? 'Add a day and some exercises, or log a workout and pick them as you go.' : 'Log a workout below and pick exercises as you go — or choose a plan and Iron prescribes every set.'}
        </Text>
        <View style={styles.decisions}>
          <Decision icon="plans" label={routine ? 'Edit plan' : 'Choose a plan'} onPress={() => router.push(routine ? `/plan/${routine.id}` : '/program')} />
          <Decision icon="moon" label="Rest day" onPress={() => markDay('rest')} />
          <Decision icon="list" label="More" onPress={() => setMoreOpen(true)} />
        </View>
        {score}
        {week}
        {moreSheet}
        {recoverySheet}
      </Screen>
    );
  }

  /* --------------------------- done for today ---------------------------- */
  if (done && state.doneSummary) {
    const s = state.doneSummary;
    const at = new Date(done.endedAt ?? done.startedAt);
    return (
      <Screen
        {...frame}
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
          it, so the screen still looked like a to-do list for something finished.
        */}
        <Headline
          kicker={`${done.status === 'completed' ? 'Done' : 'Logged, partly'} at ${fmtClockOfDay(at.getHours() * 60 + at.getMinutes())}`}
          kickerTone="positive"
          title={state.doneDay?.label ?? 'Workout'}
        />
        <TitleBlock
          cells={[
            { label: s.hardSets === 1 ? 'Set' : 'Sets', value: String(s.hardSets) },
            ...(s.totalReps > 0 ? [{ label: 'Reps', value: String(s.totalReps) }] : []),
            ...(s.totalTonnage > 0 ? [{ label: 'Lifted', value: s.totalTonnage >= 10000 ? `${(s.totalTonnage / 1000).toFixed(1)}k` : String(Math.round(s.totalTonnage)), unit: 'kg' }] : []),
            { label: 'Time', value: String(s.durationMin), unit: 'min' },
          ]}
        />
        <Text style={styles.lede}>
          {s.progress.planned > 0
            ? `${s.progress.done} of ${s.progress.planned} planned ${s.progress.planned === 1 ? 'exercise' : 'exercises'} done${s.progress.skipped ? `, ${s.progress.skipped} skipped` : ''}. Next up: ${day.label}.`
            : `${s.perExercise.length} ${s.perExercise.length === 1 ? 'exercise' : 'exercises'} logged. Next up: ${day.label}.`}
        </Text>
        <View style={styles.decisions}>
          <Decision icon="chevronRight" label="See the workout" onPress={() => router.push(`/session/summary/${done.id}`)} />
          <Decision icon="progress" label="Progress" onPress={() => router.push('/review')} />
          <Decision icon="list" label="More" onPress={() => setMoreOpen(true)} />
        </View>
        {score}
        {week}
        {moreSheet}
        {recoverySheet}
      </Screen>
    );
  }

  /* ----------------------------- next day -------------------------------- */
  /** One tap in. The check-in is the workout's first stage, not a gate in front of it. */
  const start = () => router.push(`/session/${startSession(day.id, fit ? { fit: fit.slots } : {}).id}`);

  return (
    <Screen
      {...frame}
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
      <Headline
        kicker={state.routine.name}
        tag={day.id === state.next?.id ? 'Up next' : 'Chosen'}
        title={day.label}
      />
      <TitleBlock
        cells={[
          { label: preview.length === 1 ? 'Lift' : 'Lifts', value: String(preview.length) },
          { label: 'Sets', value: String(setCount) },
          { label: 'About', value: String(minutes), unit: 'min' },
          { label: 'Usually', value: fmtClockOfDay(settings.reminders.workout.minutes) },
        ]}
      />
      {restDay ? <Text style={styles.lede}>Not a training day. Train anyway if you want to.</Text> : null}
      {gapNote ? <Text style={styles.lede}>{gapNote}</Text> : null}

      {/* The two decisions that rewrite the workout above, beside it. */}
      {state.days.length > 1 ? (
        <Choice label="Day">
          <ChipRow options={state.days.map((d) => ({ label: d.label, value: d.id }))} value={day.id} onChange={(v) => setPickedDayId(v)} columns={Math.min(4, state.days.length)} />
        </Choice>
      ) : null}
      {budgets.length > 1 ? (
        <Choice label="Length">
          <ChipRow options={budgets.map((m) => ({ label: m === 0 ? 'Full' : `${m} min`, value: m }))} value={budget} onChange={setBudget} columns={4} />
        </Choice>
      ) : null}
      {fit ? (
        <Text style={styles.fit}>
          Keeps the main lifts{fit.trimmed.length ? `, trims ${fit.trimmed.length}` : ''}
          {fit.dropped.length ? `, leaves out ${fit.dropped.length}` : ''}, quick warm-up{fit.over ? ', still a little over' : ''}
        </Text>
      ) : null}

      {/* The decisions that replace the workout, one row, always above the fold. */}
      <View style={styles.decisions}>
        <Decision icon="moon" label="Rest day" onPress={() => markDay('rest')} />
        <Decision icon="skip" label="Missed it" onPress={() => markDay('skipped')} />
        <Decision icon="list" label="More" onPress={() => setMoreOpen(true)} />
      </View>

      {score}
      {week}
      {moreSheet}
      {recoverySheet}
    </Screen>
  );
}

/**
 * The day's work as a headline: what it is, large, with one short line above it
 * that says whose plan it is or what state it is in. Type does the work a card's
 * border used to — the name is the largest thing on the screen because it is the
 * answer to "what is today".
 */
function Headline({ kicker, kickerTone, tag, title }: { kicker: string; kickerTone?: 'heat' | 'positive'; tag?: string; title: string }) {
  return (
    <View style={styles.headline}>
      <View style={styles.kickerRow}>
        <Text style={[styles.kicker, kickerTone === 'heat' && styles.heat, kickerTone === 'positive' && styles.positive]} numberOfLines={1}>
          {kicker}
        </Text>
        {tag ? <Text style={styles.tag}>{tag}</Text> : null}
      </View>
      <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

/**
 * A decision that changes today, as a quiet labelled control in one row under the
 * headline. They were full-width buttons four screens down, then tiles; now they
 * are text with an icon — present, one tap, and visibly not the main action.
 */
function Decision({ icon, label, tone = 'neutral', onPress }: { icon: IconName; label: string; tone?: 'neutral' | 'danger'; onPress: () => void }) {
  const danger = tone === 'danger';
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      touchStyle={styles.flex1}
      style={[styles.decision, danger && styles.decisionDanger]}
      pressedStyle={styles.decisionHeld}
    >
      <Icon name={icon} size={18} color={danger ? color.danger : color.textMuted} />
      <Text style={[styles.decisionLabel, danger && styles.decisionLabelDanger]} numberOfLines={1}>
        {label}
      </Text>
    </Press>
  );
}

/** A labelled row of chips: "Day", "Length". */
function Choice({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.choice}>
      <Text style={styles.choiceLabel}>{label}</Text>
      <View style={styles.flex1}>{children}</View>
    </View>
  );
}

/**
 * The week in the app's marks. A trained day is solid; a planned one is an open
 * mark, and stays open if it passes untrained — a missed day is just that, never a
 * broken chain (AGENTS §6). A rest day is a short rule: a decision, recorded.
 */
function WeekRhythm({ today, sessions, trainingDays }: { today: string; sessions: { date: string; status: SessionStatus }[]; trainingDays: number[] }) {
  const start = weekStartISO(today);
  const byDate = new Map(sessions.map((s) => [s.date, s.status]));
  return (
    <View style={styles.week}>
      {Array.from({ length: 7 }, (_, i) => {
        const date = addDays(start, i);
        const status = byDate.get(date);
        const planned = trainingDays.includes(parseISODate(date).getDay());
        const isToday = date === today;
        const trained = status === 'completed' || status === 'partial';
        const rest = status === 'rest';
        return (
          <View
            key={date}
            style={styles.weekDay}
            accessible
            accessibilityLabel={`${DAY_NAMES[i]}${isToday ? ', today' : ''}: ${status ? WEEK_WORDS[status] : planned ? 'planned' : 'nothing planned'}`}
          >
            <Text style={[styles.weekLabel, isToday && styles.weekLabelOn]}>{'MTWTFSS'[i]}</Text>
            <View style={styles.weekMarkBox}>
              {trained ? (
                <View style={[styles.weekMark, styles.weekSolid, status === 'partial' && styles.weekPartial]} />
              ) : rest ? (
                <View style={styles.weekRest} />
              ) : planned || status ? (
                <View style={[styles.weekMark, styles.weekOpen, date < today && styles.weekPast]} />
              ) : null}
            </View>
            <View style={[styles.weekToday, isToday && styles.weekTodayOn]} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  headline: { gap: space.xs, marginTop: space.xs, marginBottom: space.md },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  kicker: { ...font.label, fontSize: 14, fontWeight: '600', color: color.textMuted, flexShrink: 1 },
  tag: { ...font.caption, fontSize: 12, fontWeight: '600', color: color.text, textDecorationLine: 'underline' },
  heat: { color: color.accent },
  positive: { color: color.positive },
  title: { fontFamily: font.title.fontFamily, fontSize: 40, lineHeight: 44, fontWeight: '800', letterSpacing: -1.4, color: color.text },
  lede: { ...font.label, fontWeight: '400', color: color.textMuted, marginTop: space.md },
  fit: { ...font.caption, color: color.textMuted, marginTop: space.xs },

  choice: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hit.default, marginTop: space.md },
  choiceLabel: { ...font.caption, fontSize: 12, fontWeight: '600', color: color.textMuted, width: 48 },

  decisions: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  decision: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs + 2,
    minHeight: hit.default,
    paddingHorizontal: space.sm,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: color.border,
  },
  decisionDanger: { borderColor: color.danger },
  decisionHeld: { backgroundColor: color.surfaceHigh },
  decisionLabel: { ...font.caption, fontSize: 13, fontWeight: '600', color: color.text, flexShrink: 1 },
  decisionLabelDanger: { color: color.danger },

  scoreBlock: { marginTop: gap.section - space.md },
  weekBlock: { marginTop: space.lg },
  week: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.xs },
  weekDay: { alignItems: 'center', gap: space.sm, width: 36 },
  weekLabel: { ...font.caption, fontSize: 12, fontWeight: '500', color: color.textFaint },
  weekLabelOn: { color: color.text, fontWeight: '700' },
  weekMarkBox: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  weekMark: { width: 14, height: 14, borderRadius: 2 },
  weekSolid: { backgroundColor: color.text },
  /** Trained, partly: still solid — it happened — with its lower half left open. */
  weekPartial: { borderWidth: 1.5, borderColor: color.text, backgroundColor: color.textMuted },
  weekOpen: { borderWidth: 1.5, borderColor: color.textMuted },
  weekPast: { borderColor: color.textFaint },
  weekRest: { width: 12, height: 2, borderRadius: 1, backgroundColor: color.textMuted },
  weekToday: { width: 16, height: 2, borderRadius: 1, backgroundColor: 'transparent' },
  weekTodayOn: { backgroundColor: color.accent },
  footnote: { ...font.caption, fontSize: 12, color: color.textFaint, marginTop: space.md },

  sheetTail: { height: space.lg },
});
