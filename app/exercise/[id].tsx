import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipRow, EmptyState, Icon, ListCard, ListRow, PrimaryButton, Screen, SectionHeader, SegmentTabs, toast, TrendChart } from '@/components';
import { CATALOG_BY_ID, EQUIPMENT_LABEL, type Equipment } from '@/data/catalog';
import { useLive } from '@/db/live';
import { getExercise } from '@/db/repositories/exercises';
import { exerciseSessions } from '@/db/repositories/sessions';
import { setSetting, useSettings } from '@/db/repositories/settings';
import { e1rmSeries } from '@/db/repositories/stats';
import { ExerciseGuide, guideMeta } from '@/features/exercises/ExerciseGuide';
import { fmtSet, fmtSetList } from '@/features/session/prescription';
import { addDays, fmtDayLabel, todayISO } from '@/lib/date';
import { kgNum } from '@/lib/format';
import { color, font, space } from '@/theme/tokens';

const TABS = [
  { label: 'Progress', value: 'progress' as const },
  { label: 'How-to', value: 'how' as const },
];
const RANGES = [
  { label: '4 W', value: 28 },
  { label: '12 W', value: 84 },
  { label: '6 M', value: 182 },
  { label: 'All', value: 0 },
];

/**
 * One exercise: how you are doing with it, and how to do it.
 *
 * Progress opens it on the first (the ExProgress board); the library and the
 * how-to sheet open it on the second. Either way it is one screen with one
 * "Don't suggest this", not two pages about the same lift.
 */
export default function ExerciseScreen() {
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const id = String(params.id);
  const settings = useSettings();
  const exercise = useLive(() => getExercise(id), ['exercise'], [id]);
  const data = useLive(() => ({ series: e1rmSeries(id, 1000), sessions: exerciseSessions(id) }), ['exercise_session_stat', 'set_log', 'session'], [id]);
  const [tab, setTab] = useState<'progress' | 'how'>(params.tab === 'progress' ? 'progress' : 'how');
  const [range, setRange] = useState(84);

  const today = todayISO();
  const shown = useMemo(() => (range ? data.series.filter((p) => p.date >= addDays(today, -range)) : data.series), [data.series, range, today]);

  if (!exercise) {
    return (
      <Screen title="Exercise" back>
        <EmptyState message="This exercise isn't in your library." actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const measure = CATALOG_BY_ID.get(id)?.measure ?? 'reps';
  const last = data.sessions[0];
  const disliked = settings.disliked.includes(id);
  const toggleDislike = () => {
    const next = disliked ? settings.disliked.filter((x) => x !== id) : [...settings.disliked, id];
    setSetting('disliked', next);
    toast(disliked ? `${exercise.name} can be suggested again` : `${exercise.name} won't be suggested`, {
      label: 'Undo',
      onPress: () => setSetting('disliked', settings.disliked),
    });
  };
  const equipment = EQUIPMENT_LABEL[exercise.loadType as Equipment] ?? exercise.loadType;

  return (
    <Screen
      title={exercise.name}
      subtitle={tab === 'progress' && last ? `${equipment} · last done ${fmtDayLabel(last.date)}` : guideMeta(exercise)}
      back
      strip={<SegmentTabs options={TABS} value={tab} onChange={setTab} />}
      dock={
        <View style={styles.pair}>
          <PrimaryButton
            label={disliked ? 'Suggest this again' : 'Don’t suggest this'}
            tone="neutral"
            icon={<Icon name={disliked ? 'undo' : 'eyeOff'} size={18} />}
            style={styles.flex1}
            onPress={toggleDislike}
          />
          <PrimaryButton label="Done" style={styles.flex1} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </View>
      }
    >
      {tab === 'how' ? (
        <>
          <ExerciseGuide exercise={exercise} />
          <Text style={styles.footnote}>{"Hidden exercises are left out of swaps and new plans. Plans you already have don't change."}</Text>
        </>
      ) : !last ? (
        <EmptyState message="Not logged yet." hint="Your first session of it starts the history here." />
      ) : (
        <ProgressView measure={measure} loadType={exercise.loadType} series={shown} range={range} onRange={setRange} sessions={data.sessions} />
      )}
    </Screen>
  );
}

function ProgressView({
  measure,
  loadType,
  series,
  range,
  onRange,
  sessions,
}: {
  measure: 'reps' | 'time';
  loadType: string;
  series: { date: string; e1rm: number }[];
  range: number;
  onRange: (v: number) => void;
  sessions: ReturnType<typeof exerciseSessions>;
}) {
  const latest = series[series.length - 1];
  const first = series[0];
  const gain = latest && first && series.length > 1 ? latest.e1rm - first.e1rm : null;
  const span = RANGES.find((r) => r.value === range)?.label.replace(' W', ' weeks').replace(' M', ' months') ?? '';
  // Raw per-session estimates plus a 3-session average, same smoothing as the body trend.
  const raw = series.map((p, i) => ({ x: i, y: p.e1rm }));
  const trend = raw.map((p, i) => {
    const w = raw.slice(Math.max(0, i - 2), i + 1);
    return { x: p.x, y: w.reduce((a, b) => a + b.y, 0) / w.length };
  });

  // Personal bests, from sets you actually lifted.
  const all = sessions.flatMap((s) => s.sets.map((set) => ({ set, date: s.date })));
  const heaviest = all.reduce<(typeof all)[number] | undefined>((b, x) => (!b || x.set.weight > b.set.weight || (x.set.weight === b.set.weight && x.set.reps > b.set.reps) ? x : b), undefined);
  const volumeOf = (s: (typeof sessions)[number]) => s.sets.reduce((t, x) => t + x.weight * x.reps, 0);
  const bestVolume = sessions.reduce<(typeof sessions)[number] | undefined>((b, s) => (!b || volumeOf(s) > volumeOf(b) ? s : b), undefined);
  const workWeight = sessions[0]?.sets.reduce((m, x) => Math.max(m, x.weight), 0) ?? 0;
  const atWeight = all.filter((x) => x.set.weight === workWeight).reduce<(typeof all)[number] | undefined>((b, x) => (!b || x.set.reps > b.set.reps ? x : b), undefined);
  const weighted = measure === 'reps' && (heaviest?.set.weight ?? 0) > 0;

  return (
    <>
      {measure === 'reps' ? (
        <>
          <ChipRow options={RANGES} value={range} onChange={onRange} columns={4} />
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>Estimated 1-rep max</Text>
            <View style={styles.heroRow}>
              <Text style={styles.big}>{latest ? kgNum(Math.round(latest.e1rm)) : '—'}</Text>
              <Text style={styles.unit}>kg</Text>
            </View>
            {gain !== null ? (
              <Text style={[styles.gain, { color: gain > 0.5 ? color.positive : color.textMuted }]}>
                {Math.abs(gain) < 0.5 ? 'Level' : `${gain > 0 ? '+' : '−'}${kgNum(Math.round(Math.abs(gain)))} kg`} {range ? `in ${span}` : 'since you started'}
              </Text>
            ) : null}
          </View>
          {raw.length >= 3 ? (
            <TrendChart
              trend={trend}
              raw={raw}
              height={160}
              format={(y) => `${kgNum(Math.round(y * 10) / 10)} kg`}
              formatX={(x) => fmtDayLabel(series[Math.max(0, Math.min(series.length - 1, Math.round(x)))]?.date ?? '')}
            />
          ) : (
            <Text style={styles.footnote}>Three sessions in this range and the line appears.</Text>
          )}
        </>
      ) : null}

      {weighted && heaviest ? (
        <>
          <SectionHeader title="Personal bests" />
          <ListCard>
            <ListRow title="Heaviest set" sub={fmtDayLabel(heaviest.date)} right={<Text style={styles.value}>{fmtSet(measure, heaviest.set.weight, heaviest.set.reps, loadType)}</Text>} />
            {bestVolume ? (
              <ListRow
                divider
                title="Best volume"
                sub={`${fmtDayLabel(bestVolume.date)} · ${bestVolume.sets.length} ${bestVolume.sets.length === 1 ? 'set' : 'sets'}`}
                right={<Text style={styles.value}>{Math.round(volumeOf(bestVolume)).toLocaleString()} kg</Text>}
              />
            ) : null}
            {atWeight ? (
              <ListRow divider title={`Most reps at ${kgNum(workWeight)} kg`} sub={fmtDayLabel(atWeight.date)} right={<Text style={styles.value}>{atWeight.set.reps} reps</Text>} />
            ) : null}
          </ListCard>
        </>
      ) : null}

      <SectionHeader title="Recent sessions" />
      <ListCard>
        {sessions.slice(0, 6).map((s, i) => (
          <ListRow
            key={s.sessionId}
            divider={i > 0}
            title={fmtDayLabel(s.date)}
            sub={`${s.sets.length} ${s.sets.length === 1 ? 'set' : 'sets'}`}
            right={<Text style={styles.value}>{fmtSetList(s.sets, measure, loadType)}</Text>}
            onPress={() => router.push(`/session/summary/${s.sessionId}`)}
            chevron={false}
          />
        ))}
      </ListCard>
      {measure === 'reps' ? <Text style={styles.footnote}>The estimate comes from your best set each session.</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  pair: { flexDirection: 'row', gap: space.sm },
  hero: { marginTop: space.lg, marginBottom: space.md },
  eyebrow: { ...font.eyebrow, color: color.textFaint },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  big: { ...font.hero, fontSize: 64, lineHeight: 70, ...font.numeric, color: color.text },
  unit: { ...font.heading, fontWeight: '700', color: color.textMuted },
  gain: { ...font.label, fontSize: 14, fontWeight: '600' },
  value: { ...font.label, fontSize: 15, fontWeight: '700', ...font.numeric, color: color.text, flexShrink: 1, textAlign: 'right' },
  footnote: { ...font.caption, fontSize: 12, color: color.textFaint, marginTop: space.sm },
});
