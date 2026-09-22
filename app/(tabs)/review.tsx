import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Icon, IconButton, ListCard, ListRow, Pill, PrimaryButton, Screen, SectionHeader, StatTile, toast } from '@/components';
import { useLive } from '@/db/live';
import { getSlot, updateSlot } from '@/db/repositories/program';
import { activeRecommendations, dismissRecommendation, recentWorkouts, undismissRecommendation, weekInsights, weekSummary } from '@/db/repositories/progress';
import { getRaw, setRaw, setSetting, useSettings } from '@/db/repositories/settings';
import { buildDeloadInput, weeklySetsPerMuscle } from '@/db/repositories/stats';
import { shouldDeload } from '@/engine/progression';
import type { Recommendation } from '@/engine/recommend';
import { siteDef } from '@/features/body/sites';
import { computeTargets } from '@/features/food/targets';
import { VolumeList } from '@/features/program/VolumeList';
import { STATUS_LABEL, STATUS_TONE } from '@/features/session/status';
import { addDays, daysBetweenISO, fmtDayLabel, todayISO, weekStartISO } from '@/lib/date';
import { kgNum, ml, signed } from '@/lib/format';
import { hydrationTarget } from '@/services/hydration';
import { color, font, hit, space } from '@/theme/tokens';

/** Suggestions shown before the "All N" toggle. */
const SHOWN_RECS = 3;
/** Lifts shown before "View all" — which used to not exist at all (UX-09). */
const SHOWN_LIFTS = 8;

const volume = (kgTotal: number) => (kgTotal >= 1000 ? `${(kgTotal / 1000).toFixed(1)}k` : String(Math.round(kgTotal)));
const change = (now: number, before: number) => (before > 0 ? `${signed(((now - before) / before) * 100, 0)}% vs last wk` : undefined);

/** Is it working? One week at a glance, with suggestions you approve — never automatic. */
export default function ProgressScreen() {
  const settings = useSettings();
  const today = todayISO();
  const thisWeek = weekStartISO(today);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const isThisWeek = weekStart === thisWeek;

  const data = useLive(
    () => {
      const target = hydrationTarget().ml;
      return { week: weekSummary(weekStart, target), prev: weekSummary(addDays(weekStart, -7), target), muscles: weeklySetsPerMuscle(weekStart) };
    },
    ['session', 'set_log', 'exercise_session_stat', 'exercise', 'weigh_in', 'measurement', 'water_log', 'routine', 'setting'],
    [weekStart],
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
  const empty = done + week.cancelled === 0 && week.skipped === 0;

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

  return (
    <Screen
      title="Progress"
      subtitle={isThisWeek ? 'This week' : `Week of ${fmtDayLabel(weekStart)}`}
      tab
      right={
        <View style={styles.nav}>
          <IconButton icon="chevronLeft" accessibilityLabel="Previous week" onPress={() => setWeekStart(addDays(weekStart, -7))} />
          <IconButton icon="chevronRight" accessibilityLabel="Next week" disabled={isThisWeek} onPress={() => setWeekStart(addDays(weekStart, 7))} />
        </View>
      }
    >
      {/* Concise totals first: the week is the question this screen answers. */}
      <View style={styles.tiles}>
        <StatTile
          label="Workouts"
          value={week.plannedDays ? `${done} / ${week.plannedDays}` : String(done)}
          tone={week.plannedDays && done >= week.plannedDays ? 'positive' : 'default'}
        />
        <StatTile label="Minutes" value={String(week.minutes)} tone="muted" />
        <StatTile label="Volume, kg" value={volume(week.tonnage)} tone="muted" hint={change(week.tonnage, prev.tonnage)} />
      </View>
      {empty ? (
        <Text style={styles.note}>{isThisWeek ? 'Nothing logged yet. Start a workout and these fill in.' : 'Nothing logged this week.'}</Text>
      ) : (
        <Text style={styles.note}>
          {week.sets} sets · {week.exercises} different exercises
          {week.skipped ? ` · ${week.skipped} skipped` : ''}
          {week.cancelled ? ` · ${week.cancelled} cancelled` : ''}
        </Text>
      )}

      {/*
        Always here, whether or not this particular week has anything in it. It
        used to render only when recent workouts existed and sat at the very
        bottom, which is the one place you would not look for "find a workout".
      */}
      <ListCard style={styles.gap}>
        <ListRow
          left={<Icon name="calendar" size={20} color={color.accent} />}
          title="Workout history"
          sub="Search every workout you have logged, and correct one."
          onPress={() => router.push('/history')}
        />
      </ListCard>

      {insights.length ? (
        <Card>
          {insights.map((t) => (
            <View key={t} style={styles.insight}>
              <View style={styles.insightDot} />
              <Text style={[styles.insightText, styles.flex1]}>{t}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {/*
        Deloading is something you do now, so its controls only exist on the
        current week. Browsing March and being offered "Start deload week" was an
        action about today filed under a date three months ago (UX-09).
      */}
      {!isThisWeek ? null : deloadRunning && deloadSince ? (
        <Card tone="positive">
          <Text style={styles.cardTitle}>Deload week in progress</Text>
          <Text style={styles.muted}>Half the sets, a bit lighter. Normal targets return {fmtDayLabel(addDays(deloadSince, 7))}.</Text>
          {/* Reversible, so it happens at once with an Undo rather than behind an
              "are you sure?" — confirm() is for destroying data (AGENTS §1.4). */}
          <PrimaryButton
            label="End deload now"
            tone="neutral"
            style={styles.gap}
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
        <Card tone="warning">
          <Text style={styles.cardTitle}>A lighter week might help</Text>
          {deload.reasons.map((r) => (
            <Text key={r} style={styles.body}>
              • {r}
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
            title="Suggestions"
            action={recs.length > SHOWN_RECS ? { label: allRecs ? 'Show fewer' : `All ${recs.length}`, onPress: () => setAllRecs(!allRecs) } : undefined}
          />
          {(allRecs ? recs : recs.slice(0, SHOWN_RECS)).map((r) => (
            <Card key={r.id} tone={r.kind === 'keep_going' ? 'positive' : 'default'}>
              <View style={styles.recHead}>
                <Icon name={r.kind === 'keep_going' ? 'check' : 'spark'} size={18} color={r.kind === 'keep_going' ? color.positive : color.accent} />
                <Text style={styles.recTitle}>{r.title}</Text>
              </View>
              <Text style={styles.muted}>{r.reason}</Text>
              <View style={styles.row}>
                {r.change ? <PrimaryButton label="Apply" style={styles.flex1} onPress={() => apply(r)} /> : null}
                {r.kind === 'replace_exercise' ? <PrimaryButton label="Open plan" tone="neutral" style={styles.flex1} onPress={() => openSlot(r.slotId)} /> : null}
                {r.kind === 'fewer_days' ? <PrimaryButton label="See plans" tone="neutral" style={styles.flex1} onPress={() => router.push('/program')} /> : null}
                <PrimaryButton label={r.kind === 'keep_going' ? 'Got it' : 'Dismiss'} tone="neutral" onPress={() => dismiss(r)} />
              </View>
            </Card>
          ))}
        </>
      ) : null}

      {week.lifts.length ? (
        <>
          <SectionHeader
            title="Lifts"
            hint={isThisWeek ? undefined : `Week of ${fmtDayLabel(weekStart)}`}
            action={week.lifts.length > SHOWN_LIFTS ? { label: allLifts ? 'Show fewer' : `View all ${week.lifts.length}`, onPress: () => setAllLifts(!allLifts) } : undefined}
          />
          <ListCard>
            {(allLifts ? week.lifts : week.lifts.slice(0, SHOWN_LIFTS)).map((l, i) => {
              const d = l.prevBestE1rm === null ? null : l.bestE1rm - l.prevBestE1rm;
              const w = l.prevTopWeight === null ? null : l.topWeight - l.prevTopWeight;
              const delta = w === null ? 'new' : w !== 0 ? `${signed(w)} kg` : d !== null && d > 0.05 ? 'more reps' : '=';
              return (
                <ListRow
                  key={l.exerciseId}
                  divider={i > 0}
                  title={l.name}
                  chevron={false}
                  accessibilityLabel={`${l.name}: top set ${kgNum(l.topWeight)} kg, ${delta}. Opens its progress.`}
                  /*
                   * Straight to the exercise's own progress, which owns the full
                   * e1RM chart and every session of it. Progress used to draw a
                   * second chart of its own underneath this list (UX-09).
                   */
                  onPress={() => router.push(`/exercise/${l.exerciseId}?tab=progress`)}
                  right={
                    <>
                      <Text style={styles.value}>{kgNum(l.topWeight)} kg</Text>
                      <Text style={[styles.delta, { color: d !== null && d > 0.05 ? color.positive : color.textFaint }]}>{delta}</Text>
                    </>
                  }
                />
              );
            })}
          </ListCard>
        </>
      ) : null}

      {/* Detail, collapsed. Open it when you want it; it is not the headline. */}
      <SectionHeader title="Body & water" action={{ label: showBody ? 'Hide' : 'Show', onPress: () => setShowBody(!showBody), accessibilityLabel: `${showBody ? 'Hide' : 'Show'} body and water` }} />
      {showBody ? (
        <Card style={styles.list}>
          <Row label="Bodyweight trend" value={bw === null ? '—' : `${signed(bw, 1)} kg`} />
          {week.measurements.map((m) => {
            const def = siteDef(m.site);
            return <Row key={m.site} label={def.label} value={`${kgNum(m.value)} ${def.unit}${m.prev !== null ? `  (${signed(m.value - m.prev)})` : ''}`} />;
          })}
          <Row label="Water target hit" value={week.water.days ? `${week.water.daysHit} / ${week.water.days} days` : '—'} />
          {week.water.daysLogged ? <Row label="Average water" value={ml(week.water.avgMl)} /> : null}
        </Card>
      ) : null}

      <SectionHeader title="Sets per muscle" action={{ label: showMuscles ? 'Hide' : 'Show', onPress: () => setShowMuscles(!showMuscles), accessibilityLabel: `${showMuscles ? 'Hide' : 'Show'} sets per muscle` }} />
      {showMuscles ? <VolumeList weekly={data.muscles} /> : null}

      {workouts.length ? (
        <>
          <SectionHeader title="Recent workouts" action={{ label: 'See all', onPress: () => router.push('/history'), accessibilityLabel: 'See all workout history' }} />
          <ListCard>
            {workouts.map((w, i) => (
              <ListRow
                key={w.session.id}
                divider={i > 0}
                title={w.dayLabel ?? 'Workout'}
                sub={`${fmtDayLabel(w.session.date)}${w.sets ? ` · ${w.sets} sets` : ''}`}
                right={<Pill label={STATUS_LABEL[w.session.status]} tone={STATUS_TONE[w.session.status]} />}
                onPress={() => router.push(`/session/summary/${w.session.id}`)}
              />
            ))}
          </ListCard>
        </>
      ) : null}
    </Screen>
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
  gap: { marginTop: space.md },
  nav: { flexDirection: 'row' },
  tiles: { flexDirection: 'row', gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  cardTitle: { ...font.heading, color: color.text, marginBottom: space.sm },
  recHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recTitle: { ...font.label, color: color.text, fontWeight: '700', flex: 1 },
  body: { ...font.body, color: color.text },
  muted: { ...font.caption, fontSize: 14, lineHeight: 20, color: color.textMuted, marginTop: space.xs },
  caption: { ...font.caption, color: color.textMuted, marginTop: 2 },
  note: { ...font.caption, fontSize: 12, color: color.textFaint, marginTop: space.sm },
  accent: { color: color.accent },
  list: { paddingVertical: 0 },
  liftRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hit.gym },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  value: { ...font.label, fontSize: 14, ...font.numeric, color: color.text, fontWeight: '700' },
  delta: { ...font.caption, fontWeight: '600', ...font.numeric, minWidth: 68, textAlign: 'right' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: hit.default, gap: space.md },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: hit.default },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  insight: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', paddingVertical: space.xs },
  insightDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent, marginTop: 7 },
  insightText: { ...font.label, fontSize: 14, fontWeight: '400', color: color.text },
});
