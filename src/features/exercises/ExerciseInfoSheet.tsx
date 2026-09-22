import { router } from 'expo-router';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import type { Exercise } from '@/db/repositories/exercises';

import { ExerciseGuide, guideMeta } from './ExerciseGuide';

/** The guide in a sheet — opened from ⓘ mid-workout, so it stays compact. */
export function ExerciseInfoSheet({ exercise, onClose }: { exercise: Exercise | null; onClose: () => void }) {
  return (
    <Sheet visible={exercise !== null} onClose={onClose} title={exercise?.name} subtitle={exercise ? guideMeta(exercise) : undefined}>
      {exercise ? (
        <>
          <ExerciseGuide
            exercise={exercise}
            compact
            onOpen={(id) => {
              onClose();
              router.push(`/exercise/${id}`);
            }}
          />
          <PrimaryButton
            label="Full guide"
            tone="ghost"
            onPress={() => {
              onClose();
              router.push(`/exercise/${exercise.id}`);
            }}
          />
        </>
      ) : null}
    </Sheet>
  );
}
