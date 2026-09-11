/**
 * The exercise library: ~100 useful lifts, not a thousand obscure ones. PURE DATA.
 * New entries appear in the DB on the next launch (the seed is idempotent).
 */
import { CORE } from './core.ts';
import { LOWER } from './lower.ts';
import type { CatalogExercise, Muscle } from './types.ts';
import { UPPER } from './upper.ts';

export * from './types.ts';

export const CATALOG: readonly CatalogExercise[] = [...UPPER, ...LOWER, ...CORE];
export const CATALOG_BY_ID: ReadonlyMap<string, CatalogExercise> = new Map(CATALOG.map((e) => [e.id, e]));

export const LIBRARY_CATEGORIES = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Core', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Full body', 'Cardio',
] as const;
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];

const BY_MUSCLE: Record<Muscle, LibraryCategory> = {
  chest: 'Chest', back: 'Back', lowerBack: 'Back', shoulders: 'Shoulders', traps: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps',
  forearms: 'Forearms', abs: 'Core', obliques: 'Core', quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', adductors: 'Quads', calves: 'Calves',
};

export function categoryOf(e: Pick<CatalogExercise, 'primary' | 'pattern'>): LibraryCategory {
  if (e.pattern === 'conditioning') return 'Cardio';
  if (e.pattern === 'carry') return 'Full body';
  const first = e.primary[0];
  return first ? BY_MUSCLE[first] : 'Full body';
}
