import { Redirect, router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, DayStrip, Icon, IconButton, isTile, ListCard, ListRow, Pill, Press, PrimaryButton, Screen, SectionHeader, Sheet, Sparkline, toast, useNow, type CardTone, type IconName } from '@/components';
import { CATALOG_BY_ID } from '@/data/catalog';
import { useLive } from '@/db/live';
import { listWeighIns } from '@/db/repositories/body';
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
import { deleteEntry as deleteWaterEntry, getDayTotal, logWater } from '@/db/repositories/water';
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
import { RoutineSheet } from '@/features/warmup/RoutineSheet';
import { addDays, daysBetweenISO, fmtDayLabel, parseISODate, todayISO, weekStartISO } from '@/lib/date';
import { kgNum, ml, signed } from '@/lib/format';
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
/** Past this, the screen says how long it has been — as a fact, never as a reproach. */
const LONG_GAP_DAYS = 10;

/**
 * Today: what today is, and the one thing to do next.
 *
 *   1. Who and when — your initial, the date, a line that follows the day's state.
 *   2. The week as a strip of days, a dot under each one trained. A missed day is a
 *      day without a dot, nothing more: there is no chain here to break.
 *   3. The day's work as a volt card — its name large, its facts as chips. This
 *      answers "what is today" in the first five seconds.
 *   4. The other three trackers as tiles in their own colours — water sky, food
 *      peach, body lavender — each one tap from its screen, water and food one tap
 *      from logging.
 *
 * The one action — Start, Resume, Log a workout — sits in the dock under a thumb.
 * The exercise list is still not here (the workout shows it first) and neither is
 * a check-in (the workout's first stage asks).
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
      const trend = weightTrend(listWeighIns());
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
        waterTotal: getDayTotal(today),
        kcal: getFoodDay(today).totals.kcal,
        kcalTarget: computeTargets(today).kcal,
        trend: trend.slice(-21),
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

  const restDay = !settings.trainingDays.includes(now.getDay());
  const done = state.finishedToday;

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

  /** A glass, from the water tile: the thing done eight times a day, in one tap. */
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

  /* ------------------------------ the week ------------------------------- */
  const weekStart = weekStartISO(today);
  const byDate = new Map(state.week.map((s) => [s.date, s.status]));
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const status = byDate.get(date);
    return {
      date,
      status,
      trained: status !== undefined && TRAINED.includes(status),
      planned: settings.trainingDays.includes(parseISODate(date).getDay()),
    };
  });
  const trainedThisWeek = weekDays.filter((d) => d.trained).length;
  const plannedThisWeek = weekDays.filter((d) => d.planned).length;

  /* ---------------------------- the trackers ----------------------------- */
  const [waterValue, waterUnit] = ml(state.waterTotal).split(' ');
  const trendNow = state.trend[state.trend.length - 1];
  const trendWeekAgo = [...state.trend].reverse().find((t) => t.date <= addDays(today, -7));
  const trendDelta = trendNow && trendWeekAgo ? trendNow.trend - trendWeekAgo.trend : null;

  const tiles = (
    <View style={styles.bento}>
      <View style={styles.bentoRow}>
        <Tile
          tone="sky"
          icon="water"
          label="Water"
          value={waterValue ?? '0'}
          unit={waterUnit}
          sub={`of ${ml(waterTarget)} today`}
          fill={waterTarget > 0 ? state.waterTotal / waterTarget : 0}
          onPress={() => router.push('/water')}
          add={{ label: 'Log a glass, 250 ml', onPress: glass }}
          accessibilityLabel={`Water: ${ml(state.waterTotal)} of ${ml(waterTarget)} today. Opens water.`}
        />
        <Tile
          tone="peach"
          icon="food"
          label="Food"
          value={String(Math.round(state.kcal))}
          sub={`of ${Math.round(state.kcalTarget)} kcal`}
          fill={state.kcalTarget > 0 ? state.kcal / state.kcalTarget : 0}
          onPress={() => router.push('/food')}
          add={{ label: 'Add food', onPress: () => router.push(`/food?add=${Date.now()}`) }}
          accessibilityLabel={`Food: ${Math.round(state.kcal)} of ${Math.round(state.kcalTarget)} kcal today. Opens food.`}
        />
      </View>
      <View style={styles.bentoRow}>
        <Tile
          tone="lav"
          icon="body"
          label="Weight"
          value={trendNow ? kgNum(Math.round(trendNow.trend * 10) / 10) : '—'}
          unit={trendNow ? 'kg' : undefined}
          // The trend, never the morning's raw number: the scale swings on water alone.
          sub={trendNow ? (trendDelta !== null ? `trend, ${signed(trendDelta)} this week` : 'trend weight') : 'Weigh in after waking'}
          onPress={() => router.push('/body?section=weight')}
          accessibilityLabel={trendNow ? `Trend weight ${kgNum(Math.round(trendNow.trend * 10) / 10)} kg. Opens body.` : 'No weigh-ins yet. Opens body.'}
        >
          {state.trend.length > 1 ? (
            <View style={styles.spark}>
              <Sparkline values={state.trend.map((t) => t.trend)} width={128} height={28} color={color.onTile} strokeWidth={2.5} />
            </View>
          ) : null}
        </Tile>
        <Tile
          tone="default"
          label="This week"
          value={String(trainedThisWeek)}
          unit={plannedThisWeek ? `of ${plannedThisWeek}` : undefined}
          sub={trainedThisWeek === 1 ? 'workout' : 'workouts'}
          onPress={() => router.push('/history')}
          accessibilityLabel={`This week: ${trainedThisWeek} ${trainedThisWeek === 1 ? 'workout' : 'workouts'}${plannedThisWeek ? ` of ${plannedThisWeek} planned` : ''}. Opens history.`}
        >
          <View style={styles.weekDots}>
            {weekDays.map((d) => (
              <View key={d.date} style={[styles.weekDot, d.trained ? styles.weekDotDone : d.date === today ? styles.weekDotToday : d.planned ? styles.weekDotPlanned : null]} />
            ))}
          </View>
        </Tile>
      </View>
    </View>
  );

  /**
   * Everything that is not "start the workout".
   *
   * One sheet rather than a column of five buttons under a heading. They are all
   * decisions you make occasionally, and a decision you make occasionally should
   * cost one extra tap rather than costing the main action its place on screen.
   */
  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
  const dateLine = now.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
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

  /** Said once, as a fact: a long gap changes nothing you have to do. */
  const sinceLast = state.lastTrained ? daysBetweenISO(state.lastTrained, today) : null;
  const gapNote =
    sinceLast !== null && sinceLast >= LONG_GAP_DAYS && !state.active && !done
      ? `Last workout ${sinceLast} days ago. Your plan picks up where you left it; the first sets back are prescribed from your record.`
      : null;

  const name = settings.name.trim();
  const greeting = state.active
    ? 'Workout in progress'
    : done
      ? 'Done for today'
      : markedToday
        ? markedToday.status === 'rest'
          ? 'Resting today'
          : 'Taking today off'
        : name
          ? `Ready, ${name}?`
          : 'Ready to train?';
  const top = (
    <>
      <View style={styles.top}>
        <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {name ? <Text style={styles.avatarText}>{name[0]?.toUpperCase()}</Text> : <Icon name="body" size={22} color={color.onTile} />}
        </View>
        <View style={styles.topText}>
          <Text style={styles.date} numberOfLines={1}>
            {weekday}, {dateLine}
          </Text>
          <Text style={styles.greeting} numberOfLines={1} accessibilityRole="header">
            {greeting}
          </Text>
        </View>
        <IconButton icon="settings" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
      </View>
      <DayStrip days={weekDays.map((d) => ({ date: d.date, marked: d.trained, note: d.status ? WEEK_WORDS[d.status] : d.planned ? 'planned' : undefined }))} selected={today} />
    </>
  );

  /* ---------------------------- in progress ----------------------------- */
  if (state.active) {
    const a = state.active;
    const p = state.activeProgress;
    const resume = () => router.push(`/session/${a.id}`);
    return (
      <Screen tab dock={<PrimaryButton label="Resume workout" size="gym" icon={<Icon name="play" size={20} color={color.onAccent} />} onPress={resume} />}>
        {top}
        <Hero
          kicker="In progress"
          live
          title={state.activeDay?.label ?? 'Workout'}
          chips={[
            { key: 'sets', text: `${state.activeSets} ${state.activeSets === 1 ? 'set' : 'sets'}` },
            ...(p && p.planned > 0 ? [{ key: 'ex', text: `${p.done + p.skipped} of ${p.planned} exercises` }] : []),
            { key: 'time', text: <Elapsed since={a.startedAt} /> },
          ]}
          onPress={resume}
          accessibilityLabel="Resume the workout in progress"
        />
        <View style={styles.decisions}>
          <Decision icon="list" label="More" onPress={() => setMoreOpen(true)} />
          {/* Always asks first (features/session/cancel); cancelling never counts as done. */}
          <Decision icon="close" label="Cancel workout" tone="danger" onPress={() => cancelWorkout(a.id, state.activeSaved)} />
        </View>
        {tiles}
        {moreSheet}
        {recoverySheet}
      </Screen>
    );
  }

  /* ------------------------------ no plan -------------------------------- */
  if (!state.routine || !day) {
    const routine = state.routine;
    return (
      <Screen tab dock={<PrimaryButton label="Log a workout" size="gym" icon={<Icon name="plus" size={20} color={color.onAccent} />} onPress={startEmpty} />}>
        {top}
        <Hero kicker={routine ? routine.name : 'No active plan'} title={routine ? `${routine.name} has no days yet` : 'Train without a plan'} chips={[]} />
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
        {tiles}
        {moreSheet}
        {recoverySheet}
      </Screen>
    );
  }

  /* --------------------------- done for today ---------------------------- */
  if (done && state.doneSummary) {
    const s = state.doneSummary;
    const at = new Date(done.endedAt ?? done.startedAt);
    const lifted = s.totalTonnage >= 10000 ? `${(s.totalTonnage / 1000).toFixed(1)}k kg` : `${Math.round(s.totalTonnage)} kg`;
    return (
      <Screen
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
        {top}
        {/*
          The day's work, reported rather than re-offered: the card says what was
          done, and opens the record of it.
        */}
        <Hero
          kicker={`${done.status === 'completed' ? 'Done' : 'Logged, partly'} at ${fmtClockOfDay(at.getHours() * 60 + at.getMinutes())}`}
          title={state.doneDay?.label ?? 'Workout'}
          chips={[
            { key: 'sets', text: `${s.hardSets} ${s.hardSets === 1 ? 'set' : 'sets'}` },
            ...(s.totalTonnage > 0 ? [{ key: 'kg', text: lifted }] : []),
            { key: 'min', text: `${s.durationMin} min` },
          ]}
          onPress={() => router.push(`/session/summary/${done.id}`)}
          accessibilityLabel="See the workout you did today"
        />
        <Text style={styles.lede}>
          {s.progress.planned > 0
            ? `${s.progress.done} of ${s.progress.planned} planned ${s.progress.planned === 1 ? 'exercise' : 'exercises'} done${s.progress.skipped ? `, ${s.progress.skipped} skipped` : ''}. Next up: ${day.label}.`
            : `${s.perExercise.length} ${s.perExercise.length === 1 ? 'exercise' : 'exercises'} logged. Next up: ${day.label}.`}
        </Text>
        <View style={styles.decisions}>
          <Decision icon="chevronRight" label="The workout" onPress={() => router.push(`/session/summary/${done.id}`)} />
          <Decision icon="progress" label="Progress" onPress={() => router.push('/review')} />
          <Decision icon="list" label="More" onPress={() => setMoreOpen(true)} />
        </View>
        {tiles}
        {moreSheet}
        {recoverySheet}
      </Screen>
    );
  }

  /* ----------------------------- next day -------------------------------- */
  /** One tap in. The check-in is the workout's first stage, not a gate in front of it. */
  const start = () => router.push(`/session/${startSession(day.id, fit ? { fit: fit.slots } : {}).id}`);
  const startLabel = `Start ${day.label}${fit ? `, shortened to ${budget} minutes` : ''}. Begins with the check-in.`;
  const kicker = markedToday ? (markedToday.status === 'rest' ? 'Rest day, on purpose' : 'Marked as missed') : restDay ? 'Not a training day' : day.id === state.next?.id ? 'Up next' : 'Chosen';

  return (
    <Screen
      tab
      dock={<PrimaryButton label={restDay || markedToday ? 'Train anyway' : 'Start workout'} size="gym" icon={<Icon name="play" size={20} color={color.onAccent} />} onPress={start} accessibilityLabel={startLabel} />}
    >
      {top}
      <Hero
        kicker={kicker}
        note={state.routine.name}
        title={day.label}
        chips={[
          { key: 'lifts', text: `${preview.length} ${preview.length === 1 ? 'lift' : 'lifts'}` },
          { key: 'sets', text: `${setCount} sets` },
          { key: 'min', text: `~${minutes} min` },
          { key: 'at', text: `usually ${fmtClockOfDay(settings.reminders.workout.minutes)}` },
        ]}
        onPress={start}
        accessibilityLabel={startLabel}
      />
      {gapNote ? <Text style={styles.lede}>{gapNote}</Text> : null}

      {/* The two decisions that rewrite the card above, right under it. */}
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

      {/* The decisions that replace the workout, one row. */}
      <View style={styles.decisions}>
        <Decision icon="moon" label="Rest day" onPress={() => markDay('rest')} />
        <Decision icon="skip" label="Missed it" onPress={() => markDay('skipped')} />
        <Decision icon="list" label="More" onPress={() => setMoreOpen(true)} />
      </View>

      {tiles}
      {moreSheet}
      {recoverySheet}
    </Screen>
  );
}

/**
 * The day's work as a volt card: a small dark tag for its state, the name as large
 * as the screen allows, and its facts as chips. Tapping it does what the dock does.
 */
function Hero({
  kicker,
  live = false,
  note,
  title,
  chips,
  onPress,
  accessibilityLabel,
}: {
  kicker: string;
  live?: boolean;
  note?: string;
  title: string;
  chips: readonly { key: string; text: ReactNode }[];
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Card tone="volt" onPress={onPress} accessibilityLabel={accessibilityLabel} style={styles.hero}>
      <View style={styles.heroRing} pointerEvents="none" />
      <View style={styles.kickerRow}>
        <View style={styles.kicker}>
          <View style={[styles.kickerDot, live && styles.kickerDotLive]} />
          <Text style={styles.kickerText} numberOfLines={1}>
            {kicker}
          </Text>
        </View>
        {note ? (
          <Text style={styles.heroNote} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
      <Text style={styles.heroTitle} numberOfLines={2}>
        {title}
      </Text>
      {chips.length ? (
        <View style={styles.heroChips}>
          {chips.map((c) => (
            <View key={c.key} style={styles.heroChip}>
              <Text style={styles.heroChipText}>{c.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/**
 * One tracker as a tile in its own colour: a label, the figure, what it is out of,
 * and a bar. The round + logs straight from here — a glass of water, a food.
 */
function Tile({
  tone,
  icon,
  label,
  value,
  unit,
  sub,
  fill,
  onPress,
  add,
  accessibilityLabel,
  children,
}: {
  tone: CardTone;
  icon?: IconName;
  label: string;
  value: string;
  unit?: string;
  sub: string;
  fill?: number;
  onPress: () => void;
  add?: { label: string; onPress: () => void };
  accessibilityLabel: string;
  children?: ReactNode;
}) {
  const tile = isTile(tone);
  const ink = tile ? color.onTile : color.text;
  const quiet = tile ? color.onTileMuted : color.textMuted;
  return (
    <Card tone={tone} onPress={onPress} accessibilityLabel={accessibilityLabel} style={styles.tile}>
      <View style={styles.tileHead}>
        {icon ? <Icon name={icon} size={16} color={ink} strokeWidth={2.2} /> : null}
        <Text style={[styles.tileLabel, { color: tile ? ink : quiet }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {add ? (
        <Press onPress={add.onPress} accessibilityRole="button" accessibilityLabel={add.label} hitSlop={8} style={styles.tileAdd} touchStyle={styles.tileAddTouch}>
          <Icon name="plus" size={18} color={color.text} strokeWidth={2.6} />
        </Press>
      ) : null}
      <Text style={[styles.tileValue, { color: ink }]} numberOfLines={1}>
        {value}
        {unit ? <Text style={[styles.tileUnit, { color: tile ? ink : quiet }]}> {unit}</Text> : null}
      </Text>
      <Text style={[styles.tileSub, { color: quiet }]} numberOfLines={1}>
        {sub}
      </Text>
      {fill !== undefined ? (
        <View style={[styles.track, { backgroundColor: tile ? color.onTileWash : color.border }]}>
          <View style={[styles.trackFill, { width: `${Math.round(Math.min(1, Math.max(0, fill)) * 100)}%`, backgroundColor: tile ? color.onTile : color.accent }]} />
        </View>
      ) : null}
      {children}
    </Card>
  );
}

/** A decision that changes today: a dark pill with an icon, visibly not the main action. */
function Decision({ icon, label, tone = 'neutral', onPress }: { icon: IconName; label: string; tone?: 'neutral' | 'danger'; onPress: () => void }) {
  const danger = tone === 'danger';
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label} touchStyle={styles.flex1} style={[styles.decision, danger && styles.decisionDanger]} pressedStyle={styles.decisionHeld}>
      <Icon name={icon} size={17} color={danger ? color.danger : color.textMuted} />
      <Text style={[styles.decisionLabel, danger && styles.decisionLabelDanger]} numberOfLines={1}>
        {label}
      </Text>
    </Press>
  );
}

/** A labelled row of chips: "Day", "Length". */
function Choice({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.choice}>
      <Text style={styles.choiceLabel}>{label}</Text>
      <View style={styles.flex1}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },

  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md, marginBottom: space.lg + 2 },
  avatar: { width: 46, height: 46, borderRadius: radius.pill, backgroundColor: color.lav, alignItems: 'center', justifyContent: 'center' },
  avatarText: { ...font.heading, fontSize: 18, color: color.onTile },
  topText: { flex: 1, minWidth: 0 },
  date: { ...font.caption, color: color.textMuted },
  greeting: { ...font.heading, fontSize: 20, lineHeight: 26, color: color.text },

  hero: { marginTop: space.lg + 2, marginBottom: 0, padding: space.xl - 2, minHeight: 196, borderRadius: radius.xl, overflow: 'hidden' },
  heroRing: { position: 'absolute', right: -48, top: -48, width: 210, height: 210, borderRadius: radius.pill, borderWidth: 30, borderColor: color.onTileWash },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.onTile, flexShrink: 1 },
  kickerDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: color.accent },
  kickerDotLive: { backgroundColor: color.pink },
  kickerText: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '800', color: color.accent, flexShrink: 1 },
  heroNote: { ...font.caption, fontSize: 12, fontWeight: '700', color: color.onTileMuted, flexShrink: 1 },
  // Italic display type overhangs its box; the right padding keeps the last glyph whole.
  heroTitle: { ...font.title, fontSize: 54, lineHeight: 56, letterSpacing: -1, color: color.onTile, marginTop: space.md + 2, marginBottom: space.md, paddingRight: space.xs },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  heroChip: { height: 30, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.onTileWash, justifyContent: 'center' },
  heroChipText: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '800', color: color.onTile, fontVariant: ['tabular-nums'] },

  lede: { ...font.body, color: color.textMuted, marginTop: space.md },
  fit: { ...font.caption, color: color.textMuted, marginTop: space.xs },

  choice: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hit.default, marginTop: space.md },
  choiceLabel: { ...font.eyebrow, fontSize: 12, color: color.textMuted, width: 48 },

  decisions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  decision: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: hit.default, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.surface },
  decisionDanger: { backgroundColor: color.dangerWash },
  decisionHeld: { backgroundColor: color.surfaceHigh },
  decisionLabel: { ...font.caption, fontSize: 13, fontWeight: '700', color: color.text, flexShrink: 1 },
  decisionLabelDanger: { color: color.danger },

  bento: { gap: gap.between, marginTop: space.lg },
  bentoRow: { flexDirection: 'row', gap: gap.between },
  tile: { flex: 1, minWidth: 0, minHeight: 158, marginBottom: 0, padding: space.lg },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 40, minHeight: 22 },
  tileLabel: { ...font.eyebrow },
  tileAddTouch: { position: 'absolute', right: space.md, top: space.md },
  tileAdd: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: color.onTile, alignItems: 'center', justifyContent: 'center' },
  tileValue: { ...font.measure, fontWeight: '900', fontSize: 38, lineHeight: 42, letterSpacing: -0.5, marginTop: space.lg, paddingRight: space.xs },
  tileUnit: { ...font.measure, fontSize: 18, letterSpacing: 0 },
  tileSub: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  track: { height: 8, borderRadius: radius.pill, marginTop: space.md, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: radius.pill },
  spark: { marginTop: space.sm },
  weekDots: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md },
  weekDot: { width: 16, height: 16, borderRadius: radius.pill, borderWidth: 2, borderColor: color.border },
  weekDotDone: { backgroundColor: color.accent, borderColor: color.accent },
  weekDotToday: { borderColor: color.accent },
  weekDotPlanned: { borderColor: color.textFaint },

  footnote: { ...font.caption, fontSize: 12, color: color.textFaint, marginTop: space.md },
  sheetTail: { height: space.lg },
});
