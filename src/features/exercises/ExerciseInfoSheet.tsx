import { StyleSheet, Text, View } from 'react-native';

import { Sheet } from '@/components/Sheet';
import type { Exercise } from '@/db/repositories/exercises';
import { color, font, radius, space } from '@/theme/tokens';

import { ExerciseDemo } from './ExerciseDemo';
import { MuscleMap } from './MuscleMap';

const cap = (s: string) => (s ? s[0]?.toUpperCase() + s.slice(1) : s);

/** How the movement looks and what it trains. Opened from the ⓘ next to an exercise. */
export function ExerciseInfoSheet({ exercise, onClose }: { exercise: Exercise | null; onClose: () => void }) {
  return (
    <Sheet visible={exercise !== null} onClose={onClose} title={exercise?.name}>
      {exercise ? (
        <View style={styles.stack}>
          <View style={styles.stage}>
            <ExerciseDemo exercise={exercise} size={220} />
          </View>
          <MuscleMap primary={exercise.primaryMuscles} secondary={exercise.secondaryMuscles} />
          <View style={styles.legend}>
            <Legend tone={color.accent} label={exercise.primaryMuscles.map(cap).join(', ')} />
            {exercise.secondaryMuscles?.length ? <Legend tone={color.chartFaint} label={exercise.secondaryMuscles.map(cap).join(', ')} /> : null}
          </View>
          <Text style={styles.meta}>
            {cap(exercise.loadType)}
            {exercise.isUnilateral ? ' · one side at a time' : ''}
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.dot, { backgroundColor: tone }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.lg, paddingBottom: space.lg },
  stage: { alignItems: 'center', backgroundColor: color.bg, borderRadius: radius.lg, paddingVertical: space.md },
  legend: { gap: space.xs, alignItems: 'center' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { ...font.label, color: color.text },
  meta: { ...font.caption, color: color.textMuted, textAlign: 'center' },
});
