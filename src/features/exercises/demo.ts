/**
 * Exercise demonstrations: a minimal stick figure moving between two poses, drawn in
 * the app from joint angles — no image assets, nothing to license, a few KB total.
 *
 * Open exercise-media sets were checked first (free-exercise-db, wger, exercises-
 * dataset, anatome): the photos/GIFs are unlicensed, of unverified origin, or
 * explicitly not cleared for redistribution. Real artwork can be added later by
 * returning an image from `demoViews()` — nothing else depends on this module.
 *
 * Angles are degrees: 0 = up, 90 = forward (right), 180 = down, 270 = back.
 * Each segment angle is absolute, measured from its proximal joint. Optional
 * `*Scale` values shorten a segment to show it pointing toward the viewer (front views).
 */
import { CATALOG_BY_ID } from '@/data/catalog';

export interface Pose {
  /** Either the hip or the ankle is pinned; the rest is solved from angles. */
  hip?: readonly [number, number];
  ankle?: readonly [number, number];
  torso: number;
  thigh: number;
  shin: number;
  foot?: number;
  upperArm: number;
  forearm: number;
  /** A second leg (side view): lunges, walking, bird dog. */
  thigh2?: number;
  shin2?: number;
  /** Shoulder elevation in px — shrugs. */
  lift?: number;
  torsoScale?: number;
  thighScale?: number;
  shinScale?: number;
  upperArmScale?: number;
  forearmScale?: number;
}

/** `bar` = a bar across both hands without plates (front views). */
export type Prop = 'barbell' | 'barOnBack' | 'dumbbell' | 'bar' | 'none';

export interface DemoPattern {
  view: 'side' | 'front';
  a: Pose;
  b: Pose;
  prop: Prop;
  /** Cable anchor; a line is drawn from the hand to it. */
  anchor?: readonly [number, number];
  /** Static lines: bench, bar, seat, box. */
  scenery?: readonly (readonly [number, number, number, number])[];
}

const STAND: Pose = { ankle: [58, 108], torso: 0, thigh: 180, shin: 180, foot: 90, upperArm: 180, forearm: 180 };
/** Front view: feet a little apart. */
const STAND_F: Pose = { ankle: [58, 108], torso: 0, thigh: 174, shin: 180, upperArm: 174, forearm: 178 };
const HANG: Pose = { hip: [60, 62], torso: 0, thigh: 182, shin: 200, upperArm: 0, forearm: 0 };
const BAR_TOP = [38, -2, 82, -2] as const;
const QUADRUPED: Pose = { hip: [62, 78], torso: 90, thigh: 180, shin: 270, foot: 270, upperArm: 180, forearm: 180, thigh2: 180, shin2: 270 };

export const PATTERNS = {
  /* ------------------------------ lower body ----------------------------- */
  squat: {
    view: 'side', prop: 'barOnBack',
    a: { ...STAND, upperArm: 200, forearm: 340 },
    b: { ...STAND, thigh: 100, shin: 205, torso: 40, upperArm: 235, forearm: 15 },
  },
  squatFront: {
    view: 'front', prop: 'none',
    a: { ...STAND_F, upperArm: 176, forearm: 178 },
    b: { ...STAND_F, thigh: 135, thighScale: 0.5, shin: 195, torsoScale: 0.9, upperArm: 176, forearm: 180, upperArmScale: 0.45, forearmScale: 0.45 },
  },
  hinge: {
    view: 'side', prop: 'barbell',
    a: STAND,
    b: { ...STAND, torso: 80, thigh: 150, shin: 185, upperArm: 190, forearm: 190 },
  },
  hingeSwing: {
    view: 'side', prop: 'dumbbell',
    a: { ...STAND, torso: 72, thigh: 158, shin: 186, upperArm: 205, forearm: 205 },
    b: { ...STAND, upperArm: 90, forearm: 90 },
  },
  lunge: {
    view: 'side', prop: 'dumbbell',
    a: { ankle: [72, 108], torso: 0, thigh: 170, shin: 185, foot: 90, thigh2: 200, shin2: 250, upperArm: 180, forearm: 180 },
    b: { ankle: [72, 108], torso: 10, thigh: 100, shin: 195, foot: 90, thigh2: 185, shin2: 328, upperArm: 180, forearm: 180 },
    scenery: [[18, 92, 44, 92], [24, 92, 24, 112]],
  },
  stepUp: {
    view: 'side', prop: 'dumbbell',
    a: { hip: [48, 60], torso: 5, thigh: 175, shin: 185, foot: 90, thigh2: 115, shin2: 180, upperArm: 180, forearm: 180 },
    b: { hip: [72, 44], torso: 5, thigh: 190, shin: 230, foot: 120, thigh2: 180, shin2: 180, upperArm: 180, forearm: 180 },
    scenery: [[62, 97, 100, 97], [62, 97, 62, 112], [100, 97, 100, 112]],
  },
  hipThrust: {
    view: 'side', prop: 'barbell',
    a: { hip: [62, 94], torso: 300, thigh: 60, shin: 175, foot: 90, upperArm: 110, forearm: 90 },
    b: { hip: [60, 78], torso: 272, thigh: 88, shin: 178, foot: 90, upperArm: 95, forearm: 95 },
    scenery: [[8, 82, 36, 82], [14, 82, 14, 112]],
  },
  bridge: {
    view: 'side', prop: 'none',
    a: { hip: [66, 106], torso: 270, thigh: 50, shin: 168, foot: 90, upperArm: 95, forearm: 90 },
    b: { hip: [66, 88], torso: 243, thigh: 78, shin: 175, foot: 90, upperArm: 100, forearm: 95 },
  },
  legPress: {
    view: 'side', prop: 'none',
    a: { hip: [44, 86], torso: 300, thigh: 40, shin: 120, foot: 30, upperArm: 150, forearm: 90 },
    b: { hip: [44, 86], torso: 300, thigh: 62, shin: 62, foot: 330, upperArm: 150, forearm: 90 },
    scenery: [[46, 93, 12, 73], [30, 112, 46, 93]],
  },
  legExtension: {
    view: 'side', prop: 'none',
    a: { hip: [50, 76], torso: 350, thigh: 88, shin: 180, foot: 90, upperArm: 170, forearm: 150 },
    b: { hip: [50, 76], torso: 350, thigh: 88, shin: 92, foot: 0, upperArm: 170, forearm: 150 },
    scenery: [[34, 81, 72, 81], [40, 81, 40, 112], [40, 81, 35, 44]],
  },
  legCurl: {
    view: 'side', prop: 'none',
    a: { hip: [62, 78], torso: 270, thigh: 90, shin: 90, foot: 180, upperArm: 240, forearm: 180 },
    b: { hip: [62, 78], torso: 270, thigh: 90, shin: 15, foot: 100, upperArm: 240, forearm: 180 },
    scenery: [[8, 84, 100, 84], [16, 84, 16, 112], [92, 84, 92, 112]],
  },
  seatedLegCurl: {
    view: 'side', prop: 'none',
    a: { hip: [50, 76], torso: 350, thigh: 88, shin: 95, foot: 0, upperArm: 170, forearm: 150 },
    b: { hip: [50, 76], torso: 350, thigh: 88, shin: 195, foot: 90, upperArm: 170, forearm: 150 },
    scenery: [[34, 81, 72, 81], [40, 81, 40, 112], [40, 81, 35, 44]],
  },
  backExtension: {
    view: 'side', prop: 'none',
    a: { hip: [60, 70], torso: 130, thigh: 235, shin: 235, foot: 145, upperArm: 180, forearm: 20 },
    b: { hip: [60, 70], torso: 55, thigh: 235, shin: 235, foot: 145, upperArm: 110, forearm: 330 },
    scenery: [[52, 78, 70, 64], [12, 104, 24, 96]],
  },
  calfRaise: {
    view: 'side', prop: 'none',
    a: STAND,
    b: { ...STAND, ankle: [59, 100.5], foot: 150 },
  },

  /* ------------------------------ upper body ----------------------------- */
  benchPress: {
    view: 'side', prop: 'barbell',
    a: { hip: [72, 80], torso: 270, thigh: 105, shin: 170, foot: 90, upperArm: 150, forearm: 5 },
    b: { hip: [72, 80], torso: 270, thigh: 105, shin: 170, foot: 90, upperArm: 0, forearm: 0 },
    scenery: [[24, 87, 84, 87], [30, 87, 30, 112], [78, 87, 78, 112]],
  },
  fly: {
    view: 'front', prop: 'dumbbell',
    a: { ...STAND_F, upperArm: 95, forearm: 100 },
    b: { ...STAND_F, upperArm: 140, forearm: 230 },
  },
  pushUp: {
    view: 'side', prop: 'none',
    a: { ankle: [100, 104], torso: 277, thigh: 97, shin: 97, foot: 120, upperArm: 70, forearm: 200 },
    b: { ankle: [100, 104], torso: 295, thigh: 115, shin: 115, foot: 120, upperArm: 175, forearm: 175 },
  },
  pikePushUp: {
    view: 'side', prop: 'none',
    a: { ankle: [96, 108], torso: 235, thigh: 160, shin: 160, foot: 110, upperArm: 200, forearm: 200 },
    b: { ankle: [96, 108], torso: 215, thigh: 160, shin: 160, foot: 110, upperArm: 250, forearm: 170 },
  },
  dip: {
    view: 'side', prop: 'none',
    a: { hip: [58, 70], torso: 12, thigh: 175, shin: 220, upperArm: 245, forearm: 175 },
    b: { hip: [58, 52], torso: 12, thigh: 175, shin: 220, upperArm: 185, forearm: 180 },
    scenery: [[36, 60, 80, 60]],
  },
  overheadPress: {
    view: 'side', prop: 'barbell',
    a: { ...STAND, upperArm: 150, forearm: 355 },
    b: { ...STAND, upperArm: 5, forearm: 0 },
  },
  pressFront: {
    view: 'front', prop: 'barbell',
    a: { ...STAND_F, upperArm: 105, forearm: 5 },
    b: { ...STAND_F, upperArm: 15, forearm: 3 },
  },
  lateralRaise: {
    view: 'front', prop: 'dumbbell',
    a: { ...STAND_F, upperArm: 172, forearm: 175 },
    b: { ...STAND_F, upperArm: 95, forearm: 95 },
  },
  bandPullApart: {
    view: 'front', prop: 'none',
    a: { ...STAND_F, upperArm: 125, forearm: 125, upperArmScale: 0.35, forearmScale: 0.35 },
    b: { ...STAND_F, upperArm: 90, forearm: 90 },
  },
  shrug: {
    view: 'front', prop: 'dumbbell',
    a: { ...STAND_F, upperArm: 176, forearm: 180 },
    b: { ...STAND_F, upperArm: 176, forearm: 180, lift: 6 },
  },
  facePull: {
    view: 'side', prop: 'none', anchor: [114, 20],
    a: { ...STAND, upperArm: 85, forearm: 85 },
    b: { ...STAND, upperArm: 265, forearm: 40 },
  },
  pullUp: {
    view: 'side', prop: 'none',
    a: HANG,
    b: { ...HANG, hip: [60, 30], upperArm: 175, forearm: 355 },
    scenery: [BAR_TOP],
  },
  pullFront: {
    view: 'front', prop: 'bar',
    a: { ...STAND_F, upperArm: 25, forearm: 12 },
    b: { ...STAND_F, upperArm: 120, forearm: 350 },
  },
  pulldown: {
    view: 'side', prop: 'none', anchor: [54, -18],
    a: { hip: [56, 80], torso: 350, thigh: 90, shin: 180, foot: 90, upperArm: 5, forearm: 5 },
    b: { hip: [56, 80], torso: 350, thigh: 90, shin: 180, foot: 90, upperArm: 175, forearm: 5 },
    scenery: [[40, 85, 70, 85], [56, 85, 56, 112]],
  },
  bentRow: {
    view: 'side', prop: 'barbell',
    a: { ...STAND, torso: 70, thigh: 160, shin: 185 },
    b: { ...STAND, torso: 70, thigh: 160, shin: 185, upperArm: 235, forearm: 175 },
  },
  invertedRow: {
    view: 'side', prop: 'none',
    a: { ankle: [104, 110], torso: 288, thigh: 108, shin: 108, foot: 20, upperArm: 0, forearm: 360 },
    b: { ankle: [104, 110], torso: 300, thigh: 120, shin: 120, foot: 30, upperArm: 28, forearm: 278 },
    scenery: [[8, 50, 44, 50]],
  },
  seatedRow: {
    view: 'side', prop: 'none', anchor: [114, 66],
    a: { hip: [48, 84], torso: 355, thigh: 85, shin: 95, foot: 5, upperArm: 95, forearm: 90 },
    b: { hip: [48, 84], torso: 355, thigh: 85, shin: 95, foot: 5, upperArm: 215, forearm: 90 },
    scenery: [[30, 89, 62, 89], [104, 70, 104, 96]],
  },
  straightArmPulldown: {
    view: 'side', prop: 'none', anchor: [110, -16],
    a: { ...STAND, torso: 15, upperArm: 45, forearm: 45 },
    b: { ...STAND, torso: 15, upperArm: 175, forearm: 175 },
  },
  curl: {
    view: 'side', prop: 'dumbbell',
    a: STAND,
    b: { ...STAND, upperArm: 170, forearm: 20 },
  },
  pushdown: {
    view: 'side', prop: 'none', anchor: [76, -16],
    a: { ...STAND, forearm: 60 },
    b: STAND,
  },
  overheadExt: {
    view: 'side', prop: 'dumbbell',
    a: { ...STAND, upperArm: 0, forearm: 200 },
    b: { ...STAND, upperArm: 0, forearm: 360 },
  },
  wristCurl: {
    view: 'side', prop: 'dumbbell',
    a: { hip: [52, 84], torso: 5, thigh: 90, shin: 180, foot: 90, upperArm: 160, forearm: 100 },
    b: { hip: [52, 84], torso: 5, thigh: 90, shin: 180, foot: 90, upperArm: 160, forearm: 70 },
    scenery: [[36, 89, 64, 89], [44, 89, 44, 112]],
  },

  /* --------------------------------- core -------------------------------- */
  crunch: {
    view: 'side', prop: 'none', anchor: [70, -16],
    a: { hip: [60, 80], torso: 10, thigh: 180, shin: 270, foot: 180, upperArm: 30, forearm: 200 },
    b: { hip: [60, 80], torso: 100, thigh: 180, shin: 270, foot: 180, upperArm: 120, forearm: 300 },
  },
  hangingLegRaise: {
    view: 'side', prop: 'none',
    a: { ...HANG, thigh: 180, shin: 180 },
    b: { ...HANG, thigh: 90, shin: 90 },
    scenery: [BAR_TOP],
  },
  plank: {
    view: 'side', prop: 'none',
    a: { ankle: [100, 108], torso: 284, thigh: 104, shin: 104, foot: 120, upperArm: 180, forearm: 270 },
    b: { ankle: [100, 108], torso: 283, thigh: 103, shin: 103, foot: 120, upperArm: 180, forearm: 270 },
  },
  deadBug: {
    view: 'side', prop: 'none',
    a: { hip: [64, 104], torso: 270, thigh: 0, shin: 90, foot: 0, upperArm: 360, forearm: 360, thigh2: 0, shin2: 90 },
    b: { hip: [64, 104], torso: 270, thigh: 80, shin: 85, foot: 0, upperArm: 290, forearm: 285, thigh2: 0, shin2: 90 },
  },
  abWheel: {
    view: 'side', prop: 'dumbbell',
    a: { hip: [60, 84], torso: 55, thigh: 180, shin: 270, foot: 270, upperArm: 175, forearm: 175 },
    b: { hip: [47, 87.5], torso: 85, thigh: 150, shin: 270, foot: 270, upperArm: 115, forearm: 110 },
  },
  pallof: {
    view: 'side', prop: 'none', anchor: [114, 44],
    a: { ...STAND, upperArm: 160, forearm: 60 },
    b: { ...STAND, upperArm: 90, forearm: 90 },
  },
  birdDog: {
    view: 'side', prop: 'none',
    a: QUADRUPED,
    b: { ...QUADRUPED, upperArm: 90, forearm: 90, thigh2: 270, shin2: 270 },
  },

  /* --------------------------- carries & cardio -------------------------- */
  carry: {
    view: 'side', prop: 'dumbbell',
    a: { hip: [58, 58], torso: 0, thigh: 165, shin: 180, foot: 90, thigh2: 195, shin2: 200, upperArm: 180, forearm: 180 },
    b: { hip: [58, 58], torso: 0, thigh: 195, shin: 200, foot: 90, thigh2: 165, shin2: 180, upperArm: 180, forearm: 180 },
  },
  walk: {
    view: 'side', prop: 'none',
    a: { hip: [58, 58], torso: 5, thigh: 162, shin: 180, foot: 90, thigh2: 198, shin2: 205, upperArm: 200, forearm: 200 },
    b: { hip: [58, 58], torso: 5, thigh: 198, shin: 205, foot: 90, thigh2: 162, shin2: 180, upperArm: 160, forearm: 150 },
  },
  bike: {
    view: 'side', prop: 'none',
    a: { hip: [48, 66], torso: 35, thigh: 70, shin: 175, foot: 90, thigh2: 120, shin2: 190, upperArm: 115, forearm: 95 },
    b: { hip: [48, 66], torso: 35, thigh: 120, shin: 190, foot: 90, thigh2: 70, shin2: 175, upperArm: 115, forearm: 95 },
    scenery: [[38, 70, 56, 70], [48, 70, 72, 108], [86, 50, 94, 50], [90, 50, 72, 108]],
  },
  rower: {
    view: 'side', prop: 'none', anchor: [112, 92],
    a: { hip: [72, 96], torso: 40, thigh: 45, shin: 150, foot: 60, upperArm: 90, forearm: 90 },
    b: { hip: [50, 96], torso: -20, thigh: 88, shin: 92, foot: 30, upperArm: 200, forearm: 85 },
    scenery: [[28, 102, 112, 102]],
  },
  mountainClimber: {
    view: 'side', prop: 'none',
    a: { ankle: [100, 104], torso: 295, thigh: 115, shin: 115, foot: 120, upperArm: 175, forearm: 175, thigh2: 240, shin2: 120 },
    b: { ankle: [100, 104], torso: 295, thigh: 115, shin: 115, foot: 120, upperArm: 175, forearm: 175, thigh2: 115, shin2: 115 },
  },
  jumpingJack: {
    view: 'front', prop: 'none',
    a: { ...STAND_F, thigh: 178, shin: 180, upperArm: 175, forearm: 178 },
    b: { ...STAND_F, thigh: 160, shin: 165, upperArm: 20, forearm: 10 },
  },

  /* ------------------------------- mobility ------------------------------ */
  legSwing: {
    view: 'side', prop: 'none',
    a: { ...STAND, thigh2: 140, shin2: 140 },
    b: { ...STAND, thigh2: 215, shin2: 215 },
  },
  armCircles: {
    view: 'front', prop: 'none',
    a: { ...STAND_F, upperArm: 60, forearm: 60 },
    b: { ...STAND_F, upperArm: 120, forearm: 120 },
  },
} satisfies Record<string, DemoPattern>;

export type PatternName = keyof typeof PATTERNS;

/** Fallback when an exercise has no demo of its own (custom exercises). */
const BY_MUSCLE: Record<string, PatternName> = {
  chest: 'benchPress', back: 'bentRow', lowerBack: 'backExtension', shoulders: 'pressFront', traps: 'shrug', biceps: 'curl', triceps: 'pushdown',
  forearms: 'wristCurl', quads: 'squatFront', hamstrings: 'hinge', glutes: 'bridge', adductors: 'squatFront', calves: 'calfRaise', abs: 'crunch', obliques: 'pallof',
};

function resolve(spec: string): DemoPattern | null {
  const [name, prop] = spec.split(':');
  const base = (PATTERNS as Record<string, DemoPattern>)[name ?? ''];
  if (!base) return null;
  return prop ? { ...base, prop: prop as Prop } : base;
}

export interface DemoView {
  label: string;
  pattern: DemoPattern;
}

/** The demo views for an exercise, default first ("Side", "Front"). */
export function demoViews(ex: { id: string; primaryMuscles: readonly string[] }): DemoView[] {
  const specs = CATALOG_BY_ID.get(ex.id)?.demo ?? [BY_MUSCLE[ex.primaryMuscles[0] ?? ''] ?? 'squat'];
  const views = specs.map(resolve).filter((p): p is DemoPattern => p !== null);
  const list = views.length ? views : [PATTERNS.squat];
  return list.map((pattern) => ({ label: pattern.view === 'front' ? 'Front' : 'Side', pattern }));
}

export function demoFor(ex: { id: string; primaryMuscles: readonly string[] }): DemoPattern {
  return demoViews(ex)[0]?.pattern ?? PATTERNS.squat;
}

/** A drill's demo, if it has one. */
export function drillDemo(spec: string | undefined): DemoPattern | null {
  return spec ? resolve(spec) : null;
}

/* ================================ solver ================================= */

const LEN = { shin: 26, thigh: 26, torso: 32, upperArm: 18, forearm: 16, foot: 9, head: 10, shoulderHalf: 9, hipHalf: 5 };
export const SEGMENTS = 12;
const HIDDEN = -100;

/** Which body part each of the 12 segments draws, per view — used to colour muscles. */
export type BodyPart = 'torso' | 'upperArm' | 'forearm' | 'thigh' | 'shin' | 'foot' | 'shoulders' | 'hips' | 'none';
export const SIDE_PARTS: readonly BodyPart[] = ['torso', 'upperArm', 'forearm', 'thigh', 'shin', 'foot', 'thigh', 'shin', 'none', 'none', 'none', 'none'];
export const FRONT_PARTS: readonly BodyPart[] = ['torso', 'upperArm', 'forearm', 'thigh', 'shin', 'upperArm', 'forearm', 'thigh', 'shin', 'shoulders', 'hips', 'none'];
export const PART_MUSCLES: Record<BodyPart, readonly string[]> = {
  torso: ['chest', 'back', 'abs', 'obliques', 'lowerBack', 'traps'],
  shoulders: ['shoulders', 'traps'],
  upperArm: ['shoulders', 'biceps', 'triceps'],
  forearm: ['forearms'],
  thigh: ['quads', 'hamstrings', 'glutes', 'adductors'],
  shin: ['calves'],
  hips: ['glutes'],
  foot: [],
  none: [],
};

/**
 * Frame at t∈[0,1]: 12 segments × (x1,y1,x2,y2), then head (x,y), then two prop
 * points (hands). Runs on the UI thread every frame.
 */
export function solveFrame(p: DemoPattern, t: number): number[] {
  'worklet';
  const D = Math.PI / 180;
  const A = p.a;
  const B = p.b;
  const mix = (x: number, y: number) => x + (y - x) * t;
  const torso = mix(A.torso, B.torso);
  const thigh = mix(A.thigh, B.thigh);
  const shin = mix(A.shin, B.shin);
  const foot = mix(A.foot ?? 90, B.foot ?? 90);
  const upperArm = mix(A.upperArm, B.upperArm);
  const forearm = mix(A.forearm, B.forearm);
  const lift = mix(A.lift ?? 0, B.lift ?? 0);
  const lTorso = LEN.torso * mix(A.torsoScale ?? 1, B.torsoScale ?? 1);
  const lThigh = LEN.thigh * mix(A.thighScale ?? 1, B.thighScale ?? 1);
  const lShin = LEN.shin * mix(A.shinScale ?? 1, B.shinScale ?? 1);
  const lUpper = LEN.upperArm * mix(A.upperArmScale ?? 1, B.upperArmScale ?? 1);
  const lFore = LEN.forearm * mix(A.forearmScale ?? 1, B.forearmScale ?? 1);
  const vx = (a: number, l: number) => Math.sin(a * D) * l;
  const vy = (a: number, l: number) => -Math.cos(a * D) * l;

  let hx: number;
  let hy: number;
  if (A.hip && B.hip) {
    hx = mix(A.hip[0], B.hip[0]);
    hy = mix(A.hip[1], B.hip[1]);
  } else {
    const ax = mix(A.ankle?.[0] ?? 60, B.ankle?.[0] ?? 60);
    const ay = mix(A.ankle?.[1] ?? 108, B.ankle?.[1] ?? 108);
    // Front view: the anchor is the centre between the feet.
    hx = p.view === 'front' ? ax : ax - vx(shin, lShin) - vx(thigh, lThigh);
    hy = ay - vy(shin, lShin) - vy(thigh, lThigh);
  }
  const sx = hx + vx(torso, lTorso);
  const sy = hy + vy(torso, lTorso) - lift;
  const headX = sx + vx(torso, LEN.head);
  const headY = sy + vy(torso, LEN.head) - (p.view === 'front' ? 0 : 0);
  const out: number[] = [];
  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    out.push(x1, y1, x2, y2);
  };
  const hide = () => {
    out.push(HIDDEN, HIDDEN, HIDDEN, HIDDEN);
  };

  if (p.view === 'side') {
    const kx = hx + vx(thigh, lThigh);
    const ky = hy + vy(thigh, lThigh);
    const ax = kx + vx(shin, lShin);
    const ay = ky + vy(shin, lShin);
    const ex = sx + vx(upperArm, lUpper);
    const ey = sy + vy(upperArm, lUpper);
    const handX = ex + vx(forearm, lFore);
    const handY = ey + vy(forearm, lFore);
    seg(hx, hy, sx, sy);
    seg(sx, sy, ex, ey);
    seg(ex, ey, handX, handY);
    seg(hx, hy, kx, ky);
    seg(kx, ky, ax, ay);
    seg(ax, ay, ax + vx(foot, LEN.foot), ay + vy(foot, LEN.foot));
    if (A.thigh2 !== undefined && B.thigh2 !== undefined) {
      const t2 = mix(A.thigh2, B.thigh2);
      const s2 = mix(A.shin2 ?? 180, B.shin2 ?? 180);
      const k2x = hx + vx(t2, LEN.thigh);
      const k2y = hy + vy(t2, LEN.thigh);
      seg(hx, hy, k2x, k2y);
      seg(k2x, k2y, k2x + vx(s2, LEN.shin), k2y + vy(s2, LEN.shin));
    } else {
      hide();
      hide();
    }
    for (let i = 8; i < SEGMENTS; i++) hide();
    const onBack = p.prop === 'barOnBack';
    out.push(headX, headY, onBack ? sx - 5 : handX, onBack ? sy - 1 : handY, HIDDEN, HIDDEN);
    return out;
  }

  // Front view: arms and legs mirrored about the torso line.
  const side = (dir: 1 | -1) => {
    const shX = sx + dir * LEN.shoulderHalf;
    const hipX = hx + dir * LEN.hipHalf;
    const ua = dir === 1 ? upperArm : 360 - upperArm;
    const fa = dir === 1 ? forearm : 360 - forearm;
    const th = dir === 1 ? thigh : 360 - thigh;
    const sh = dir === 1 ? shin : 360 - shin;
    const ex = shX + vx(ua, lUpper);
    const ey = sy + vy(ua, lUpper);
    const handX = ex + vx(fa, lFore);
    const handY = ey + vy(fa, lFore);
    const kx = hipX + vx(th, lThigh);
    const ky = hy + vy(th, lThigh);
    seg(shX, sy, ex, ey);
    seg(ex, ey, handX, handY);
    seg(hipX, hy, kx, ky);
    seg(kx, ky, kx + vx(sh, lShin), ky + vy(sh, lShin));
    return [handX, handY];
  };
  seg(hx, hy, sx, sy);
  const right = side(1);
  const left = side(-1);
  seg(sx - LEN.shoulderHalf, sy, sx + LEN.shoulderHalf, sy);
  seg(hx - LEN.hipHalf, hy, hx + LEN.hipHalf, hy);
  hide();
  out.push(headX, headY, right[0] ?? HIDDEN, right[1] ?? HIDDEN, left[0] ?? HIDDEN, left[1] ?? HIDDEN);
  return out;
}
