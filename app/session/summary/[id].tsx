import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, PrimaryButton, Screen, SectionHeader, StatTile } from '@/components';
import { getSessionSummary } from '@/db/repositories/sessions';
import { BatteryCard } from '@/features/settings/BatteryCard';
import { fmtDayLabel } from '@/lib/date';
import { kgNum, signed } from '@/lib/format';
import { color, font, space } from '@/theme/tokens';

/** Facts only: volume, change vs last time, e1RM highs. No celebration, no streak. */
export default function SummaryScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id);
  const summary = useMemo(() => getSessionSummary(id), [id]);

  if (!summary) {
    return (
      <Screen title="Summary">
        <EmptyState message="This workout no longer exists." actionLabel="Back to Today" onAction={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen title="Workout saved" subtitle={fmtDayLabel(summary.session.date)}>
      <View style={styles.tiles}>
        <StatTile label="Volume" value={`${Math.round(summary.totalTonnage).toLocaleString()} kg`} />
        <StatTile label="Hard sets" value={String(summary.hardSets)} />
        <StatTile label="Time" value={`${summary.durationMin} min`} />
      </View>

      <SectionHeader title="Per lift" />
      {summary.perExercise.map((e) => {
        const delta = e.prevBestE1rm === null ? null : e.bestE1rm - e.prevBestE1rm;
        return (
          <Card key={e.exerciseId}>
            <Text style={styles.name}>{e.name}</Text>
            <Text style={styles.muted}>
              {e.sets} sets · {Math.round(e.tonnage)} kg · e1RM {kgNum(Math.round(e.bestE1rm * 10) / 10)}
              {delta === null ? ' · first time' : ` (${signed(delta)} vs last)`}
            </Text>
            {e.isPR ? <Text style={styles.pr}>New e1RM high</Text> : null}
          </Card>
        );
      })}

      <BatteryCard />
      <PrimaryButton label="Done" size="gym" onPress={() => router.replace('/')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: space.sm },
  name: { ...font.body, color: color.text, fontWeight: '600' },
  muted: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  pr: { ...font.label, color: color.positive, marginTop: space.xs },
});
