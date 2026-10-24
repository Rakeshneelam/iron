import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, Icon, ListCard, ListRow, MiniBars, PrimaryButton, Screen, SectionHeader, SegmentTabs, TitleBlock, toast, TrendChart } from '@/components';
import { CATALOG_BY_ID, EQUIPMENT_LABEL, type Equipment } from '@/data/catalog';
import { useLive } from '@/db/live';
import { getExercise } from '@/db/repositories/exercises';
import { exerciseSessions } from '@/db/repositories/sessions';
import { setSetting, useSettings } from '@/db/repositories/settings';
import { e1rmSeries } from '@/db/repositories/stats';
import { ExerciseGuide, guideMeta } from '@/features/exercises/ExerciseGuide';
import { fmtSet, fmtSetList } from '@/features/session/prescription';
import { fmtDayLabel } from '@/lib/date';
import { kgNum } from '@/lib/format';
import { color, font, radius, space } from '@/theme/tokens';

const TABS = [
  { label: 'Record', value: 'progress' as const },
  { label: 'How-to', value: 'how' as const },
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
      subtitle={tab === 'progress' && last ? `${equipment}, last done ${fmtDayLabel(last.date)}` : guideMeta(exercise)}
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
        <EmptyState message="Not logged yet." hint="Your first set of it starts its record here — every session after adds a column." />
      ) : (
        <ProgressView measure={measure} loadType={exercise.loadType} series={data.series} sessions={data.sessions} />
      )}
    </Screen>
  );
}

/**
 * The lift's record. A loaded lift leads with its estimated 1RM on a volt card, the
 * estimate's line under it — labelled as an estimate, never mixed in with what you
 * lifted. A lift without load shows its best reps or hold per session as bars, each
 * of which opens that workout. The tiles say the facts people come here for, and
 * the bests below are each a set you actually lifted, with its date.
 */
function ProgressView({
  measure,
  loadType,
  series,
  sessions,
}: {
  measure: 'reps' | 'time';
  loadType: string;
  series: { sessionId: string; date: string; e1rm: number }[];
  sessions: ReturnType<typeof exerciseSessions>;
}) {
  const latest = series[series.length - 1];
  const first = series[0];
  const gain = latest && first && series.length > 1 ? latest.e1rm - first.e1rm : null;

  // Personal bests, from sets you actually lifted.
  const all = sessions.flatMap((s) => s.sets.map((set) => ({ set, date: s.date })));
  const heaviest = all.reduce<(typeof all)[number] | undefined>((b, x) => (!b || x.set.weight > b.set.weight || (x.set.weight === b.set.weight && x.set.reps > b.set.reps) ? x : b), undefined);
  const volumeOf = (s: (typeof sessions)[number]) => s.sets.reduce((t, x) => t + x.weight * x.reps, 0);
  const bestVolume = sessions.reduce<(typeof sessions)[number] | undefined>((b, s) => (!b || volumeOf(s) > volumeOf(b) ? s : b), undefined);
  const workWeight = sessions[0]?.sets.reduce((m, x) => Math.max(m, x.weight), 0) ?? 0;
  const atWeight = all.filter((x) => x.set.weight === workWeight).reduce<(typeof all)[number] | undefined>((b, x) => (!b || x.set.reps > b.set.reps ? x : b), undefined);
  const weighted = measure === 'reps' && (heaviest?.set.weight ?? 0) > 0;
  const longest = measure === 'time' ? all.reduce((m, x) => Math.max(m, x.set.reps), 0) : 0;
  // Newest first from the query; oldest first on a chart.
  const recent = sessions.slice(0, 12).reverse();
  const bestOf = (s: (typeof sessions)[number]) => s.sets.reduce((m, x) => Math.max(m, x.reps), 0);
  const newest = recent[recent.length - 1];

  return (
    <>
      {weighted && latest ? (
        <Card tone="volt" style={styles.hero}>
          <Text style={styles.heroEyebrow}>Estimated 1RM</Text>
          <Text style={styles.heroValue} numberOfLines={1}>
            {kgNum(Math.round(latest.e1rm))}
            <Text style={styles.heroUnit}> kg</Text>
          </Text>
          {gain !== null && Math.abs(gain) >= 0.5 ? (
            <View style={styles.heroChip}>
              <Icon name={gain > 0 ? 'arrowUp' : 'arrowDown'} size={13} color={color.accent} strokeWidth={2.6} />
              <Text style={styles.heroChipText}>
                {gain > 0 ? '+' : '−'}
                {kgNum(Math.round(Math.abs(gain)))} kg since {fmtDayLabel(first?.date ?? '')}
              </Text>
            </View>
          ) : null}
          {series.length > 1 ? (
            <View style={styles.heroChart}>
              <TrendChart
                trend={series.map((p, i) => ({ x: i, y: p.e1rm }))}
                height={120}
                readout={false}
                ink={color.onTile}
                format={(y) => `${kgNum(Math.round(y))} kg`}
                formatX={(x) => fmtDayLabel(series[x]?.date ?? '')}
              />
            </View>
          ) : null}
        </Card>
      ) : (
        <Card style={styles.barsCard}>
          <Text style={styles.barsEyebrow}>{measure === 'time' ? 'Longest hold, each session' : 'Most reps, each session'}</Text>
          <MiniBars
            data={recent.map((s) => ({ label: '', value: bestOf(s), a11y: `${fmtDayLabel(s.date)}: ${bestOf(s)} ${measure === 'time' ? 'seconds' : 'reps'}. Opens that workout.` }))}
            highlight={recent.length - 1}
            height={120}
            bubble={newest ? `${bestOf(newest)}${measure === 'time' ? ' s' : ''}` : undefined}
            onSelect={(i) => {
              const s = recent[i];
              if (s) router.push(`/session/summary/${s.sessionId}`);
            }}
          />
        </Card>
      )}

      <View style={styles.tiles}>
        <TitleBlock
          cells={[
            weighted && heaviest
              ? { label: 'Heaviest', value: kgNum(heaviest.set.weight), unit: `× ${heaviest.set.reps}` }
              : measure === 'time'
                ? { label: 'Longest', value: String(longest), unit: 's' }
                : { label: 'Most reps', value: String(all.reduce((m, x) => Math.max(m, x.set.reps), 0)) },
            { label: 'Sessions', value: String(sessions.length) },
          ]}
        />
      </View>

      {weighted && heaviest ? (
        <>
          <SectionHeader title="Bests, each a set you lifted" />
          <ListCard>
            <ListRow title="Heaviest set" sub={fmtDayLabel(heaviest.date)} chevron={false} right={<Text style={styles.value}>{fmtSet(measure, heaviest.set.weight, heaviest.set.reps, loadType)}</Text>} />
            {bestVolume ? (
              <ListRow
                divider
                title="Most volume in a session"
                sub={`${fmtDayLabel(bestVolume.date)}, ${bestVolume.sets.length} ${bestVolume.sets.length === 1 ? 'set' : 'sets'}`}
                chevron={false}
                right={<Text style={styles.value}>{Math.round(volumeOf(bestVolume)).toLocaleString()} kg</Text>}
              />
            ) : null}
            {atWeight ? (
              <ListRow divider title={`Most reps at ${kgNum(workWeight)} kg`} sub={fmtDayLabel(atWeight.date)} chevron={false} right={<Text style={styles.value}>{atWeight.set.reps} reps</Text>} />
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
      {weighted ? <Text style={styles.footnote}>The estimate comes from your best set each session. It is a calculation, not a lift.</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  pair: { flexDirection: 'row', gap: space.sm },
  hero: { marginTop: space.sm, marginBottom: 0, borderRadius: radius.xl, padding: space.xl - 4 },
  heroEyebrow: { ...font.eyebrow, color: color.onTileMuted },
  heroValue: { ...font.display, fontSize: 64, lineHeight: 68, color: color.onTile, paddingRight: space.xs },
  heroUnit: { ...font.measure, fontSize: 24, color: color.onTile, letterSpacing: 0 },
  heroChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', height: 30, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.onTile, marginTop: space.xs },
  heroChipText: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '800', color: color.accent, fontVariant: ['tabular-nums'] },
  heroChart: { marginTop: space.md, marginHorizontal: -space.sm },
  barsCard: { marginTop: space.sm, marginBottom: 0, borderRadius: radius.xl },
  barsEyebrow: { ...font.eyebrow, color: color.textMuted, marginBottom: space.md },
  tiles: { marginTop: space.md },
  value: { ...font.label, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'], color: color.text, flexShrink: 1, textAlign: 'right' },
  footnote: { ...font.caption, fontSize: 12, color: color.textFaint, marginTop: space.sm },
});
