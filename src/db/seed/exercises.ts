/**
 * Exercise catalogue. `loadStep` is what HIS gym can actually load — adjust once
 * after the first session rather than guessing forever.
 * Barbell 2.5 kg (2× 1.25 plates) · dumbbells 2 kg rack jumps · cables/machines vary.
 */
export interface SeedExercise {
  id: string;
  name: string;
  loadType: 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';
  loadStep: number;
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  isUnilateral?: boolean;
}

export const EXERCISES: SeedExercise[] = [
  // ---- Horizontal push
  { id: 'bb-bench', name: 'Barbell Bench Press', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'shoulders'] },
  { id: 'db-bench', name: 'Dumbbell Bench Press', loadType: 'dumbbell', loadStep: 2, primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'shoulders'] },
  { id: 'db-incline', name: 'Incline Dumbbell Press', loadType: 'dumbbell', loadStep: 2, primaryMuscles: ['chest'], secondaryMuscles: ['shoulders', 'triceps'] },
  { id: 'machine-chest-press', name: 'Machine Chest Press', loadType: 'machine', loadStep: 5, primaryMuscles: ['chest'], secondaryMuscles: ['triceps'] },
  { id: 'cable-fly', name: 'Cable Fly', loadType: 'cable', loadStep: 2.5, primaryMuscles: ['chest'] },
  { id: 'dips', name: 'Dips', loadType: 'bodyweight', loadStep: 2.5, primaryMuscles: ['chest', 'triceps'] },

  // ---- Vertical push / shoulders (emphasis)
  { id: 'bb-ohp', name: 'Overhead Press', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['shoulders'], secondaryMuscles: ['triceps'] },
  { id: 'db-shoulder-press', name: 'Seated Dumbbell Shoulder Press', loadType: 'dumbbell', loadStep: 2, primaryMuscles: ['shoulders'], secondaryMuscles: ['triceps'] },
  { id: 'lateral-raise', name: 'Dumbbell Lateral Raise', loadType: 'dumbbell', loadStep: 2, primaryMuscles: ['shoulders'] },
  { id: 'cable-lateral', name: 'Cable Lateral Raise', loadType: 'cable', loadStep: 2.5, primaryMuscles: ['shoulders'], isUnilateral: true },
  { id: 'rear-delt-fly', name: 'Rear Delt Fly', loadType: 'dumbbell', loadStep: 2, primaryMuscles: ['shoulders'], secondaryMuscles: ['back'] },
  { id: 'face-pull', name: 'Face Pull', loadType: 'cable', loadStep: 2.5, primaryMuscles: ['shoulders'], secondaryMuscles: ['back', 'traps'] },

  // ---- Back (emphasis)
  { id: 'pull-up', name: 'Pull-Up', loadType: 'bodyweight', loadStep: 2.5, primaryMuscles: ['back'], secondaryMuscles: ['biceps'] },
  { id: 'lat-pulldown', name: 'Lat Pulldown', loadType: 'machine', loadStep: 5, primaryMuscles: ['back'], secondaryMuscles: ['biceps'] },
  { id: 'bb-row', name: 'Barbell Row', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['back'], secondaryMuscles: ['biceps', 'traps'] },
  { id: 'db-row', name: 'Single-Arm Dumbbell Row', loadType: 'dumbbell', loadStep: 2, primaryMuscles: ['back'], secondaryMuscles: ['biceps'], isUnilateral: true },
  { id: 'chest-supported-row', name: 'Chest-Supported Row', loadType: 'machine', loadStep: 5, primaryMuscles: ['back'], secondaryMuscles: ['traps', 'biceps'] },
  { id: 'seated-cable-row', name: 'Seated Cable Row', loadType: 'cable', loadStep: 2.5, primaryMuscles: ['back'], secondaryMuscles: ['biceps'] },
  { id: 'straight-arm-pulldown', name: 'Straight-Arm Pulldown', loadType: 'cable', loadStep: 2.5, primaryMuscles: ['back'] },

  // ---- Traps (emphasis)
  { id: 'bb-shrug', name: 'Barbell Shrug', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['traps'] },
  { id: 'db-shrug', name: 'Dumbbell Shrug', loadType: 'dumbbell', loadStep: 2, primaryMuscles: ['traps'] },

  // ---- Arms (emphasis)
  { id: 'bb-curl', name: 'Barbell Curl', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['biceps'] },
  { id: 'db-incline-curl', name: 'Incline Dumbbell Curl', loadType: 'dumbbell', loadStep: 2, primaryMuscles: ['biceps'] },
  { id: 'hammer-curl', name: 'Hammer Curl', loadType: 'dumbbell', loadStep: 2, primaryMuscles: ['biceps'] },
  { id: 'preacher-curl', name: 'Preacher Curl', loadType: 'machine', loadStep: 2.5, primaryMuscles: ['biceps'] },
  { id: 'cable-curl', name: 'Cable Curl', loadType: 'cable', loadStep: 2.5, primaryMuscles: ['biceps'] },
  { id: 'skullcrusher', name: 'EZ-Bar Skullcrusher', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['triceps'] },
  { id: 'cable-pushdown', name: 'Cable Triceps Pushdown', loadType: 'cable', loadStep: 2.5, primaryMuscles: ['triceps'] },
  { id: 'overhead-ext', name: 'Overhead Cable Extension', loadType: 'cable', loadStep: 2.5, primaryMuscles: ['triceps'] },

  // ---- Lower
  { id: 'bb-squat', name: 'Barbell Back Squat', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['quads'], secondaryMuscles: ['glutes'] },
  { id: 'hack-squat', name: 'Hack Squat', loadType: 'machine', loadStep: 5, primaryMuscles: ['quads'], secondaryMuscles: ['glutes'] },
  { id: 'leg-press', name: 'Leg Press', loadType: 'machine', loadStep: 5, primaryMuscles: ['quads'], secondaryMuscles: ['glutes'] },
  { id: 'bulgarian-split', name: 'Bulgarian Split Squat', loadType: 'dumbbell', loadStep: 2, primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], isUnilateral: true },
  { id: 'leg-extension', name: 'Leg Extension', loadType: 'machine', loadStep: 5, primaryMuscles: ['quads'] },
  { id: 'rdl', name: 'Romanian Deadlift', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['hamstrings'], secondaryMuscles: ['glutes', 'back'] },
  { id: 'leg-curl', name: 'Lying Leg Curl', loadType: 'machine', loadStep: 5, primaryMuscles: ['hamstrings'] },
  { id: 'seated-leg-curl', name: 'Seated Leg Curl', loadType: 'machine', loadStep: 5, primaryMuscles: ['hamstrings'] },
  { id: 'hip-thrust', name: 'Hip Thrust', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'] },
  { id: 'calf-raise', name: 'Standing Calf Raise', loadType: 'machine', loadStep: 5, primaryMuscles: ['calves'] },
  { id: 'seated-calf', name: 'Seated Calf Raise', loadType: 'machine', loadStep: 2.5, primaryMuscles: ['calves'] },

  { id: 'bb-deadlift', name: 'Deadlift', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['hamstrings', 'glutes'], secondaryMuscles: ['back', 'traps', 'quads'] },
  { id: 'goblet-squat', name: 'Goblet Squat', loadType: 'dumbbell', loadStep: 2, primaryMuscles: ['quads'], secondaryMuscles: ['glutes'] },
  { id: 'db-lunge', name: 'Dumbbell Walking Lunge', loadType: 'dumbbell', loadStep: 2, primaryMuscles: ['quads'], secondaryMuscles: ['glutes', 'hamstrings'], isUnilateral: true },
  { id: 'push-up', name: 'Push-Up', loadType: 'bodyweight', loadStep: 2.5, primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'shoulders'] },

  // ---- Core
  { id: 'cable-crunch', name: 'Cable Crunch', loadType: 'cable', loadStep: 2.5, primaryMuscles: ['abs'] },
  { id: 'hanging-leg-raise', name: 'Hanging Leg Raise', loadType: 'bodyweight', loadStep: 2.5, primaryMuscles: ['abs'] },
];

/** Plates and dumbbells available. Drives load rounding + the plate calculator. */
export const EQUIPMENT = [
  { kind: 'bar' as const, valueKg: 20, count: 1 },
  { kind: 'bar' as const, valueKg: 10, count: 1, machineName: 'EZ bar' },
  ...[25, 20, 15, 10, 5, 2.5, 1.25].map((v) => ({ kind: 'plate' as const, valueKg: v, count: 8 })),
  // Typical Indian commercial gym rack: 2 kg jumps to 30, then 5 kg
  ...Array.from({ length: 15 }, (_, i) => ({ kind: 'dumbbell' as const, valueKg: 2 + i * 2, count: 2 })),
  ...[35, 40, 45, 50].map((v) => ({ kind: 'dumbbell' as const, valueKg: v, count: 2 })),
];
