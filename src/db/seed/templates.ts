/**
 * Predefined plans. Picking one COPIES it into an ordinary, fully editable plan —
 * templates are never referenced after that, so editing a copy can't break another.
 * Every exerciseId must exist in ./exercises.ts.
 */
import { UPPER_LOWER, type SeedSlot } from './routine-upper-lower';

export interface PlanTemplate {
  id: string;
  name: string;
  /** One line: who it suits. */
  summary: string;
  daysPerWeek: number;
  days: { label: string; slots: SeedSlot[] }[];
}

const heavy = { targetRir: 2, restSeconds: 180 };
const mid = { targetRir: 1, restSeconds: 150 };
const iso = { targetRir: 1, restSeconds: 90 };
const s = (exerciseId: string, targetSets: number, repLo: number, repHi: number, preset: { targetRir: number; restSeconds: number }): SeedSlot => ({
  exerciseId,
  targetSets,
  repLo,
  repHi,
  ...preset,
});

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: 'full-body-3',
    name: 'Full Body',
    summary: '3 days · best for beginners or busy weeks',
    daysPerWeek: 3,
    days: [
      {
        label: 'Full Body A',
        slots: [s('bb-squat', 3, 5, 8, heavy), s('bb-bench', 3, 6, 10, heavy), s('bb-row', 3, 8, 12, mid), s('lateral-raise', 3, 12, 20, iso), s('bb-curl', 2, 10, 15, iso)],
      },
      {
        label: 'Full Body B',
        slots: [s('rdl', 3, 6, 10, heavy), s('bb-ohp', 3, 6, 10, heavy), s('lat-pulldown', 3, 8, 12, mid), s('leg-press', 3, 10, 15, mid), s('cable-pushdown', 2, 10, 15, iso)],
      },
      {
        label: 'Full Body C',
        slots: [s('goblet-squat', 3, 8, 12, mid), s('db-incline', 3, 8, 12, mid), s('seated-cable-row', 3, 10, 14, mid), s('leg-curl', 3, 10, 15, iso), s('calf-raise', 3, 10, 15, iso)],
      },
    ],
  },
  {
    id: 'upper-lower-4',
    name: 'Upper / Lower',
    summary: '4 days · balanced strength and size',
    daysPerWeek: 4,
    days: [
      {
        label: 'Upper A',
        slots: [s('bb-bench', 3, 5, 8, heavy), s('bb-row', 3, 6, 10, heavy), s('db-shoulder-press', 3, 8, 12, mid), s('lat-pulldown', 3, 8, 12, mid), s('bb-curl', 2, 8, 12, iso), s('cable-pushdown', 2, 10, 15, iso)],
      },
      {
        label: 'Lower A',
        slots: [s('bb-squat', 3, 5, 8, heavy), s('rdl', 3, 6, 10, heavy), s('leg-press', 3, 10, 15, mid), s('leg-curl', 3, 10, 15, iso), s('calf-raise', 3, 10, 15, iso)],
      },
      {
        label: 'Upper B',
        slots: [s('bb-ohp', 3, 5, 8, heavy), s('pull-up', 3, 5, 10, heavy), s('db-incline', 3, 8, 12, mid), s('seated-cable-row', 3, 10, 14, mid), s('lateral-raise', 3, 12, 20, iso), s('hammer-curl', 2, 10, 15, iso)],
      },
      {
        label: 'Lower B',
        slots: [s('bb-deadlift', 3, 3, 6, heavy), s('hack-squat', 3, 8, 12, mid), s('bulgarian-split', 2, 8, 12, mid), s('seated-leg-curl', 3, 10, 15, iso), s('seated-calf', 3, 12, 20, iso), s('hanging-leg-raise', 3, 8, 15, iso)],
      },
    ],
  },
  {
    id: 'ppl-3',
    name: 'Push / Pull / Legs',
    summary: '3 days · run it twice for a 6-day week',
    daysPerWeek: 3,
    days: [
      {
        label: 'Push',
        slots: [s('bb-bench', 3, 5, 8, heavy), s('bb-ohp', 3, 6, 10, heavy), s('db-incline', 3, 8, 12, mid), s('lateral-raise', 3, 12, 20, iso), s('cable-pushdown', 3, 10, 15, iso), s('overhead-ext', 2, 10, 15, iso)],
      },
      {
        label: 'Pull',
        slots: [s('pull-up', 3, 5, 10, heavy), s('bb-row', 3, 6, 10, heavy), s('lat-pulldown', 3, 8, 12, mid), s('face-pull', 3, 12, 20, iso), s('bb-curl', 3, 8, 12, iso), s('hammer-curl', 2, 10, 15, iso)],
      },
      {
        label: 'Legs',
        slots: [s('bb-squat', 3, 5, 8, heavy), s('rdl', 3, 6, 10, heavy), s('leg-press', 3, 10, 15, mid), s('leg-curl', 3, 10, 15, iso), s('calf-raise', 4, 10, 15, iso), s('cable-crunch', 3, 10, 15, iso)],
      },
    ],
  },
  {
    id: 'strength-3',
    name: 'Strength',
    summary: '3 days · alternate A and B, heavy low reps',
    daysPerWeek: 3,
    days: [
      {
        label: 'Strength A',
        slots: [s('bb-squat', 5, 3, 5, { targetRir: 2, restSeconds: 210 }), s('bb-bench', 5, 3, 5, { targetRir: 2, restSeconds: 210 }), s('bb-row', 5, 3, 5, heavy), s('pull-up', 3, 5, 10, mid)],
      },
      {
        label: 'Strength B',
        slots: [s('bb-squat', 5, 3, 5, { targetRir: 2, restSeconds: 210 }), s('bb-ohp', 5, 3, 5, heavy), s('bb-deadlift', 3, 3, 5, { targetRir: 2, restSeconds: 240 }), s('face-pull', 3, 12, 20, iso)],
      },
    ],
  },
  {
    id: 'hypertrophy-ul-bias',
    name: 'Hypertrophy · arms, delts, back',
    summary: '4 days · upper/lower with extra arm and shoulder work',
    daysPerWeek: UPPER_LOWER.daysPerWeek,
    days: UPPER_LOWER.days.map((d) => ({ label: d.label, slots: d.slots })),
  },
];
