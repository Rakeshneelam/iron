/**
 * The exercise library. PURE DATA. New entries appear in the DB on the next launch
 * (the seed is idempotent, and inserts without ever updating).
 *
 * Two tiers, deliberately in this order:
 *
 *   UPPER/LOWER/CORE  95 hand-written entries — real coaching cues, checked
 *                     movement patterns, curated progressions and alternatives.
 *   IMPORTED          1,305 from exercises-dataset, muscles and patterns inferred
 *                     by `npm run import:catalog`. Good enough to find and log
 *                     against; not the same standard.
 *
 * Curated first so it wins every by-id lookup, and the import drops anything whose
 * name already exists above. Anything picked out of the library still logs, still
 * charts and still progresses — the engine only needs equipment, muscles, pattern
 * and load step, all of which are present on both tiers.
 */
import { CORE } from './core.ts';
import { IMPORTED } from './imported.generated.ts';
import { LOWER } from './lower.ts';
import type { CatalogExercise, Muscle } from './types.ts';
import { UPPER } from './upper.ts';

export * from './types.ts';

/** The curated 95 alone — what plan templates and recommendations are built from. */
export const CURATED: readonly CatalogExercise[] = [...UPPER, ...LOWER, ...CORE];

export const CATALOG: readonly CatalogExercise[] = [...CURATED, ...IMPORTED];
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
