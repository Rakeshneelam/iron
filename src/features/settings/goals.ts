import type { Phase } from '@/engine/metabolic';

/** The metabolic phase, in words people use. */
export const GOALS: { label: string; value: Phase }[] = [
  { label: 'Lose fat', value: 'cut' },
  { label: 'Recomp', value: 'recomp' },
  { label: 'Maintain', value: 'maintain' },
  { label: 'Build', value: 'bulk' },
];
