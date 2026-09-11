import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, Icon, IconButton, Pill, PrimaryButton, Screen, SectionHeader, StatTile, toast, TrendChart } from '@/components';
import { useLive } from '@/db/live';
import { getSlot, updateSlot } from '@/db/repositories/program';
import { activeRecommendations, dismissRecommendation, recentWorkouts, undismissRecommendation, weekInsights, weekSummary } from '@/db/repositories/progress';
import { getRaw, setRaw, setSetting, useSettings } from '@/db/repositories/settings';
import { buildDeloadInput, e1rmSeries, weeklySetsPerMuscle } from '@/db/repositories/stats';
import { shouldDeload } from '@/engine/progression';
import type { Recommendation } from '@/engine/recommend';
import { siteDef } from '@/features/body/sites';
import { VolumeList } from '@/features/program/VolumeList';
import { STATUS_LABEL, STATUS_TONE } from '@/features/session/status';
import { addDays, daysBetweenISO, fmtDayLabel, todayISO, weekStartISO } from '@/lib/date';
import { kgNum, ml, signed } from '@/lib/format';
import { hydrationTarget } from '@/services/hydration';
import { color, font, hit, space } from '@/theme/tokens';

const volume = (kgTotal: number) => (kgTotal >= 1000 ? `${(kgTotal / 1000).toFixed(1)}k kg` : `${Math.round(kgTotal)} kg`);
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
    ['session', 'set_log', 'exercise_session_stat', 'weigh_in', 'measurement', 'water_log', 'routine', 'setting'],
    [weekStart],
  );
  const recs = useLive(
    () => (isThisWeek ? activeRecommendations() : []),
    ['routine', 'routine_slot', 'session', 'session_exercise', 'exercise_session_stat', 'setting'],
    [isThisWeek],
  );
  const deload = useLive(() => shouldDeload(buildDeloadInput()), ['exercise_session_stat', 'session', 'setting']);
  const insights = useLive(
    () => weekInsights(weekStart, hydrationTarget().ml),
    ['session', 'set_log', 'exercise_session_stat', 'weigh_in', 'water_log', 'setting'],
    [weekStart],
  );
  const workouts = useLive(() => recentWorkouts(8), ['session', 'set_log']);

  const dismissKey = `review:deloadDismissed:${weekStart}`;
  const deloadDismissed = useLive(() => getRaw(dismissKey) === 'true', ['setting'], [dismissKey]);
  const deloadSince = settings.lastDeloadDate;
  const deloadRunning = deloadSince !== null && daysBetweenISO(deloadSince, today) < 7;

  const [selected, setSelected] = useState<string | null>(null);
  const [showMuscles, setShowMuscles] = useState(false);
  const { week, prev } = data;
  const sel = week.lifts.some((l) => l.exerciseId === selected) ? selected : (week.lifts[0]?.exerciseId ?? null);
  const series = useLive(() => (sel ? e1rmSeries(sel, 30) : []), ['exercise_session_stat'], [sel]);
  const raw = series.map((p, i) => ({ x: i, y: p.e1rm }));
  const trend = raw.map((p, i) => {
    const w = raw.slice(Math.max(0, i - 2), i + 1);
    return { x: p.x, y: w.reduce((a, b) => a + b.y, 0) / w.length };
  });

  const done = week.completed + week.partial;
  const bw = week.bodyweight.start !== null && week.bodyweight.end !== null ? week.bodyweight.end - week.bodyweight.start : null;
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
      right={
        <View style={styles.nav}>
          <IconButton icon="chevronLeft" accessibilityLabel="Previous week" onPress={() => setWeekStart(addDays(weekStart, -7))} />
          <IconButton icon="chevronRight" accessibilityLabel="Next week" disabled={isThisWeek} onPress={() => setWeekStart(addDays(weekStart, 7))} />
        </View>
      }
    >
      {insights.length ? (
        <Card>
          {insights.map((t) => (
            <View key={t} style={styles.insight}>
              <View style={styles.insightDot} />
              <Text style={[styles.body, styles.flex1]}>{t}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {deloadRunning && deloadSince ? (
        <Card tone="positive">
          <Text style={styles.cardTitle}>Deload week in progress</Text>
          <Text style={styles.muted}>Half the sets, a bit lighter. Normal targets return {fmtDayLabel(addDays(deloadSince, 7))}.</Text>
        </Card>
      ) : deload.deload && !deloadDismissed && isThisWeek ? (
        <Card tone="warning">
          <Text style={styles.cardTitle}>A lighter week might help</Text>
          {deload.reasons.map((r) => (
            <Text key={r} style={styles.body}>
              • {r}
            </Text>
          ))}
          <View style={styles.row}>
            <PrimaryButton label="Start deload week" style={styles.flex1} onPress={() => setSetting('lastDeloadDate', today)} />
            <PrimaryButton label="Not now" tone="neutral" onPress={() => setRaw(dismissKey, 'true')} />
          </View>
        </Card>
      ) : null}

      {recs.length ? (
        <>
          <SectionHeader title="Suggestions" />
          {recs.map((r) => (
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
                <PrimaryButton label={r.kind === 'keep_going' ? 'Got it' : 'Dismiss'} tone="ghost" onPress={() => dismiss(r)} />
              </View>
            </Card>
          ))}
        </>
      ) : null}

      <SectionHeader title="Consistency" />
      <View style={styles.tiles}>
        <StatTile label="Workouts" value={week.plannedDays ? `${done} / ${week.plannedDays}` : String(done)} tone={week.plannedDays && done >= week.plannedDays ? 'positive' : 'default'} />
        <StatTile label="Skipped" value={String(week.skipped)} tone="muted" hint={week.cancelled ? `${week.cancelled} cancelled` : undefined} />
        <StatTile label="Time" value={`${week.minutes} min`} tone="muted" />
      </View>

      {empty ? (
        <EmptyState message={isThisWeek ? 'No workouts yet this week. Your numbers will show up here.' : 'No workouts this week.'} />
      ) : (
        <>
          <SectionHeader title="Training" />
          <View style={styles.tiles}>
            <StatTile label="Sets" value={String(week.sets)} hint={change(week.sets, prev.sets)} />
            <StatTile label="Reps" value={String(week.reps)} hint={change(week.reps, prev.reps)} />
            <StatTile label="Volume" value={volume(week.tonnage)} hint={change(week.tonnage, prev.tonnage)} />
          </View>
          <Text style={styles.note}>{week.exercises} different exercises.</Text>

          {week.lifts.length ? (
            <>
              <SectionHeader title="Lifts" />
              <Card style={styles.list}>
                {week.lifts.slice(0, 8).map((l, i) => {
                  const d = l.prevBestE1rm === null ? null : l.bestE1rm - l.prevBestE1rm;
                  const w = l.prevTopWeight === null ? null : l.topWeight - l.prevTopWeight;
                  return (
                    <Pressable key={l.exerciseId} style={[styles.liftRow, i > 0 && styles.divider]} onPress={() => setSelected(l.exerciseId)}>
                      <Text style={[styles.body, styles.flex1, l.exerciseId === sel && styles.accent]} numberOfLines={1}>
                        {l.name}
                      </Text>
                      <Text style={styles.value}>{kgNum(l.topWeight)} kg</Text>
                      <Text style={[styles.delta, { color: d !== null && d > 0.05 ? color.positive : color.textMuted }]}>
                        {w === null ? 'new' : w !== 0 ? `${signed(w)} kg` : d !== null && d > 0.05 ? 'more reps' : '='}
                      </Text>
                    </Pressable>
                  );
                })}
              </Card>
              {sel && raw.length > 1 ? (
                <Card>
                  <Text style={styles.caption}>{week.lifts.find((l) => l.exerciseId === sel)?.name} · estimated 1-rep max</Text>
                  <TrendChart trend={trend} raw={raw} height={140} format={(y) => `${kgNum(Math.round(y * 10) / 10)} kg`} />
                </Card>
              ) : null}
            </>
          ) : null}
        </>
      )}

      <SectionHeader title="Body & water" />
      <Card style={styles.list}>
        <Row label="Bodyweight trend" value={bw === null ? '—' : `${signed(bw, 1)} kg`} />
        {week.measurements.map((m) => {
          const def = siteDef(m.site);
          return <Row key={m.site} label={def.label} value={`${kgNum(m.value)} ${def.unit}${m.prev !== null ? `  (${signed(m.value - m.prev)})` : ''}`} />;
        })}
        <Row label="Water target hit" value={week.water.days ? `${week.water.daysHit} / ${week.water.days} days` : '—'} />
        {week.water.daysLogged ? <Row label="Average water" value={ml(week.water.avgMl)} /> : null}
      </Card>

      <Pressable style={styles.toggle} onPress={() => setShowMuscles(!showMuscles)} accessibilityRole="button">
        <SectionHeader title="Sets per muscle" />
        <Icon name={showMuscles ? 'chevronUp' : 'chevronDown'} size={18} color={color.textMuted} />
      </Pressable>
      {showMuscles ? <VolumeList weekly={data.muscles} /> : null}

      {workouts.length ? (
        <>
          <SectionHeader title="Recent workouts" />
          <Card style={styles.list}>
            {workouts.map((w, i) => (
              <Pressable key={w.session.id} style={[styles.liftRow, i > 0 && styles.divider]} onPress={() => router.push(`/session/summary/${w.session.id}`)}>
                <View style={styles.flex1}>
                  <Text style={styles.body} numberOfLines={1}>
                    {w.dayLabel ?? 'Workout'}
                  </Text>
                  <Text style={styles.caption}>
                    {fmtDayLabel(w.session.date)}
                    {w.sets ? ` · ${w.sets} sets` : ''}
                  </Text>
                </View>
                <Pill label={STATUS_LABEL[w.session.status]} tone={STATUS_TONE[w.session.status]} />
              </Pressable>
            ))}
          </Card>
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
  nav: { flexDirection: 'row' },
  tiles: { flexDirection: 'row', gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  cardTitle: { ...font.heading, color: color.text, marginBottom: space.sm },
  recHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recTitle: { ...font.body, color: color.text, fontWeight: '700', flex: 1 },
  body: { ...font.body, color: color.text },
  muted: { ...font.label, color: color.textMuted, marginTop: space.xs },
  caption: { ...font.caption, color: color.textMuted, marginTop: 2 },
  note: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  accent: { color: color.accent },
  list: { paddingVertical: 0 },
  liftRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hit.gym },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  value: { ...font.body, ...font.numeric, color: color.text, fontWeight: '600' },
  delta: { ...font.label, ...font.numeric, minWidth: 64, textAlign: 'right' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: hit.default, gap: space.md },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  insight: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', paddingVertical: space.xs },
  insightDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent, marginTop: 8 },
});
