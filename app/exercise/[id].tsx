import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, Icon, PrimaryButton, Screen, SectionHeader, toast } from '@/components';
import { CATALOG_BY_ID } from '@/data/catalog';
import { useLive } from '@/db/live';
import { getExercise } from '@/db/repositories/exercises';
import { getLastPerformance } from '@/db/repositories/sessions';
import { setSetting, useSettings } from '@/db/repositories/settings';
import { e1rmSeries } from '@/db/repositories/stats';
import { ExerciseGuide } from '@/features/exercises/ExerciseGuide';
import { fmtSet } from '@/features/session/prescription';
import { fmtDayLabel } from '@/lib/date';
import { kgNum } from '@/lib/format';
import { color, font, space } from '@/theme/tokens';

/** Full exercise guide plus your own history with it. */
export default function ExerciseScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id);
  const settings = useSettings();
  const exercise = useLive(() => getExercise(id), ['exercise'], [id]);
  const history = useLive(() => ({ series: e1rmSeries(id, 60), last: getLastPerformance(id) }), ['exercise_session_stat', 'set_log'], [id]);

  if (!exercise) {
    return (
      <Screen title="Exercise">
        <EmptyState message="This exercise isn't in your library." actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );
  }
  const measure = CATALOG_BY_ID.get(id)?.measure ?? 'reps';
  const best = history.series.reduce((m, p) => Math.max(m, p.e1rm), 0);
  const disliked = settings.disliked.includes(id);
  const toggleDislike = () => {
    const next = disliked ? settings.disliked.filter((x) => x !== id) : [...settings.disliked, id];
    setSetting('disliked', next);
    toast(disliked ? `${exercise.name} can be suggested again` : `${exercise.name} won't be suggested`, {
      label: 'Undo',
      onPress: () => setSetting('disliked', settings.disliked),
    });
  };

  return (
    <Screen title={exercise.name} right={<PrimaryButton label="Done" tone="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />}>
      <ExerciseGuide exercise={exercise} />
      <SectionHeader title="Your history" />
      {history.last ? (
        <Card>
          <View style={styles.row}>
            <Text style={styles.label}>Sessions</Text>
            <Text style={styles.value}>{history.series.length}</Text>
          </View>
          {measure === 'reps' && best > 0 ? (
            <View style={styles.row}>
              <Text style={styles.label}>Best estimated 1-rep max</Text>
              <Text style={styles.value}>{kgNum(Math.round(best * 10) / 10)} kg</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.label}>Last · {fmtDayLabel(history.last.date)}</Text>
            <Text style={styles.value} numberOfLines={1}>
              {history.last.sets
                .filter((s) => s.isWarmup === 0)
                .map((s) => fmtSet(measure, s.weight, s.reps, exercise.loadType))
                .join('  ')}
            </Text>
          </View>
        </Card>
      ) : (
        <Text style={styles.muted}>Not logged yet.</Text>
      )}
      <PrimaryButton
        label={disliked ? 'Suggest this again' : "Don't suggest this exercise"}
        tone="ghost"
        icon={<Icon name={disliked ? 'undo' : 'close'} size={16} color={color.textMuted} />}
        style={styles.gap}
        onPress={toggleDislike}
      />
      <Text style={styles.muted}>Hidden exercises are left out of swaps and new plans. Plans you already have don't change.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  label: { ...font.label, color: color.textMuted },
  value: { ...font.body, ...font.numeric, color: color.text, fontWeight: '600', flexShrink: 1 },
  muted: { ...font.label, color: color.textMuted },
  gap: { marginTop: space.xl },
});
