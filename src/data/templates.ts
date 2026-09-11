/**
 * Predefined plans. PURE DATA. Picking one COPIES it into an ordinary, fully editable
 * plan (after substituting anything your equipment or preferences rule out).
 *
 * Design rules, from the evidence rather than habit:
 *  - Every major muscle trained at least twice a week, ~10+ hard sets per muscle
 *    per week for muscle gain (ACSM 2026 position stand; Schoenfeld 2017,
 *    Pelland 2025 dose-response meta-regressions). Beginners start lower.
 *  - Mostly 6–12 reps for muscle gain; 3–6 for strength; isolation 10–20.
 *  - Longer rest on heavy compounds (2–3+ min), 60–90 s on isolation — shorter rest
 *    costs trained lifters some growth (Grgic 2017; Singer 2024).
 *  - Stop 1–3 reps short of failure; failure is optional, not required (ACSM 2026).
 *  - Stable exercise selection, so progress is trackable.
 */
import { UPPER_LOWER } from '../db/seed/routine-upper-lower.ts';
import type { Level } from './catalog/types.ts';

export type Goal = 'strength' | 'hypertrophy' | 'general';
/** The setup a plan assumes. Presets map to concrete equipment in engine/planner. */
export type EquipmentPreset = 'gym' | 'home' | 'dumbbells' | 'bands' | 'bodyweight';

export interface TemplateSlot {
  exerciseId: string;
  targetSets: number;
  repLo: number;
  repHi: number;
  targetRir: number;
  restSeconds: number;
  supersetGroup?: string;
}

export interface PlanTemplate {
  id: string;
  name: string;
  summary: string;
  goal: Goal;
  level: Level;
  daysPerWeek: number;
  /** Typical session length in minutes, warm-up included. */
  minutes: number;
  equipment: EquipmentPreset;
  progression: string;
  days: { label: string; slots: TemplateSlot[] }[];
}

const DOUBLE =
  'Double progression: add a rep each session until every set reaches the top of the range at the target effort, then add the smallest weight step and start again at the bottom.';
const LINEAR =
  'Add the smallest weight step each session while you complete every rep. Miss twice and the weight holds; keep missing and it drops about 10% to build back up.';
const BODYWEIGHT =
  'Add reps (or seconds) within the range; once you reach the top on every set, move to the harder variation or add load.';

/** exercise, sets, rep range, rest seconds, target reps-in-reserve, superset group. */
const s = (exerciseId: string, targetSets: number, repLo: number, repHi: number, restSeconds: number, targetRir = 2, supersetGroup?: string): TemplateSlot => ({
  exerciseId,
  targetSets,
  repLo,
  repHi,
  restSeconds,
  targetRir,
  ...(supersetGroup ? { supersetGroup } : {}),
});

// Rest presets (seconds)
const STR = 210; // heavy strength compounds
const HVY = 150; // compounds for muscle gain
const MOD = 120;
const ISO = 75;

export const PLAN_TEMPLATES: readonly PlanTemplate[] = [
  /* ------------------------------ beginner ------------------------------ */
  {
    id: 'beginner-full-body', name: 'Beginner Full Body', summary: 'Two alternating full-body days. Free weights and machines.',
    goal: 'general', level: 'beginner', daysPerWeek: 3, minutes: 45, equipment: 'gym', progression: DOUBLE,
    days: [
      { label: 'Full Body A', slots: [s('goblet-squat', 3, 8, 12, MOD), s('machine-chest-press', 3, 8, 12, MOD), s('lat-pulldown', 3, 8, 12, MOD), s('db-rdl', 2, 8, 12, MOD), s('plank', 2, 20, 40, 60)] },
      { label: 'Full Body B', slots: [s('leg-press', 3, 10, 15, MOD), s('db-shoulder-press', 3, 8, 12, MOD), s('seated-cable-row', 3, 8, 12, MOD), s('leg-curl', 2, 10, 15, ISO), s('knee-raise', 2, 8, 15, 60)] },
    ],
  },
  {
    id: 'beginner-gym', name: 'Beginner Gym', summary: 'Three machine-based full-body days — easiest way to learn the gym.',
    goal: 'hypertrophy', level: 'beginner', daysPerWeek: 3, minutes: 50, equipment: 'gym', progression: DOUBLE,
    days: [
      { label: 'Day 1', slots: [s('leg-press', 3, 10, 15, MOD), s('machine-chest-press', 3, 8, 12, MOD), s('lat-pulldown', 3, 8, 12, MOD), s('leg-curl', 2, 10, 15, ISO), s('lateral-raise', 2, 12, 15, ISO), s('cable-pushdown', 2, 10, 15, ISO)] },
      { label: 'Day 2', slots: [s('goblet-squat', 3, 8, 12, MOD), s('db-incline', 3, 8, 12, MOD), s('seated-cable-row', 3, 8, 12, MOD), s('back-extension', 2, 10, 15, ISO), s('cable-curl', 2, 10, 15, ISO), s('calf-raise', 2, 10, 15, ISO)] },
      { label: 'Day 3', slots: [s('hack-squat', 3, 8, 12, MOD), s('machine-shoulder-press', 3, 8, 12, MOD), s('chest-supported-row', 3, 8, 12, MOD), s('hip-thrust', 2, 8, 12, MOD), s('pec-deck', 2, 12, 15, ISO), s('plank', 2, 20, 40, 60)] },
    ],
  },
  {
    id: 'beginner-home', name: 'Beginner Home', summary: 'No equipment at all. Add a band or pull-up bar later to train your back better.',
    goal: 'general', level: 'beginner', daysPerWeek: 3, minutes: 30, equipment: 'bodyweight', progression: BODYWEIGHT,
    days: [
      { label: 'Home A', slots: [s('bw-squat', 3, 10, 20, 75), s('incline-push-up', 3, 6, 15, 75), s('prone-yt', 3, 10, 15, 60), s('glute-bridge', 3, 10, 20, 60), s('plank', 3, 20, 40, 60)] },
      { label: 'Home B', slots: [s('reverse-lunge', 3, 8, 12, 75), s('push-up', 3, 5, 15, 75), s('prone-yt', 3, 10, 15, 60), s('sl-calf-raise', 2, 10, 20, 60), s('dead-bug', 3, 6, 10, 60)] },
    ],
  },
  {
    id: 'beginner-dumbbell', name: 'Beginner Dumbbell', summary: 'A pair of dumbbells and a bench — two alternating days.',
    goal: 'general', level: 'beginner', daysPerWeek: 3, minutes: 40, equipment: 'dumbbells', progression: DOUBLE,
    days: [
      { label: 'Dumbbell A', slots: [s('goblet-squat', 3, 8, 12, MOD), s('db-bench', 3, 8, 12, MOD), s('db-row', 3, 8, 12, MOD), s('db-rdl', 2, 8, 12, MOD), s('db-curl', 2, 10, 15, ISO)] },
      { label: 'Dumbbell B', slots: [s('split-squat', 3, 8, 12, MOD), s('db-shoulder-press', 3, 8, 12, MOD), s('db-row', 3, 8, 12, MOD), s('glute-bridge', 2, 10, 15, ISO), s('db-overhead-ext', 2, 10, 15, ISO)] },
    ],
  },

  /* ----------------------------- muscle gain ----------------------------- */
  {
    id: 'hypertrophy-3', name: '3-Day Hypertrophy', summary: 'Full body three times a week — every muscle twice or more.',
    goal: 'hypertrophy', level: 'intermediate', daysPerWeek: 3, minutes: 60, equipment: 'gym', progression: DOUBLE,
    days: [
      { label: 'Day 1', slots: [s('bb-squat', 3, 6, 10, HVY), s('db-bench', 3, 8, 12, MOD), s('lat-pulldown', 3, 8, 12, MOD), s('leg-curl', 3, 10, 15, ISO, 1), s('lateral-raise', 3, 12, 20, ISO, 1), s('cable-curl', 2, 10, 15, ISO, 1), s('overhead-ext', 2, 10, 15, ISO, 1)] },
      { label: 'Day 2', slots: [s('rdl', 3, 6, 10, HVY), s('incline-bb-bench', 3, 6, 10, HVY), s('seated-cable-row', 3, 8, 12, MOD), s('leg-press', 3, 10, 15, MOD), s('cable-pushdown', 3, 10, 15, ISO, 1), s('calf-raise', 3, 10, 15, ISO, 1)] },
      { label: 'Day 3', slots: [s('hack-squat', 3, 8, 12, MOD), s('pull-up', 3, 5, 10, MOD), s('machine-shoulder-press', 3, 8, 12, MOD), s('hip-thrust', 3, 8, 12, MOD), s('cable-fly', 3, 12, 15, ISO, 1), s('lateral-raise', 2, 12, 20, ISO, 1), s('hammer-curl', 2, 10, 15, ISO, 1)] },
    ],
  },
  {
    id: 'upper-lower-4', name: '4-Day Upper/Lower', summary: 'Upper and lower twice each — balanced strength and size.',
    goal: 'hypertrophy', level: 'intermediate', daysPerWeek: 4, minutes: 60, equipment: 'gym', progression: DOUBLE,
    days: [
      { label: 'Upper A', slots: [s('bb-bench', 4, 5, 8, HVY), s('bb-row', 3, 6, 10, HVY), s('db-shoulder-press', 3, 8, 12, MOD), s('lat-pulldown', 3, 8, 12, MOD), s('bb-curl', 2, 8, 12, ISO, 1), s('cable-pushdown', 2, 10, 15, ISO, 1)] },
      { label: 'Lower A', slots: [s('bb-squat', 3, 5, 8, HVY), s('rdl', 3, 6, 10, HVY), s('leg-press', 3, 10, 15, MOD), s('leg-curl', 3, 10, 15, ISO, 1), s('calf-raise', 3, 10, 15, ISO, 1)] },
      { label: 'Upper B', slots: [s('bb-ohp', 3, 5, 8, HVY), s('pull-up', 3, 5, 10, HVY), s('db-incline', 3, 8, 12, MOD), s('seated-cable-row', 3, 10, 14, MOD), s('cable-fly', 2, 12, 15, ISO, 1), s('lateral-raise', 3, 12, 20, ISO, 1), s('overhead-ext', 2, 10, 15, ISO, 1, 'A'), s('hammer-curl', 2, 10, 15, ISO, 1, 'A')] },
      { label: 'Lower B', slots: [s('bb-deadlift', 3, 3, 6, STR), s('hack-squat', 3, 8, 12, MOD), s('bulgarian-split', 2, 8, 12, MOD), s('seated-leg-curl', 3, 10, 15, ISO, 1), s('seated-calf', 3, 12, 20, ISO, 1), s('hanging-leg-raise', 3, 8, 15, ISO, 1)] },
    ],
  },
  {
    id: 'hypertrophy-5', name: '5-Day Hypertrophy', summary: 'Upper, Lower, Push, Pull, Legs — high weekly volume.',
    goal: 'hypertrophy', level: 'intermediate', daysPerWeek: 5, minutes: 60, equipment: 'gym', progression: DOUBLE,
    days: [
      { label: 'Upper', slots: [s('bb-bench', 3, 6, 10, HVY), s('bb-row', 3, 6, 10, HVY), s('db-shoulder-press', 3, 8, 12, MOD), s('lat-pulldown', 3, 8, 12, MOD), s('db-curl', 2, 10, 15, ISO, 1), s('cable-pushdown', 2, 10, 15, ISO, 1)] },
      { label: 'Lower', slots: [s('bb-squat', 3, 6, 10, HVY), s('rdl', 3, 8, 10, HVY), s('leg-press', 2, 10, 15, MOD), s('leg-curl', 3, 10, 15, ISO, 1), s('calf-raise', 3, 10, 15, ISO, 1)] },
      { label: 'Push', slots: [s('db-incline', 3, 8, 12, MOD), s('machine-shoulder-press', 3, 8, 12, MOD), s('cable-fly', 3, 12, 15, ISO, 1), s('lateral-raise', 4, 12, 20, ISO, 1), s('overhead-ext', 3, 10, 15, ISO, 1)] },
      { label: 'Pull', slots: [s('lat-pulldown', 3, 8, 12, MOD), s('chest-supported-row', 3, 8, 12, MOD), s('seated-cable-row', 3, 10, 12, MOD), s('face-pull', 3, 12, 20, ISO, 1), s('hammer-curl', 3, 10, 15, ISO, 1), s('db-incline-curl', 2, 10, 15, ISO, 1)] },
      { label: 'Legs', slots: [s('hack-squat', 3, 8, 12, MOD), s('hip-thrust', 3, 8, 12, MOD), s('bulgarian-split', 2, 8, 12, MOD), s('seated-leg-curl', 3, 10, 15, ISO, 1), s('seated-calf', 3, 12, 20, ISO, 1), s('hanging-leg-raise', 3, 8, 15, ISO, 1)] },
    ],
  },
  {
    id: 'ppl-6', name: '6-Day Push/Pull/Legs', summary: 'Each muscle twice a week with two different days of each. For experienced lifters.',
    goal: 'hypertrophy', level: 'advanced', daysPerWeek: 6, minutes: 60, equipment: 'gym', progression: DOUBLE,
    days: [
      { label: 'Push A', slots: [s('bb-bench', 3, 5, 8, HVY), s('bb-ohp', 3, 6, 10, HVY), s('db-incline', 3, 8, 12, MOD), s('lateral-raise', 3, 12, 20, ISO, 1), s('cable-pushdown', 3, 10, 15, ISO, 1), s('overhead-ext', 2, 10, 15, ISO, 1)] },
      { label: 'Pull A', slots: [s('pull-up', 3, 5, 10, HVY), s('bb-row', 3, 6, 10, HVY), s('lat-pulldown', 3, 8, 12, MOD), s('face-pull', 3, 12, 20, ISO, 1), s('bb-curl', 3, 8, 12, ISO, 1), s('hammer-curl', 2, 10, 15, ISO, 1)] },
      { label: 'Legs A', slots: [s('bb-squat', 3, 5, 8, HVY), s('rdl', 3, 6, 10, HVY), s('leg-press', 3, 10, 15, MOD), s('leg-curl', 3, 10, 15, ISO, 1), s('calf-raise', 4, 10, 15, ISO, 1), s('cable-crunch', 3, 10, 15, ISO, 1)] },
      { label: 'Push B', slots: [s('db-incline', 3, 8, 12, MOD), s('machine-shoulder-press', 3, 8, 12, MOD), s('cable-fly', 3, 12, 15, ISO, 1), s('cable-lateral', 3, 12, 20, ISO, 1), s('skullcrusher', 3, 8, 12, ISO, 1)] },
      { label: 'Pull B', slots: [s('chest-supported-row', 3, 8, 12, MOD), s('lat-pulldown', 3, 10, 14, MOD), s('reverse-pec-deck', 3, 12, 20, ISO, 1), s('db-incline-curl', 3, 10, 15, ISO, 1), s('cable-curl', 2, 10, 15, ISO, 1)] },
      { label: 'Legs B', slots: [s('hack-squat', 3, 8, 12, MOD), s('hip-thrust', 3, 8, 12, MOD), s('bulgarian-split', 2, 8, 12, MOD), s('seated-leg-curl', 3, 10, 15, ISO, 1), s('seated-calf', 3, 12, 20, ISO, 1), s('hanging-leg-raise', 3, 8, 15, ISO, 1)] },
    ],
  },
  {
    id: 'hypertrophy-ul-bias', name: 'Upper/Lower · arms, delts, back', summary: 'Four days with extra arm and shoulder work.',
    goal: 'hypertrophy', level: 'intermediate', daysPerWeek: UPPER_LOWER.daysPerWeek, minutes: 70, equipment: 'gym', progression: DOUBLE,
    days: UPPER_LOWER.days.map((d) => ({ label: d.label, slots: d.slots })),
  },

  /* ------------------------------- strength ------------------------------ */
  {
    id: 'beginner-strength', name: 'Beginner Strength', summary: 'Alternate A and B, heavy fives, add weight every session.',
    goal: 'strength', level: 'beginner', daysPerWeek: 3, minutes: 60, equipment: 'gym', progression: LINEAR,
    days: [
      { label: 'Strength A', slots: [s('bb-squat', 3, 5, 5, STR, 1), s('bb-bench', 3, 5, 5, STR, 1), s('bb-row', 3, 5, 5, HVY, 1), s('chin-up', 2, 5, 8, MOD)] },
      { label: 'Strength B', slots: [s('bb-squat', 3, 5, 5, STR, 1), s('bb-ohp', 3, 5, 5, STR, 1), s('bb-deadlift', 1, 5, 5, 240, 1), s('lat-pulldown', 2, 8, 10, MOD)] },
    ],
  },
  {
    id: 'intermediate-strength', name: 'Intermediate Strength', summary: 'One main lift per day — squat, bench, deadlift, press.',
    goal: 'strength', level: 'intermediate', daysPerWeek: 4, minutes: 75, equipment: 'gym', progression: DOUBLE,
    days: [
      { label: 'Squat', slots: [s('bb-squat', 4, 3, 5, STR), s('rdl', 3, 6, 8, HVY), s('leg-press', 2, 8, 10, MOD), s('plank', 2, 30, 45, 60)] },
      { label: 'Bench', slots: [s('bb-bench', 4, 3, 5, STR), s('bb-row', 4, 5, 8, HVY), s('db-incline', 3, 6, 10, MOD), s('face-pull', 2, 12, 15, ISO, 1)] },
      { label: 'Deadlift', slots: [s('bb-deadlift', 3, 3, 5, 240), s('front-squat', 3, 4, 6, STR), s('leg-curl', 3, 8, 12, ISO, 1), s('hanging-leg-raise', 3, 8, 12, ISO, 1)] },
      { label: 'Press', slots: [s('bb-ohp', 4, 3, 5, STR), s('pull-up', 4, 4, 8, HVY), s('close-grip-bench', 3, 5, 8, HVY), s('db-curl', 2, 8, 12, ISO, 1)] },
    ],
  },
  {
    id: 'upper-lower-strength', name: 'Upper/Lower Strength', summary: 'A heavy day and a volume day for each half of the body.',
    goal: 'strength', level: 'intermediate', daysPerWeek: 4, minutes: 70, equipment: 'gym', progression: DOUBLE,
    days: [
      { label: 'Upper Heavy', slots: [s('bb-bench', 4, 3, 6, STR), s('bb-row', 4, 4, 6, HVY), s('bb-ohp', 3, 5, 8, HVY), s('chin-up', 3, 5, 8, MOD)] },
      { label: 'Lower Heavy', slots: [s('bb-squat', 4, 3, 6, STR), s('rdl', 3, 5, 8, HVY), s('bulgarian-split', 2, 6, 10, MOD), s('calf-raise', 3, 8, 12, ISO, 1)] },
      { label: 'Upper Volume', slots: [s('db-incline', 3, 8, 12, MOD), s('seated-cable-row', 3, 8, 12, MOD), s('db-shoulder-press', 3, 8, 12, MOD), s('lat-pulldown', 3, 8, 12, MOD), s('lateral-raise', 2, 12, 15, ISO, 1), s('cable-pushdown', 2, 10, 15, ISO, 1)] },
      { label: 'Lower Volume', slots: [s('hack-squat', 3, 8, 12, MOD), s('hip-thrust', 3, 8, 12, MOD), s('leg-curl', 3, 10, 15, ISO, 1), s('leg-extension', 2, 12, 15, ISO, 1), s('seated-calf', 3, 12, 15, ISO, 1)] },
    ],
  },

  /* --------------------------- general fitness --------------------------- */
  {
    id: 'full-body-fitness', name: 'Full Body Fitness', summary: 'Strength circuits plus a short cardio finisher.',
    goal: 'general', level: 'beginner', daysPerWeek: 3, minutes: 45, equipment: 'gym', progression: DOUBLE,
    days: [
      { label: 'Fitness A', slots: [s('goblet-squat', 3, 10, 12, 90), s('push-up', 3, 8, 15, 90), s('db-row', 3, 10, 12, 90), s('kb-swing', 3, 10, 15, 90), s('plank', 2, 30, 45, 60), s('rower', 1, 300, 600, 60)] },
      { label: 'Fitness B', slots: [s('db-rdl', 3, 10, 12, 90), s('db-shoulder-press', 3, 10, 12, 90), s('lat-pulldown', 3, 10, 12, 90), s('reverse-lunge', 2, 8, 12, 90), s('pallof-press', 2, 10, 12, 60), s('bike', 1, 300, 600, 60)] },
    ],
  },
  {
    id: 'strength-cardio', name: 'Strength + Cardio', summary: 'Three lifts and 15–20 minutes of steady cardio each session.',
    goal: 'general', level: 'intermediate', daysPerWeek: 3, minutes: 60, equipment: 'gym', progression: DOUBLE,
    days: [
      { label: 'Lift + Bike', slots: [s('bb-squat', 3, 5, 8, HVY), s('db-bench', 3, 6, 10, MOD), s('seated-cable-row', 3, 8, 12, MOD), s('bike', 1, 900, 1200, 60)] },
      { label: 'Lift + Row', slots: [s('rdl', 3, 6, 8, HVY), s('bb-ohp', 3, 6, 8, HVY), s('lat-pulldown', 3, 8, 12, MOD), s('rower', 1, 900, 1200, 60)] },
    ],
  },
  {
    id: 'minimal-equipment', name: 'Minimal Equipment', summary: 'Dumbbells and a bench — enough for real progress.',
    goal: 'general', level: 'intermediate', daysPerWeek: 3, minutes: 45, equipment: 'dumbbells', progression: DOUBLE,
    days: [
      { label: 'Day A', slots: [s('bulgarian-split', 3, 8, 12, MOD), s('db-bench', 3, 8, 12, MOD), s('db-row', 3, 8, 12, MOD), s('single-leg-rdl', 2, 8, 12, MOD), s('lateral-raise', 2, 12, 20, ISO, 1), s('farmer-carry', 2, 30, 60, 60)] },
      { label: 'Day B', slots: [s('goblet-squat', 3, 10, 15, MOD), s('db-shoulder-press', 3, 8, 12, MOD), s('db-row', 3, 10, 12, MOD), s('db-rdl', 3, 8, 12, MOD), s('db-curl', 2, 10, 15, ISO, 1), s('db-overhead-ext', 2, 10, 15, ISO, 1)] },
    ],
  },

  /* ---------------------------- time-constrained ------------------------- */
  {
    id: 'express-20', name: '20-Minute Workouts', summary: 'Three supersetted lifts, short rests. Dumbbells only.',
    goal: 'general', level: 'beginner', daysPerWeek: 3, minutes: 20, equipment: 'dumbbells', progression: DOUBLE,
    days: [
      { label: 'Express A', slots: [s('goblet-squat', 3, 8, 12, 60, 2, 'A'), s('db-bench', 3, 8, 12, 60, 2, 'A'), s('db-row', 3, 8, 12, 60)] },
      { label: 'Express B', slots: [s('db-rdl', 3, 8, 12, 60, 2, 'A'), s('db-shoulder-press', 3, 8, 12, 60, 2, 'A'), s('split-squat', 2, 8, 12, 60)] },
    ],
  },
  {
    id: 'express-30', name: '30-Minute Workouts', summary: 'Four lifts in two supersets. Gym.',
    goal: 'hypertrophy', level: 'beginner', daysPerWeek: 3, minutes: 30, equipment: 'gym', progression: DOUBLE,
    days: [
      { label: 'Express A', slots: [s('leg-press', 3, 8, 12, 75, 2, 'A'), s('lat-pulldown', 3, 8, 12, 75, 2, 'A'), s('machine-chest-press', 3, 8, 12, 75, 2, 'B'), s('leg-curl', 3, 10, 15, 75, 1, 'B')] },
      { label: 'Express B', slots: [s('hack-squat', 3, 8, 12, 75, 2, 'A'), s('db-shoulder-press', 3, 8, 12, 75, 2, 'A'), s('seated-cable-row', 3, 8, 12, 75, 2, 'B'), s('hip-thrust', 3, 8, 12, 75, 2, 'B')] },
    ],
  },

  /* ---------------------------- equipment-based -------------------------- */
  {
    id: 'bodyweight-only', name: 'Bodyweight Only', summary: 'Harder bodyweight work for when there is no gym. Add a band or pull-up bar to train your back properly.',
    goal: 'general', level: 'intermediate', daysPerWeek: 3, minutes: 35, equipment: 'bodyweight', progression: BODYWEIGHT,
    days: [
      { label: 'Bodyweight A', slots: [s('split-squat', 3, 8, 15, 75), s('push-up', 3, 8, 20, 75), s('prone-yt', 3, 10, 15, 60), s('sl-calf-raise', 3, 10, 20, 60), s('side-plank', 2, 20, 45, 45)] },
      { label: 'Bodyweight B', slots: [s('reverse-lunge', 3, 8, 15, 75), s('pike-push-up', 3, 5, 12, 75), s('glute-bridge', 3, 12, 20, 60), s('dead-bug', 3, 8, 12, 45), s('mountain-climber', 3, 20, 40, 45)] },
    ],
  },
  {
    id: 'band-only', name: 'Resistance Band', summary: 'A set of bands and a door anchor.',
    goal: 'general', level: 'beginner', daysPerWeek: 3, minutes: 35, equipment: 'bands', progression: BODYWEIGHT,
    days: [
      { label: 'Band A', slots: [s('bw-squat', 3, 12, 20, 60), s('band-chest-press', 3, 10, 15, 60), s('band-row', 3, 10, 15, 60), s('band-lateral-raise', 2, 12, 20, 45), s('glute-bridge', 3, 12, 20, 60), s('band-curl', 2, 12, 15, 45)] },
      { label: 'Band B', slots: [s('split-squat', 3, 8, 12, 60), s('band-ohp', 3, 10, 15, 60), s('band-pulldown', 3, 10, 15, 60), s('band-pull-apart', 2, 15, 20, 45), s('band-pushdown', 2, 12, 15, 45), s('dead-bug', 2, 6, 10, 45)] },
    ],
  },
  {
    id: 'home-gym', name: 'Home Gym Upper/Lower', summary: 'Barbell, rack, bench, dumbbells and a pull-up bar.',
    goal: 'hypertrophy', level: 'intermediate', daysPerWeek: 4, minutes: 60, equipment: 'home', progression: DOUBLE,
    days: [
      { label: 'Upper A', slots: [s('bb-bench', 4, 6, 10, HVY), s('pull-up', 3, 5, 10, HVY), s('db-shoulder-press', 3, 8, 12, MOD), s('db-row', 3, 8, 12, MOD), s('db-curl', 2, 10, 12, ISO, 1), s('db-overhead-ext', 2, 10, 12, ISO, 1)] },
      { label: 'Lower A', slots: [s('bb-squat', 3, 6, 10, HVY), s('rdl', 3, 8, 10, HVY), s('bulgarian-split', 2, 8, 12, MOD), s('sl-calf-raise', 3, 10, 15, ISO, 1), s('knee-raise', 3, 8, 15, ISO, 1)] },
      { label: 'Upper B', slots: [s('bb-ohp', 3, 6, 10, HVY), s('chin-up', 3, 5, 10, HVY), s('db-incline', 4, 8, 12, MOD), s('inverted-row', 3, 8, 12, MOD), s('lateral-raise', 3, 12, 20, ISO, 1), s('db-overhead-ext', 2, 10, 15, ISO, 1, 'A'), s('hammer-curl', 2, 10, 15, ISO, 1, 'A')] },
      { label: 'Lower B', slots: [s('bb-deadlift', 3, 3, 6, STR), s('goblet-squat', 3, 10, 12, MOD), s('single-leg-rdl', 2, 8, 12, MOD), s('glute-bridge', 3, 10, 15, ISO, 1), s('sl-calf-raise', 2, 10, 15, ISO, 1), s('plank', 2, 30, 45, 60)] },
    ],
  },
];
