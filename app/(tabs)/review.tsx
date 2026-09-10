import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, PrimaryButton, Screen, SectionHeader, StatTile, TrendChart } from '@/components';
import { useLive } from '@/db/live';
import { getRaw, setRaw, setSetting, useSettings } from '@/db/repositories/settings';
import { e1rmSeries, weeklyReview, type LiftTrend } from '@/db/repositories/stats';
import { VolumeList } from '@/features/program/VolumeList';
import { addDays, daysBetweenISO, fmtDayLabel, todayISO, weekStartISO } from '@/lib/date';
import { kgNum, signed } from '@/lib/format';
import { color, font, hit, space } from '@/theme/tokens';

/** Readable in thirty seconds. Missed days are neutral; a deload is a proposal, never automatic. */
export default function ReviewScreen() {
  const settings = useSettings();
  const today = todayISO();
  const thisWeek = weekStartISO(today);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const review = useLive(
    () => weeklyReview(weekStart),
    ['exercise_session_stat', 'session', 'weigh_in', 'meal_log', 'setting'],
    [weekStart],
  );

  const dismissKey = `review:deloadDismissed:${weekStart}`;
  const dismissed = useLive(() => getRaw(dismissKey) === 'true', ['setting'], [dismissKey]);
  const deloadSince = settings.lastDeloadDate;
  const deloadRunning = deloadSince !== null && daysBetweenISO(deloadSince, today) < 7;

  const lifts = [...review.progressed, ...review.stalled];
  const [selected, setSelected] = useState<string | null>(null);
  const sel = lifts.some((l) => l.exerciseId === selected) ? selected : (lifts[0]?.exerciseId ?? null);
  const series = useLive(() => (sel ? e1rmSeries(sel, 40) : []), ['exercise_session_stat'], [sel]);
  const raw = series.map((p, i) => ({ x: i, y: p.e1rm }));
  // Three-session moving average: the line to read. Each session's e1RM stays as a faint dot.
  const trend = raw.map((p, i) => {
    const w = raw.slice(Math.max(0, i - 2), i + 1);
    return { x: p.x, y: w.reduce((a, b) => a + b.y, 0) / w.length };
  });
  const stalledSel = review.stalled.some((s) => s.exerciseId === sel);
  const markers = stalledSel ? raw.slice(-3) : [];
  const selName = lifts.find((l) => l.exerciseId === sel)?.name;

  const weekly = Object.fromEntries(review.volume.map((v) => [v.muscle, v.sets]));
  const rateText =
    review.bodyweight.trendKg !== null && review.bodyweight.check
      ? `${signed((review.bodyweight.rateKgPerWeek / review.bodyweight.trendKg) * 100, 2)}%/wk`
      : '—';

  const liftRow = (l: LiftTrend) => (
    <Pressable key={l.exerciseId} onPress={() => setSelected(l.exerciseId)} style={styles.liftRow}>
      <Text style={[styles.body, l.exerciseId === sel && styles.accent]} numberOfLines={1}>
        {l.name}
      </Text>
      <Text style={styles.num}>
        e1RM {kgNum(Math.round(l.e1rm * 10) / 10)} · {signed(l.trend)}/session
      </Text>
    </Pressable>
  );

  return (
    <Screen
      title="Review"
      subtitle={`Week of ${fmtDayLabel(weekStart)}`}
      right={
        <View style={styles.nav}>
          <PrimaryButton label="‹" tone="ghost" onPress={() => setWeekStart(addDays(weekStart, -7))} />
          <PrimaryButton label="›" tone="ghost" disabled={weekStart >= thisWeek} onPress={() => setWeekStart(addDays(weekStart, 7))} />
        </View>
      }
    >
      {deloadRunning && deloadSince ? (
        <Card tone="positive">
          <Text style={styles.title}>Deload week in progress</Text>
          <Text style={styles.muted}>
            Since {fmtDayLabel(deloadSince)}: half the sets, 10% lighter, stop well short of failure. Normal prescriptions return on{' '}
            {fmtDayLabel(addDays(deloadSince, 7))}.
          </Text>
        </Card>
      ) : review.deload.deload && !dismissed && weekStart === thisWeek ? (
        <Card tone="warning">
          <Text style={styles.title}>A deload week might help</Text>
          {review.deload.reasons.map((r) => (
            <Text key={r} style={styles.body}>
              • {r}
            </Text>
          ))}
          <Text style={styles.muted}>Proposal: half the sets, 10% lighter, RIR +2, for one week. Your call.</Text>
          <View style={styles.row}>
            <PrimaryButton label="Start deload week" style={styles.flex} onPress={() => setSetting('lastDeloadDate', today)} />
            <PrimaryButton label="Not this week" tone="neutral" onPress={() => setRaw(dismissKey, 'true')} />
          </View>
        </Card>
      ) : null}

      <View style={styles.tiles}>
        <StatTile label="Workouts" value={String(review.sessionsLogged)} />
        <StatTile label="Bodyweight" value={rateText} hint={review.bodyweight.trendKg !== null ? `${kgNum(review.bodyweight.trendKg)} kg trend` : undefined} />
      </View>
      <View style={[styles.tiles, styles.gapSm]}>
        <StatTile label="Avg protein" value={review.nutrition.avgProtein === null ? '—' : `${Math.round(review.nutrition.avgProtein)} g`} tone="accent" />
        <StatTile label="Food logged" value={`${review.nutrition.daysLogged} days`} tone="muted" />
      </View>
      {review.bodyweight.check ? <Text style={styles.note}>{review.bodyweight.check.message}</Text> : null}

      {lifts.length === 0 ? (
        <EmptyState message="Log a couple of sessions per lift and progress shows up here." />
      ) : (
        <>
          {review.progressed.length ? <SectionHeader title="Progressing" /> : null}
          {review.progressed.map(liftRow)}
          {review.stalled.length ? <SectionHeader title="Flat" /> : null}
          {review.stalled.map(liftRow)}

          {sel && raw.length ? (
            <Card>
              <Text style={styles.body}>{selName} · e1RM</Text>
              <TrendChart trend={trend} raw={raw} markers={markers} format={(y) => `${kgNum(Math.round(y * 10) / 10)} kg`} />
              {stalledSel ? <Text style={styles.muted}>Circled: the sessions where it went flat.</Text> : null}
            </Card>
          ) : null}
        </>
      )}

      {review.plateaus.length ? <SectionHeader title="Plateau notes" /> : null}
      {review.plateaus.map((p) => (
        <Card key={p.exerciseId}>
          <Text style={styles.body}>{p.note}</Text>
        </Card>
      ))}

      <SectionHeader title="Hard sets this week" />
      <VolumeList weekly={weekly} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', gap: space.xs },
  tiles: { flexDirection: 'row', gap: space.sm },
  gapSm: { marginTop: space.sm },
  row: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  flex: { flex: 1 },
  title: { ...font.heading, color: color.text, marginBottom: space.sm },
  body: { ...font.body, color: color.text },
  accent: { color: color.accent },
  num: { ...font.caption, ...font.numeric, color: color.textMuted },
  muted: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  note: { ...font.label, color: color.textMuted, marginTop: space.md },
  liftRow: { minHeight: hit.default, justifyContent: 'center', paddingVertical: space.xs },
});
