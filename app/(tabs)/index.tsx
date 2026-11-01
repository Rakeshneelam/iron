import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipRow, DayStrip, Icon, IconButton, PrimaryButton, Screen, Sheet, Sparkline, toast, useNow } from '@/components';
import { CATALOG_BY_ID } from '@/data/catalog';
import { useLive } from '@/db/live';
import { listWeighIns } from '@/db/repositories/body';
import { getDay as getFoodDay } from '@/db/repositories/food';
import { weeklyGoal } from '@/db/repositories/level';
import { getActiveRoutine, getDay, getDays, getSlots, resolveNextDay } from '@/db/repositories/program';
import { recentMuscles } from '@/db/repositories/progress';
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
import { WeighInSheet, type WeighEntry } from '@/features/body/sheets';
import { computeTargets } from '@/features/food/targets';
import { LevelAvatar } from '@/features/level/LevelParts';
import { useLevel } from '@/features/level/level';
import { drillKit } from '@/features/profile';
import { cancelWorkout } from '@/features/session/cancel';
import { Elapsed } from '@/features/session/Elapsed';
import { suggestFor, suggestionContext } from '@/features/session/prescription';
import { fmtClockOfDay } from '@/features/settings/time';
import { Actions, Hero, Rise, Tile, WeekGoalTile, type Action } from '@/features/today/TodayParts';
import { RoutineSheet } from '@/features/warmup/RoutineSheet';
import { addDays, daysBetweenISO, parseISODate, todayISO, weekStartISO } from '@/lib/date';
import { kgNum, ml, signed } from '@/lib/format';
import { success } from '@/lib/haptics';
import { hydrationTarget } from '@/services/hydration';
import { rescheduleAll } from '@/services/notifications';
import { color, font, gap, space } from '@/theme/tokens';

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
 *   1. You — your level around your initial, the date, a line that follows the day.
 *   2. The week as a strip of days, a dot under each one trained.
 *   3. The day's work as a volt card. Its corner button changes the day or length.
 *   4. The day's other choices as tiles, always in view — never behind a "More".
 *   5. Water, food and weight as tiles in their own colours, each + logging from
 *      here, and the weekly goal as a ring.
 *
 * The one action — Start, Resume, Log a workout — sits in the dock under a thumb.
 */
export default function Today() {
  const settings = useSettings();
  const today = todayISO();
  const now = useNow();
  const level = useLevel();
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
        doneSummary: finishedToday ? getSessionSummary(finishedToday.id) : undefined,
        doneDay: finishedToday?.routineDayId ? getDay(finishedToday.routineDayId) : undefined,
        lastTrained: recent.find((s) => TRAINED.includes(s.status))?.date ?? null,
        week: listSessions(20, WEEK_STATUSES),
        goal: weeklyGoal(),
        waterTotal: getDayTotal(today),
        kcal: getFoodDay(today).totals.kcal,
        kcalTarget: computeTargets(today).kcal,
        trend: weightTrend(listWeighIns()).slice(-21),
      };
    },
    ['session', 'set_log', 'session_exercise', 'exercise', 'routine', 'routine_day', 'check_in', 'setting', 'water_log', 'meal_log', 'food', 'recipe', 'recipe_item', 'weigh_in'],
    [today],
  );

  const [pickedDayId, setPickedDayId] = useState<string | null>(null);
  const [budget, setBudget] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [weigh, setWeigh] = useState<WeighEntry | null>(null);
  const day = state.days.find((d) => d.id === pickedDayId) ?? state.next;

  const preview = useLive(
    () => {
      if (!day) return [];
      const ctx = suggestionContext();
      return getSlots(day.id).map((s) => ({
        slot: s,
        suggestion: suggestFor(s.exercise, s, undefined, ctx),
      }));
    },
    ['routine', 'routine_day', 'routine_slot', 'exercise', 'exercise_session_stat', 'exercise_link', 'equipment', 'session', 'set_log', 'setting'],
    [day?.id],
  );
  // Live, because the target moves with bodyweight and with training done today.
  const waterTarget = useLive(() => hydrationTarget().ml, ['setting', 'weigh_in', 'session']);
  const kit = drillKit(settings);
  const recovery = useMemo(
    () => (recoveryOpen ? recoverySession(recentMuscles(2), kit) : { items: [], seconds: 0 }),
    // Rebuilt when the sheet opens; the kit cannot change while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recoveryOpen],
  );

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
    return {
      exerciseId: slot.exerciseId,
      sets: slot.targetSets,
      restSeconds: slot.restSeconds,
      compound: c?.compound ?? true,
      repHi: slot.repHi,
      measure: c?.measure,
    };
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

  /* ---------------------------- the trackers ----------------------------- */
  const [waterValue, waterUnit] = ml(state.waterTotal).split(' ');
  const trendNow = state.trend[state.trend.length - 1];
  const trendWeekAgo = [...state.trend].reverse().find((t) => t.date <= addDays(today, -7));
  const trendDelta = trendNow && trendWeekAgo ? trendNow.trend - trendWeekAgo.trend : null;
  const trendKg = trendNow ? kgNum(Math.round(trendNow.trend * 10) / 10) : null;

  const tiles = (
    <View style={styles.bento}>
      <Rise order={2} style={styles.bentoRow}>
        <Tile
          tone="sky"
          icon="water"
          label="Water"
          value={waterValue ?? '0'}
          unit={waterUnit}
          sub={`of ${ml(waterTarget)}`}
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
          add={{
            label: 'Add food',
            onPress: () => router.push(`/food?add=${Date.now()}`),
          }}
          accessibilityLabel={`Food: ${Math.round(state.kcal)} of ${Math.round(state.kcalTarget)} kcal today. Opens food.`}
        />
      </Rise>
      <Rise order={3} style={styles.bentoRow}>
        <Tile
          tone="lav"
          icon="body"
          label="Weight"
          value={trendKg ?? '—'}
          unit={trendKg ? 'kg' : undefined}
          // The trend, never the morning's raw number: the scale swings on water alone.
          sub={trendNow ? (trendDelta !== null ? `${signed(trendDelta)} this week` : 'trend') : 'Not logged yet'}
          onPress={() => router.push('/body?section=weight')}
          add={{
            label: "Log today's weight",
            onPress: () => setWeigh({ date: today }),
          }}
          accessibilityLabel={trendKg ? `Trend weight ${trendKg} kg. Opens body.` : 'No weigh-ins yet. Opens body.'}
        >
          {state.trend.length > 1 ? (
            <View style={styles.spark}>
              <Sparkline values={state.trend.map((t) => t.trend)} width={120} height={26} color={color.onTile} strokeWidth={2.5} />
            </View>
          ) : null}
        </Tile>
        <WeekGoalTile done={trainedThisWeek} goal={state.goal} onPress={() => router.push('/history')} />
      </Rise>
    </View>
  );

  const mobility: Action = {
    icon: 'pulse',
    label: 'Mobility',
    accessibilityLabel: 'Easy mobility, about 8 minutes',
    onPress: () => setRecoveryOpen(true),
  };
  const sheets = (
    <>
      <RoutineSheet
        visible={recoveryOpen}
        title="Mobility"
        routine={recovery}
        available={kit}
        onClose={() => setRecoveryOpen(false)}
        doneLabel="Done"
        onDone={() => {
          setRecoveryOpen(false);
          toast('Nice — mobility done');
        }}
      />
      <WeighInSheet entry={weigh} onClose={() => setWeigh(null)} />
    </>
  );

  /** Said once, as a fact: a long gap changes nothing you have to do. */
  const sinceLast = state.lastTrained ? daysBetweenISO(state.lastTrained, today) : null;
  const gapNote = sinceLast !== null && sinceLast >= LONG_GAP_DAYS && !state.active && !done ? `Back after ${sinceLast} days — your first sets are set from your record.` : null;

  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
  const dateLine = now.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
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
        <LevelAvatar name={name} level={level.level} live={state.active !== undefined} onPress={() => router.push('/you')} />
        <View style={styles.topText}>
          <Text style={styles.date} numberOfLines={1}>
            {weekday}, {dateLine}
          </Text>
          <Text style={styles.greeting} numberOfLines={1} accessibilityRole="header">
            {greeting}
          </Text>
        </View>
        <IconButton icon="settings" accessibilityLabel="Body and training settings" onPress={() => router.push('/settings')} />
      </View>
      <DayStrip
        days={weekDays.map((d) => ({
          date: d.date,
          marked: d.trained,
          note: d.status ? WEEK_WORDS[d.status] : d.planned ? 'planned' : undefined,
        }))}
        selected={today}
      />
    </>
  );

  /* ---------------------------- in progress ----------------------------- */
  if (state.active) {
    const a = state.active;
    const p = state.activeProgress;
    const resume = () => router.push(`/session/${a.id}`);
    return (
      <Screen tab enter={false} dock={<PrimaryButton label="Resume workout" size="gym" icon={<Icon name="play" size={20} color={color.onAccent} />} onPress={resume} />}>
        {top}
        <Rise order={0}>
          <Hero
            kicker="In progress"
            live
            title={state.activeDay?.label ?? 'Workout'}
            chips={[
              {
                key: 'sets',
                text: `${state.activeSets} ${state.activeSets === 1 ? 'set' : 'sets'}`,
              },
              ...(p && p.planned > 0
                ? [
                    {
                      key: 'ex',
                      text: `${p.done + p.skipped} of ${p.planned} done`,
                    },
                  ]
                : []),
              { key: 'time', text: <Elapsed since={a.startedAt} /> },
            ]}
            onPress={resume}
            accessibilityLabel="Resume the workout in progress"
          />
        </Rise>
        {/* Always asks first (features/session/cancel); cancelling never counts as done. */}
        <Rise order={1}>
          <Actions
            items={[
              {
                icon: 'close',
                label: 'Cancel workout',
                tone: 'danger',
                onPress: () => cancelWorkout(a.id, state.activeSaved),
              },
            ]}
          />
        </Rise>
        {tiles}
        {sheets}
      </Screen>
    );
  }

  /* ------------------------------ no plan -------------------------------- */
  if (!state.routine || !day) {
    const routine = state.routine;
    return (
      <Screen tab enter={false} dock={<PrimaryButton label="Log a workout" size="gym" icon={<Icon name="plus" size={20} color={color.onAccent} />} onPress={startEmpty} />}>
        {top}
        <Rise order={0}>
          <Hero kicker={routine ? routine.name : 'No plan yet'} title={routine ? 'Add a day to your plan' : 'Train your way'} chips={[]} />
        </Rise>
        <Rise order={1}>
          <Actions
            items={[
              {
                icon: 'plans',
                label: routine ? 'Edit plan' : 'Choose a plan',
                onPress: () => router.push(routine ? `/plan/${routine.id}` : '/program'),
              },
              {
                icon: 'moon',
                label: 'Rest day',
                onPress: () => markDay('rest'),
              },
              mobility,
            ]}
          />
        </Rise>
        {tiles}
        {sheets}
      </Screen>
    );
  }

  /* --------------------------- done for today ---------------------------- */
  if (done && state.doneSummary) {
    const s = state.doneSummary;
    const at = new Date(done.endedAt ?? done.startedAt);
    const lifted = s.totalTonnage >= 10000 ? `${(s.totalTonnage / 1000).toFixed(1)}k kg` : `${Math.round(s.totalTonnage)} kg`;
    return (
      <Screen tab enter={false}>
        {top}
        {/* The day's work, reported rather than re-offered: the card opens the record of it. */}
        <Rise order={0}>
          <Hero
            kicker={`${done.status === 'completed' ? 'Done' : 'Logged, partly'} at ${fmtClockOfDay(at.getHours() * 60 + at.getMinutes())}`}
            title={state.doneDay?.label ?? 'Workout'}
            chips={[
              {
                key: 'sets',
                text: `${s.hardSets} ${s.hardSets === 1 ? 'set' : 'sets'}`,
              },
              ...(s.totalTonnage > 0 ? [{ key: 'kg', text: lifted }] : []),
              { key: 'min', text: `${s.durationMin} min` },
              { key: 'next', text: `Next: ${day.label}` },
            ]}
            onPress={() => router.push(`/session/summary/${done.id}`)}
            accessibilityLabel="See the workout you did today"
          />
        </Rise>
        <Rise order={1}>
          <Actions
            items={[
              {
                icon: 'play',
                label: 'Another workout',
                onPress: () => router.push(`/session/${startSession(day.id).id}`),
              },
              mobility,
              {
                icon: 'progress',
                label: 'Progress',
                onPress: () => router.push('/review'),
              },
            ]}
          />
        </Rise>
        {tiles}
        {sheets}
      </Screen>
    );
  }

  /* ----------------------------- next day -------------------------------- */
  /** One tap in. The check-in is the workout's first stage, not a gate in front of it. */
  const start = () => router.push(`/session/${startSession(day.id, fit ? { fit: fit.slots } : {}).id}`);
  const startLabel = `Start ${day.label}${fit ? `, shortened to ${budget} minutes` : ''}.`;
  const kicker = markedToday ? (markedToday.status === 'rest' ? 'Rest day' : 'Marked as missed') : restDay ? 'Not a training day' : day.id === state.next?.id ? 'Up next' : 'Chosen';

  return (
    <Screen
      tab
      enter={false}
      dock={
        <PrimaryButton
          label={restDay || markedToday ? 'Train anyway' : 'Start workout'}
          size="gym"
          icon={<Icon name="play" size={20} color={color.onAccent} />}
          onPress={start}
          accessibilityLabel={startLabel}
        />
      }
    >
      {top}
      <Rise order={0}>
        <Hero
          kicker={kicker}
          note={state.routine.name}
          title={day.label}
          chips={[
            {
              key: 'lifts',
              text: `${preview.length} ${preview.length === 1 ? 'lift' : 'lifts'}`,
            },
            { key: 'sets', text: `${setCount} sets` },
            { key: 'min', text: `~${minutes} min` },
          ]}
          onPress={start}
          onChange={state.days.length > 1 || budgets.length > 1 ? () => setChoosing(true) : undefined}
          accessibilityLabel={startLabel}
        />
      </Rise>
      {gapNote ? <Text style={styles.note}>{gapNote}</Text> : null}
      <Rise order={1}>
        <Actions
          items={[
            { icon: 'moon', label: 'Rest day', onPress: () => markDay('rest') },
            {
              icon: 'skip',
              label: 'Missed it',
              onPress: () => markDay('skipped'),
            },
            {
              icon: 'plus',
              label: 'Other workout',
              accessibilityLabel: 'Log a different workout, choosing exercises as you go',
              onPress: startEmpty,
            },
            mobility,
          ]}
        />
      </Rise>
      {tiles}
      {sheets}

      <Sheet visible={choosing} onClose={() => setChoosing(false)} title="Today's workout">
        <View style={styles.choose}>
          {state.days.length > 1 ? (
            <View style={styles.chooseGroup}>
              <Text style={styles.chooseLabel}>Day</Text>
              <ChipRow
                options={state.days.map((d) => ({
                  label: d.label,
                  value: d.id,
                }))}
                value={day.id}
                onChange={(v) => setPickedDayId(v)}
                columns={2}
              />
            </View>
          ) : null}
          {budgets.length > 1 ? (
            <View style={styles.chooseGroup}>
              <Text style={styles.chooseLabel}>Length</Text>
              <ChipRow
                options={budgets.map((m) => ({
                  label: m === 0 ? 'Full' : `${m} min`,
                  value: m,
                }))}
                value={budget}
                onChange={setBudget}
                columns={4}
              />
              {fit ? (
                <Text style={styles.note}>
                  Keeps the main lifts
                  {fit.trimmed.length ? `, trims ${fit.trimmed.length}` : ''}
                  {fit.dropped.length ? `, drops ${fit.dropped.length}` : ''}.
                </Text>
              ) : null}
            </View>
          ) : null}
          <PrimaryButton label="Done" size="gym" onPress={() => setChoosing(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.md,
    marginBottom: space.lg + 2,
  },
  topText: { flex: 1, minWidth: 0 },
  date: { ...font.caption, color: color.textMuted },
  greeting: {
    ...font.heading,
    fontSize: 20,
    lineHeight: 26,
    color: color.text,
  },
  note: { ...font.caption, color: color.textMuted, marginTop: space.md },
  bento: { gap: gap.between, marginTop: space.lg },
  bentoRow: { flexDirection: 'row', gap: gap.between },
  spark: { marginTop: space.sm },
  choose: { gap: space.lg, paddingBottom: space.lg },
  chooseGroup: { gap: space.sm },
  chooseLabel: { ...font.eyebrow, color: color.textMuted },
});
