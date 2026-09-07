/**
 * The active routine: 4-day Upper/Lower/Upper/Lower, biased toward arms,
 * shoulders, traps and back — matching how he already trains.
 *
 * Weekly hard sets that this produces (check against VOLUME_LANDMARKS):
 *   back 18 · shoulders 17 · biceps 13 · triceps 12 · traps 7 · chest 10
 *   quads 13 · hamstrings 11 · glutes 4 · calves 7 · abs 6
 *
 * Rep ranges are wide on purpose: double progression needs room to work.
 */
export interface SeedSlot {
  exerciseId: string;
  targetSets: number;
  repLo: number;
  repHi: number;
  targetRir: number;
  restSeconds: number;
  supersetGroup?: string;
}

export interface SeedDay {
  dayIndex: number;
  label: string;
  slots: SeedSlot[];
}

const heavy = { targetRir: 2, restSeconds: 180 };
const mid = { targetRir: 1, restSeconds: 150 };
const iso = { targetRir: 1, restSeconds: 90 };

export const UPPER_LOWER: { name: string; daysPerWeek: number; days: SeedDay[] } = {
  name: 'Upper / Lower — arms, delts, back bias',
  daysPerWeek: 4,
  days: [
    {
      dayIndex: 0,
      label: 'Upper A — horizontal',
      slots: [
        { exerciseId: 'bb-bench', targetSets: 3, repLo: 5, repHi: 8, ...heavy },
        { exerciseId: 'bb-row', targetSets: 3, repLo: 6, repHi: 10, ...heavy },
        { exerciseId: 'db-shoulder-press', targetSets: 3, repLo: 8, repHi: 12, ...mid },
        { exerciseId: 'seated-cable-row', targetSets: 3, repLo: 10, repHi: 14, ...mid },
        { exerciseId: 'lateral-raise', targetSets: 4, repLo: 12, repHi: 20, ...iso, supersetGroup: 'A' },
        { exerciseId: 'bb-curl', targetSets: 3, repLo: 8, repHi: 12, ...iso, supersetGroup: 'A' },
        { exerciseId: 'cable-pushdown', targetSets: 3, repLo: 10, repHi: 15, ...iso },
      ],
    },
    {
      dayIndex: 1,
      label: 'Lower A — squat bias',
      slots: [
        { exerciseId: 'bb-squat', targetSets: 3, repLo: 5, repHi: 8, ...heavy },
        { exerciseId: 'rdl', targetSets: 3, repLo: 6, repHi: 10, ...heavy },
        { exerciseId: 'leg-press', targetSets: 3, repLo: 10, repHi: 15, ...mid },
        { exerciseId: 'seated-leg-curl', targetSets: 3, repLo: 10, repHi: 15, ...iso },
        { exerciseId: 'calf-raise', targetSets: 4, repLo: 10, repHi: 15, ...iso },
        { exerciseId: 'cable-crunch', targetSets: 3, repLo: 10, repHi: 15, ...iso },
      ],
    },
    {
      dayIndex: 2,
      label: 'Upper B — vertical, arms',
      slots: [
        { exerciseId: 'pull-up', targetSets: 3, repLo: 5, repHi: 10, ...heavy },
        { exerciseId: 'db-incline', targetSets: 3, repLo: 8, repHi: 12, ...mid },
        { exerciseId: 'chest-supported-row', targetSets: 3, repLo: 10, repHi: 14, ...mid },
        { exerciseId: 'cable-lateral', targetSets: 4, repLo: 12, repHi: 20, ...iso, supersetGroup: 'B' },
        { exerciseId: 'face-pull', targetSets: 3, repLo: 12, repHi: 20, ...iso, supersetGroup: 'B' },
        { exerciseId: 'db-shrug', targetSets: 4, repLo: 10, repHi: 15, ...iso },
        { exerciseId: 'db-incline-curl', targetSets: 3, repLo: 8, repHi: 12, ...iso, supersetGroup: 'C' },
        { exerciseId: 'overhead-ext', targetSets: 3, repLo: 10, repHi: 15, ...iso, supersetGroup: 'C' },
      ],
    },
    {
      dayIndex: 3,
      label: 'Lower B — hinge bias, arms',
      slots: [
        { exerciseId: 'hack-squat', targetSets: 3, repLo: 8, repHi: 12, ...heavy },
        { exerciseId: 'hip-thrust', targetSets: 3, repLo: 8, repHi: 12, ...mid },
        { exerciseId: 'leg-curl', targetSets: 3, repLo: 10, repHi: 15, ...iso },
        { exerciseId: 'leg-extension', targetSets: 3, repLo: 12, repHi: 20, ...iso },
        { exerciseId: 'seated-calf', targetSets: 3, repLo: 12, repHi: 20, ...iso },
        { exerciseId: 'hammer-curl', targetSets: 3, repLo: 10, repHi: 15, ...iso, supersetGroup: 'D' },
        { exerciseId: 'skullcrusher', targetSets: 3, repLo: 8, repHi: 12, ...iso, supersetGroup: 'D' },
      ],
    },
  ],
};
