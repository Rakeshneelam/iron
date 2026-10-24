import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { Card, Icon, IconButton, ListCard, ListRow, Pill, Press, PrimaryButton, Screen, SectionHeader, TitleBlock, toast } from '@/components';
import { useLive } from '@/db/live';
import { getSlot, updateSlot } from '@/db/repositories/program';
import {
  activeRecommendations,
  dismissRecommendation,
  liftTops,
  recentWorkouts,
  undismissRecommendation,
  weekInsights,
  weekSummary,
  weeksRecord,
  type LiftChange,
} from '@/db/repositories/progress';
import { getRaw, setRaw, setSetting, useSettings } from '@/db/repositories/settings';
import { buildDeloadInput, weeklySetsPerMuscle } from '@/db/repositories/stats';
import { shouldDeload } from '@/engine/progression';
import type { Recommendation } from '@/engine/recommend';
import { siteDef } from '@/features/body/sites';
import { computeTargets } from '@/features/food/targets';
import { LongRecord } from '@/features/progress/LongRecord';
import { VolumeList } from '@/features/program/VolumeList';
import { STATUS_LABEL, STATUS_TONE } from '@/features/session/status';
import { addDays, daysBetweenISO, fmtDayLabel, todayISO, weekStartISO } from '@/lib/date';
import { kgNum, ml, signed } from '@/lib/format';
import { hydrationTarget } from '@/services/hydration';
import { color, font, hit, radius, space } from '@/theme/tokens';

/** Suggestions shown before the "All N" toggle. */
const SHOWN_RECS = 3;
/** Lifts shown before "View all" — which used to not exist at all (UX-09). */
const SHOWN_LIFTS = 8;
/** Weeks the long record shows at once. A quarter: long enough for a trend, short enough to read. */
const WEEKS = 12;

const volume = (kgTotal: number) => (kgTotal >= 1000 ? `${(kgTotal / 1000).toFixed(1)}k` : String(Math.round(kgTotal)));

/**
 * Is it working? Months of the record at the top, then one week of it read closely,
 * with the engine's suggestions for you to approve — never applied on their own.
 *
 * The page used to open on three stat tiles for one week, so "how has it gone"
 * could only ever be answered seven days at a time. Now the long record leads
 * (features/progress/LongRecord): a quarter of training, body, food and water on one
 * calendar, every week a column you can tap. The week you pick is what everything
 * under it describes, so moving through time and reading a week are one gesture.
 */
export default function ProgressScreen() {
  const settings = useSettings();
  const today = todayISO();
  const thisWeek = weekStartISO(today);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const isThisWeek = weekStart === thisWeek;
  /*
   * Which quarter the record shows. It stays put while you tap around inside it,
   * and only moves when the picked week leaves it — a window that re-centred on
   * every tap would slide the column out from under the finger that chose it.
   */
  const [windowEnd, setWindowEnd] = useState(thisWeek);
  const pick = (w: string) => {
    setWeekStart(w);
    if (w > windowEnd) setWindowEnd(w);
    else if (daysBetweenISO(w, windowEnd) >= WEEKS * 7) {
      const end = addDays(w, 7 * 4);
      setWindowEnd(end > thisWeek ? thisWeek : end);
    }
  };

  const data = useLive(
    () => {
      const target = hydrationTarget().ml;
      return { week: weekSummary(weekStart, target), prev: weekSummary(addDays(weekStart, -7), target), muscles: weeklySetsPerMuscle(weekStart) };
    },
    ['session', 'set_log', 'exercise_session_stat', 'exercise', 'weigh_in', 'measurement', 'water_log', 'routine', 'setting'],
    [weekStart],
  );
  const record = useLive(
    () => {
      const water = hydrationTarget().ml;
      return { weeks: weeksRecord(windowEnd, WEEKS, water), water, kcal: computeTargets(today).kcal };
    },
    ['session', 'set_log', 'weigh_in', 'water_log', 'meal_log', 'food', 'recipe', 'recipe_item', 'setting'],
    [windowEnd, today],
  );
  const recs = useLive(
    () => (isThisWeek ? activeRecommendations() : []),
    ['routine', 'routine_day', 'routine_slot', 'exercise', 'session', 'session_exercise', 'set_log', 'exercise_session_stat', 'setting'],
    [isThisWeek],
  );
  const deload = useLive(() => shouldDeload(buildDeloadInput()), ['exercise_session_stat', 'set_log', 'session', 'setting']);
  const insights = useLive(
    () => weekInsights(weekStart, hydrationTarget().ml, computeTargets(today).proteinG),
    ['session', 'set_log', 'exercise_session_stat', 'exercise', 'routine', 'routine_day', 'weigh_in', 'measurement', 'water_log', 'meal_log', 'food', 'recipe', 'setting'],
    [weekStart, today],
  );
  const workouts = useLive(() => recentWorkouts(8), ['session', 'set_log']);
  const liftIds = data.week.lifts.map((l) => l.exerciseId);
  const tops = useLive(() => liftTops(liftIds, 8), ['exercise_session_stat'], [liftIds.join(',')]);

  const dismissKey = `review:deloadDismissed:${weekStart}`;
  const deloadDismissed = useLive(() => getRaw(dismissKey) === 'true', ['setting'], [dismissKey]);
  const deloadSince = settings.lastDeloadDate;
  const deloadRunning = deloadSince !== null && daysBetweenISO(deloadSince, today) < 7;

  // Three at a time: ten stacked cards of identical shape push everything below them
  // off the screen and stop reading as advice.
  const [allRecs, setAllRecs] = useState(false);
  const [allLifts, setAllLifts] = useState(false);
  const [showMuscles, setShowMuscles] = useState(false);
  const [showBody, setShowBody] = useState(false);
  const { week, prev } = data;

  const done = week.completed + week.partial;
  // One weigh-in makes start === end, and "+0.0 kg" reads as a measured result
  // rather than as "not enough readings to say".
  const bw =
    week.bodyweight.start !== null && week.bodyweight.end !== null && week.bodyweight.start !== week.bodyweight.end
      ? week.bodyweight.end - week.bodyweight.start
      : null;
  const empty = done + week.cancelled + week.skipped + week.rest === 0;
  /** In kilograms, not a percentage: the tonnage itself is the fact (brief §6). */
  const volumeDelta = prev.tonnage > 0 && week.tonnage > 0 ? week.tonnage - prev.tonnage : null;

  const apply = (r: Recommendation) => {
    if (!r.change) return;
    const slot = getSlot(r.change.slotId);
    if (!slot) return;
    const before = slot.targetSets;
    updateSlot(slot.id, { targetSets: r.change.targetSets });
    toast(`Plan updated: ${before} → ${r.change.targetSets} sets`, { label: 'Undo', onPress: () => updateSlot(slot.id, { targetSets: before }) });
  };
  const dismiss = (r: Recommendation) => {
    dismissRecommendation(r.id);
    toast('Hidden for two weeks', { label: 'Undo', onPress: () => undismissRecommendation(r.id) });
  };
  const openSlot = (slotId?: string) => {
    const slot = slotId ? getSlot(slotId) : undefined;
    router.push(slot ? `/program/${slot.routineDayId}` : '/program');
  };

  const facts = [
    `${week.sets} sets`,
    `${week.exercises} different ${week.exercises === 1 ? 'exercise' : 'exercises'}`,
    week.skipped ? `${week.skipped} missed` : '',
    // Rest days are stated, never scored: a week with three of them is not a worse week.
    week.rest ? `${week.rest} rest ${week.rest === 1 ? 'day' : 'days'}` : '',
    week.cancelled ? `${week.cancelled} cancelled` : '',
  ].filter(Boolean);

  return (
    <Screen
      title="Progress"
      subtitle={isThisWeek ? 'This week' : `Week of ${fmtDayLabel(weekStart)}`}
      tab
      right={
        <View style={styles.nav}>
          <IconButton icon="chevronLeft" accessibilityLabel="Previous week" onPress={() => pick(addDays(weekStart, -7))} />
          <IconButton icon="chevronRight" accessibilityLabel="Next week" disabled={isThisWeek} onPress={() => pick(addDays(weekStart, 7))} />
        </View>
      }
    >
      <LongRecord weeks={record.weeks} selected={weekStart} kcalTarget={record.kcal} waterTarget={record.water} onSelect={pick} />
      <Text style={styles.footnote}>
        Solid is logged, open is planned and missed, lines are trends. Food and water are measured against today’s targets — Iron never stored the old ones.
      </Text>

      {/* The picked week, read closely. */}
      <SectionHeader title={isThisWeek ? 'This week' : `Week of ${fmtDayLabel(weekStart)}`} />
      <TitleBlock
        cells={[
          { label: 'Workouts', value: week.plannedDays ? `${done}/${week.plannedDays}` : String(done) },
          { label: 'Sets', value: String(week.sets) },
          { label: 'Lifted', value: volume(week.tonnage), unit: 'kg' },
          { label: 'Time', value: String(week.minutes), unit: 'min' },
        ]}
      />
      <View style={styles.facts}>
        {empty ? (
          <Text style={styles.fact}>{isThisWeek ? 'Nothing logged yet. Start a workout and this fills in.' : 'Nothing logged this week.'}</Text>
        ) : (
          facts.map((f) => (
            <Text key={f} style={styles.fact}>
              {f}
            </Text>
          ))
        )}
        {volumeDelta !== null && Math.abs(volumeDelta) >= 1 ? (
          <Text style={[styles.fact, volumeDelta > 0 && styles.up]}>
            {volumeDelta > 0 ? '+' : '−'}
            {volume(Math.abs(volumeDelta))} kg on the week before
          </Text>
        ) : null}
      </View>

      {/*
        What the week says, in sentences the data supports — drawn as notes in the
        margin of the record, which is what they are: commentary, not more numbers.
      */}
      {insights.length ? (
        <View style={styles.notes}>
          {insights.map((t) => (
            <Text key={t} style={styles.noteText}>
              {t}
            </Text>
          ))}
        </View>
      ) : null}

      {/*
        Deloading is something you do now, so its controls only exist on the
        current week. Browsing March and being offered "Start deload week" was an
        action about today filed under a date three months ago (UX-09).
      */}
      {!isThisWeek ? null : deloadRunning && deloadSince ? (
        <Card tone="positive" style={styles.gapTop}>
          <Text style={styles.cardTitle}>Deload week in progress</Text>
          <Text style={styles.muted}>Half the sets, a bit lighter. Normal targets return {fmtDayLabel(addDays(deloadSince, 7))}.</Text>
          {/* Reversible, so it happens at once with an Undo rather than behind an
              "are you sure?" — confirm() is for destroying data (AGENTS §1.4). */}
          <PrimaryButton
            label="End deload now"
            tone="neutral"
            style={styles.gapTop}
            onPress={() => {
              const was = deloadSince;
              setSetting('lastDeloadDate', null);
              toast('Deload ended — normal targets from your next workout', {
                label: 'Undo',
                onPress: () => setSetting('lastDeloadDate', was),
              });
            }}
          />
        </Card>
      ) : deload.deload && !deloadDismissed ? (
        <Card tone="warning" style={styles.gapTop}>
          <Text style={styles.cardTitle}>A lighter week might help</Text>
          {deload.reasons.map((r) => (
            <Text key={r} style={styles.body}>
              {r}
            </Text>
          ))}
          <View style={styles.row}>
            <PrimaryButton
              label="Start deload week"
              style={styles.flex1}
              onPress={() => {
                const was = settings.lastDeloadDate;
                setSetting('lastDeloadDate', today);
                toast('Deload week started', { label: 'Undo', onPress: () => setSetting('lastDeloadDate', was) });
              }}
            />
            <PrimaryButton label="Not now" tone="neutral" onPress={() => setRaw(dismissKey, 'true')} />
          </View>
        </Card>
      ) : null}

      {recs.length ? (
        <>
          <SectionHeader
            title="Suggestions for your plan"
            hint="Nothing changes until you apply it."
            action={recs.length > SHOWN_RECS ? { label: allRecs ? 'Show fewer' : `All ${recs.length}`, onPress: () => setAllRecs(!allRecs) } : undefined}
          />
          {(allRecs ? recs : recs.slice(0, SHOWN_RECS)).map((r) => (
            <View key={r.id} style={styles.rec}>
              <View style={styles.recHead}>
                <Icon name={r.kind === 'keep_going' ? 'check' : 'spark'} size={18} color={r.kind === 'keep_going' ? color.positive : color.text} />
                <Text style={styles.recTitle}>{r.title}</Text>
              </View>
              <Text style={styles.muted}>{r.reason}</Text>
              <View style={styles.row}>
                {r.change ? <PrimaryButton label="Apply" style={styles.flex1} onPress={() => apply(r)} /> : null}
                {r.kind === 'replace_exercise' ? <PrimaryButton label="Open plan" tone="neutral" style={styles.flex1} onPress={() => openSlot(r.slotId)} /> : null}
                {r.kind === 'fewer_days' ? <PrimaryButton label="See plans" tone="neutral" style={styles.flex1} onPress={() => router.push('/program')} /> : null}
                <PrimaryButton label={r.kind === 'keep_going' ? 'Got it' : 'Dismiss'} tone="neutral" onPress={() => dismiss(r)} />
              </View>
            </View>
          ))}
        </>
      ) : null}

      {week.lifts.length ? (
        <>
          <SectionHeader
            title="Lifts"
            hint="Each lift’s top sets, newest on the right. Tap one for its whole record."
            action={week.lifts.length > SHOWN_LIFTS ? { label: allLifts ? 'Show fewer' : `View all ${week.lifts.length}`, onPress: () => setAllLifts(!allLifts) } : undefined}
          />
          <View>
            {(allLifts ? week.lifts : week.lifts.slice(0, SHOWN_LIFTS)).map((l, i) => (
              <LiftRow key={l.exerciseId} lift={l} tops={tops.get(l.exerciseId) ?? []} weekStart={weekStart} divider={i > 0} />
            ))}
          </View>
        </>
      ) : null}

      {/* Detail, collapsed. Open it when you want it; it is not the headline. */}
      <SectionHeader title="Body & water" action={{ label: showBody ? 'Hide' : 'Show', onPress: () => setShowBody(!showBody), accessibilityLabel: `${showBody ? 'Hide' : 'Show'} body and water` }} />
      {showBody ? (
        <View>
          <Row label="Bodyweight trend" value={bw === null ? '—' : `${signed(bw, 1)} kg`} />
          {week.measurements.map((m) => {
            const def = siteDef(m.site);
            return <Row key={m.site} label={def.label} value={`${kgNum(m.value)} ${def.unit}${m.prev !== null ? `  (${signed(m.value - m.prev)})` : ''}`} />;
          })}
          <Row label="Water target reached" value={week.water.days ? `${week.water.daysHit} of ${week.water.days} days` : '—'} />
          {week.water.daysLogged ? <Row label="Average water" value={ml(week.water.avgMl)} /> : null}
        </View>
      ) : null}

      <SectionHeader title="Sets per muscle" action={{ label: showMuscles ? 'Hide' : 'Show', onPress: () => setShowMuscles(!showMuscles), accessibilityLabel: `${showMuscles ? 'Hide' : 'Show'} sets per muscle` }} />
      {showMuscles ? <VolumeList weekly={data.muscles} /> : null}

      {/*
        Always here, whether or not this particular week has anything in it — "find
        a workout" is not a question about one week.
      */}
      <SectionHeader title="Workouts" action={{ label: 'All history', onPress: () => router.push('/history'), accessibilityLabel: 'Search every workout you have logged' }} />
      {workouts.length ? (
        <ListCard>
          {workouts.map((w, i) => (
            <ListRow
              key={w.session.id}
              divider={i > 0}
              title={w.dayLabel ?? 'Workout'}
              sub={`${fmtDayLabel(w.session.date)}${w.sets ? `, ${w.sets} sets` : ''}`}
              right={<Pill label={STATUS_LABEL[w.session.status]} tone={STATUS_TONE[w.session.status]} />}
              onPress={() => router.push(`/session/summary/${w.session.id}`)}
            />
          ))}
        </ListCard>
      ) : (
        <Text style={styles.footnote}>Your finished workouts will be listed here, newest first.</Text>
      )}
    </Screen>
  );
}

/**
 * One lift, read at a glance: its name, its recent top sets drawn as the record
 * draws them, and the change this week as a dimension — kilograms, not percent.
 */
function LiftRow({ lift, tops, weekStart, divider }: { lift: LiftChange; tops: { date: string; topWeight: number }[]; weekStart: string; divider: boolean }) {
  const d = lift.prevBestE1rm === null ? null : lift.bestE1rm - lift.prevBestE1rm;
  const w = lift.prevTopWeight === null ? null : lift.topWeight - lift.prevTopWeight;
  const delta = w === null ? 'first time' : w !== 0 ? `${signed(w)} kg` : d !== null && d > 0.05 ? 'more reps' : 'same';
  const up = (w !== null && w > 0) || (w === 0 && d !== null && d > 0.05);
  const end = addDays(weekStart, 6);
  const lo = Math.min(...tops.map((t) => t.topWeight), lift.topWeight);
  const hi = Math.max(...tops.map((t) => t.topWeight), lift.topWeight);
  const W = 76;
  const H = 26;
  return (
    <Press
      onPress={() => router.push(`/exercise/${lift.exerciseId}?tab=progress`)}
      accessibilityRole="button"
      accessibilityLabel={`${lift.name}: top set ${kgNum(lift.topWeight)} kg this week, ${delta}. Opens its record.`}
      feedback="highlight"
      style={[styles.lift, divider && styles.divider]}
      pressedStyle={styles.liftHeld}
    >
      <View style={styles.flex1}>
        <Text style={styles.liftName} numberOfLines={1}>
          {lift.name}
        </Text>
        <Text style={[styles.liftDelta, up && styles.up]}>{delta}</Text>
      </View>
      <Svg width={W} height={H} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {tops.map((t, i) => {
          const x = (i + 0.5) * (W / Math.max(tops.length, 1));
          const y = H - 4 - (hi === lo ? (H - 8) / 2 : ((t.topWeight - lo) / (hi - lo)) * (H - 8));
          const inWeek = t.date >= weekStart && t.date <= end;
          return <Rect key={`${t.date}-${i}`} x={x - 4} y={y - 1.5} width={8} height={3} rx={1} fill={color.text} opacity={inWeek ? 1 : 0.42} />;
        })}
      </Svg>
      <Text style={styles.liftValue}>
        {kgNum(lift.topWeight)}
        <Text style={styles.liftUnit}> kg</Text>
      </Text>
    </Press>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.body}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  gapTop: { marginTop: space.md },
  nav: { flexDirection: 'row' },
  row: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  footnote: { ...font.caption, fontSize: 12, color: color.textFaint, marginTop: space.sm },
  facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: 2, marginTop: space.sm },
  fact: { ...font.caption, fontVariant: ['tabular-nums'], color: color.textMuted },
  up: { color: color.positive },
  notes: { marginTop: space.lg, gap: space.sm, borderLeftWidth: 2, borderLeftColor: color.border, paddingLeft: space.md },
  noteText: { ...font.label, fontSize: 14, lineHeight: 20, fontWeight: '400', color: color.text },
  cardTitle: { ...font.heading, color: color.text, marginBottom: space.sm },
  rec: { paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  recHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recTitle: { ...font.label, color: color.text, fontWeight: '700', flex: 1 },
  body: { ...font.body, color: color.text },
  muted: { ...font.caption, fontSize: 14, lineHeight: 20, color: color.textMuted, marginTop: space.xs },
  lift: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hit.gym, paddingVertical: space.sm, paddingHorizontal: space.xs, borderRadius: radius.sm },
  liftHeld: { backgroundColor: color.surface },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  liftName: { ...font.label, fontWeight: '600', color: color.text },
  liftDelta: { ...font.caption, fontVariant: ['tabular-nums'], color: color.textMuted },
  liftValue: { ...font.measure, fontSize: 22, lineHeight: 26, color: color.text, minWidth: 64, textAlign: 'right' },
  liftUnit: { ...font.caption, fontSize: 12, fontWeight: '400', color: color.textFaint, letterSpacing: 0 },
  value: { ...font.label, fontSize: 14, fontVariant: ['tabular-nums'], color: color.text, fontWeight: '700' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: hit.default, gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
});
