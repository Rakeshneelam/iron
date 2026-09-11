/**
 * Seed rows for the exercise table, derived from the catalogue (src/data/catalog).
 * `loadStep` is a starting point — the gym inventory refines load rounding, and a
 * value the user edits is never overwritten (the seed inserts, never updates).
 */
import { CATALOG, type Equipment } from '@/data/catalog';

export interface SeedExercise {
  id: string;
  name: string;
  loadType: Equipment;
  loadStep: number;
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  isUnilateral?: boolean;
}

export const EXERCISES: SeedExercise[] = CATALOG.map((e) => ({
  id: e.id,
  name: e.name,
  loadType: e.equipment,
  loadStep: e.loadStep,
  primaryMuscles: [...e.primary],
  ...(e.secondary ? { secondaryMuscles: [...e.secondary] } : {}),
  ...(e.unilateral ? { isUnilateral: true } : {}),
}));

/** Plates and dumbbells available. Drives load rounding + the plate calculator. */
export const EQUIPMENT = [
  { kind: 'bar' as const, valueKg: 20, count: 1 },
  { kind: 'bar' as const, valueKg: 10, count: 1, machineName: 'EZ bar' },
  ...[25, 20, 15, 10, 5, 2.5, 1.25].map((v) => ({ kind: 'plate' as const, valueKg: v, count: 8 })),
  // Typical commercial gym rack: 2 kg jumps to 30, then 5 kg
  ...Array.from({ length: 15 }, (_, i) => ({ kind: 'dumbbell' as const, valueKg: 2 + i * 2, count: 2 })),
  ...[35, 40, 45, 50].map((v) => ({ kind: 'dumbbell' as const, valueKg: v, count: 2 })),
];
