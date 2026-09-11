/**
 * Exercise catalogue types. PURE — the engine and node tests import this directly.
 * Everything a coach would tell you about a lift lives on its entry; the DB only
 * stores what logging needs (id, name, load type, step, muscles).
 */

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'band' | 'smith';
/** Things an exercise needs besides its main implement. */
export type Accessory = 'bench' | 'rack' | 'pullup_bar' | 'dip_station' | 'box' | 'cardio_machine';

export type Pattern =
  | 'squat' | 'lunge' | 'hinge' | 'hip_extension'
  | 'horizontal_push' | 'vertical_push' | 'horizontal_pull' | 'vertical_pull'
  | 'fly' | 'shoulder_isolation' | 'shrug' | 'elbow_flexion' | 'elbow_extension' | 'wrist'
  | 'knee_extension' | 'knee_flexion' | 'hip_abduction' | 'hip_adduction' | 'calf'
  | 'core_flexion' | 'core_stability' | 'carry' | 'conditioning';

export type Level = 'beginner' | 'intermediate' | 'advanced';

/** Body areas a user can voluntarily flag; exercises that load them are avoided. Not medical advice. */
export type Stress = 'knees' | 'lowerBack' | 'shoulders' | 'wrists' | 'impact';

export type Muscle =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'forearms' | 'traps'
  | 'abs' | 'obliques' | 'lowerBack' | 'quads' | 'hamstrings' | 'glutes' | 'adductors' | 'calves';

export interface CatalogExercise {
  id: string;
  name: string;
  /** Other names people search for. */
  aka?: readonly string[];
  equipment: Equipment;
  needs?: readonly Accessory[];
  /** Default smallest load jump in kg (the user's gym inventory refines it). */
  loadStep: number;
  primary: readonly Muscle[];
  secondary?: readonly Muscle[];
  pattern: Pattern;
  compound: boolean;
  level: Level;
  unilateral?: boolean;
  /** 'time' = the set is logged in seconds (planks, carries, cardio). */
  measure?: 'reps' | 'time';
  stress?: readonly Stress[];
  /** Demo pattern names (features/exercises/demo.ts), first = default view. "name:prop" overrides the implement. */
  demo?: readonly string[];
  setup: string;
  steps: readonly string[];
  mistakes: readonly string[];
  safety?: string;
  /** Regressions / progressions and hand-picked alternatives, by id. */
  easier?: readonly string[];
  harder?: readonly string[];
  alts?: readonly string[];
}

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  traps: 'Traps',
  abs: 'Abs',
  obliques: 'Obliques',
  lowerBack: 'Lower back',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  adductors: 'Adductors',
  calves: 'Calves',
};

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell',
  band: 'Band',
  smith: 'Smith machine',
};
