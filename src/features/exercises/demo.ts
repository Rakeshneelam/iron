/**
 * Exercise demonstrations: a side- or front-view stick figure that moves between two
 * poses. Drawn in-app from joint angles — no image assets, no third-party artwork,
 * nothing to license, a few KB in total.
 *
 * Why not a dataset: the open options checked (free-exercise-db, wger, everkinetic)
 * are photos or mixed-licence images with unclear provenance or share-alike terms.
 *
 * Adding real artwork later: give `demoFor()` a branch returning an image source for
 * an exercise id and render it in ExerciseInfoSheet — nothing else depends on this.
 *
 * Angles are degrees: 0 = up, 90 = forward (right), 180 = down, 270 = back.
 * Each segment's angle is absolute, measured from its proximal joint.
 */
import type { Exercise } from '@/db/repositories/exercises';

export interface Pose {
  /** Either the hip or the (front) ankle is pinned; the rest is solved from angles. */
  hip?: readonly [number, number];
  ankle?: readonly [number, number];
  torso: number;
  thigh: number;
  shin: number;
  foot?: number;
  upperArm: number;
  forearm: number;
  /** A second leg (side view) — lunges. */
  thigh2?: number;
  shin2?: number;
  /** Shoulder elevation in px — shrugs. */
  lift?: number;
}

export type Prop = 'barbell' | 'barOnBack' | 'dumbbell' | 'none';

export interface DemoPattern {
  view: 'side' | 'front';
  a: Pose;
  b: Pose;
  prop: Prop;
  /** Cable anchor; a line is drawn from the hand to it. */
  anchor?: readonly [number, number];
  /** Static lines: bench, bar, seat. */
  scenery?: readonly (readonly [number, number, number, number])[];
}

const STAND: Pose = { ankle: [58, 108], torso: 0, thigh: 180, shin: 180, foot: 90, upperArm: 180, forearm: 180 };
const HANG: Pose = { hip: [60, 62], torso: 0, thigh: 182, shin: 200, upperArm: 0, forearm: 0 };
const BAR_TOP = [38, -2, 82, -2] as const;

export const PATTERNS = {
  squat: {
    view: 'side',
    prop: 'barOnBack',
    a: { ...STAND, upperArm: 200, forearm: 340 },
    b: { ...STAND, thigh: 100, shin: 205, torso: 40, upperArm: 235, forearm: 15 },
  },
  hinge: {
    view: 'side',
    prop: 'barbell',
    a: STAND,
    b: { ...STAND, torso: 80, thigh: 150, shin: 185, upperArm: 190, forearm: 190 },
  },
  lunge: {
    view: 'side',
    prop: 'dumbbell',
    a: { ankle: [72, 108], torso: 0, thigh: 170, shin: 185, foot: 90, thigh2: 200, shin2: 250, upperArm: 180, forearm: 180 },
    b: { ankle: [72, 108], torso: 10, thigh: 100, shin: 195, foot: 90, thigh2: 185, shin2: 328, upperArm: 180, forearm: 180 },
    scenery: [[18, 92, 44, 92], [24, 92, 24, 112]],
  },
  hipThrust: {
    view: 'side',
    prop: 'barbell',
    a: { hip: [62, 94], torso: 300, thigh: 60, shin: 175, foot: 90, upperArm: 110, forearm: 90 },
    b: { hip: [60, 78], torso: 272, thigh: 88, shin: 178, foot: 90, upperArm: 95, forearm: 95 },
    scenery: [[8, 82, 36, 82], [14, 82, 14, 112]],
  },
  legPress: {
    view: 'side',
    prop: 'none',
    a: { hip: [44, 86], torso: 300, thigh: 40, shin: 120, foot: 30, upperArm: 150, forearm: 90 },
    b: { hip: [44, 86], torso: 300, thigh: 62, shin: 62, foot: 330, upperArm: 150, forearm: 90 },
    scenery: [[46, 93, 12, 73], [30, 112, 46, 93]],
  },
  benchPress: {
    view: 'side',
    prop: 'barbell',
    a: { hip: [72, 80], torso: 270, thigh: 105, shin: 170, foot: 90, upperArm: 150, forearm: 5 },
    b: { hip: [72, 80], torso: 270, thigh: 105, shin: 170, foot: 90, upperArm: 0, forearm: 0 },
    scenery: [[24, 87, 84, 87], [30, 87, 30, 112], [78, 87, 78, 112]],
  },
  fly: {
    view: 'front',
    prop: 'dumbbell',
    a: { ...STAND, upperArm: 95, forearm: 100 },
    b: { ...STAND, upperArm: 140, forearm: 230 },
  },
  pushUp: {
    view: 'side',
    prop: 'none',
    a: { ankle: [100, 104], torso: 277, thigh: 97, shin: 97, foot: 120, upperArm: 70, forearm: 200 },
    b: { ankle: [100, 104], torso: 295, thigh: 115, shin: 115, foot: 120, upperArm: 175, forearm: 175 },
  },
  dip: {
    view: 'side',
    prop: 'none',
    a: { hip: [58, 70], torso: 12, thigh: 175, shin: 220, upperArm: 245, forearm: 175 },
    b: { hip: [58, 52], torso: 12, thigh: 175, shin: 220, upperArm: 185, forearm: 180 },
    scenery: [[36, 60, 80, 60]],
  },
  overheadPress: {
    view: 'side',
    prop: 'barbell',
    a: { ...STAND, upperArm: 150, forearm: 355 },
    b: { ...STAND, upperArm: 5, forearm: 0 },
  },
  lateralRaise: {
    view: 'front',
    prop: 'dumbbell',
    a: { ...STAND, upperArm: 172, forearm: 175 },
    b: { ...STAND, upperArm: 95, forearm: 95 },
  },
  shrug: {
    view: 'front',
    prop: 'dumbbell',
    a: { ...STAND, upperArm: 176, forearm: 180 },
    b: { ...STAND, upperArm: 176, forearm: 180, lift: 6 },
  },
  facePull: {
    view: 'side',
    prop: 'none',
    anchor: [114, 20],
    a: { ...STAND, upperArm: 85, forearm: 85 },
    b: { ...STAND, upperArm: 265, forearm: 40 },
  },
  pullUp: {
    view: 'side',
    prop: 'none',
    a: HANG,
    b: { ...HANG, hip: [60, 30], upperArm: 175, forearm: 355 },
    scenery: [BAR_TOP],
  },
  pulldown: {
    view: 'side',
    prop: 'none',
    anchor: [54, -18],
    a: { hip: [56, 80], torso: 350, thigh: 90, shin: 180, foot: 90, upperArm: 5, forearm: 5 },
    b: { hip: [56, 80], torso: 350, thigh: 90, shin: 180, foot: 90, upperArm: 175, forearm: 5 },
    scenery: [[40, 85, 70, 85], [56, 85, 56, 112]],
  },
  bentRow: {
    view: 'side',
    prop: 'barbell',
    a: { ...STAND, torso: 70, thigh: 160, shin: 185 },
    b: { ...STAND, torso: 70, thigh: 160, shin: 185, upperArm: 235, forearm: 175 },
  },
  seatedRow: {
    view: 'side',
    prop: 'none',
    anchor: [114, 66],
    a: { hip: [48, 84], torso: 355, thigh: 85, shin: 95, foot: 5, upperArm: 95, forearm: 90 },
    b: { hip: [48, 84], torso: 355, thigh: 85, shin: 95, foot: 5, upperArm: 215, forearm: 90 },
    scenery: [[30, 89, 62, 89], [104, 70, 104, 96]],
  },
  straightArmPulldown: {
    view: 'side',
    prop: 'none',
    anchor: [110, -16],
    a: { ...STAND, torso: 15, upperArm: 45, forearm: 45 },
    b: { ...STAND, torso: 15, upperArm: 175, forearm: 175 },
  },
  curl: {
    view: 'side',
    prop: 'dumbbell',
    a: STAND,
    b: { ...STAND, upperArm: 170, forearm: 20 },
  },
  pushdown: {
    view: 'side',
    prop: 'none',
    anchor: [76, -16],
    a: { ...STAND, forearm: 60 },
    b: STAND,
  },
  overheadExt: {
    view: 'side',
    prop: 'dumbbell',
    a: { ...STAND, upperArm: 0, forearm: 200 },
    b: { ...STAND, upperArm: 0, forearm: 360 },
  },
  legExtension: {
    view: 'side',
    prop: 'none',
    a: { hip: [50, 76], torso: 350, thigh: 88, shin: 180, foot: 90, upperArm: 170, forearm: 150 },
    b: { hip: [50, 76], torso: 350, thigh: 88, shin: 92, foot: 0, upperArm: 170, forearm: 150 },
    scenery: [[34, 81, 72, 81], [40, 81, 40, 112], [40, 81, 35, 44]],
  },
  legCurl: {
    view: 'side',
    prop: 'none',
    a: { hip: [62, 78], torso: 270, thigh: 90, shin: 90, foot: 180, upperArm: 240, forearm: 180 },
    b: { hip: [62, 78], torso: 270, thigh: 90, shin: 15, foot: 100, upperArm: 240, forearm: 180 },
    scenery: [[8, 84, 100, 84], [16, 84, 16, 112], [92, 84, 92, 112]],
  },
  seatedLegCurl: {
    view: 'side',
    prop: 'none',
    a: { hip: [50, 76], torso: 350, thigh: 88, shin: 95, foot: 0, upperArm: 170, forearm: 150 },
    b: { hip: [50, 76], torso: 350, thigh: 88, shin: 195, foot: 90, upperArm: 170, forearm: 150 },
    scenery: [[34, 81, 72, 81], [40, 81, 40, 112], [40, 81, 35, 44]],
  },
  calfRaise: {
    view: 'side',
    prop: 'none',
    a: STAND,
    b: { ...STAND, ankle: [59, 100.5], foot: 150 },
  },
  crunch: {
    view: 'side',
    prop: 'none',
    anchor: [70, -16],
    a: { hip: [60, 80], torso: 10, thigh: 180, shin: 270, foot: 180, upperArm: 30, forearm: 200 },
    b: { hip: [60, 80], torso: 100, thigh: 180, shin: 270, foot: 180, upperArm: 120, forearm: 300 },
  },
  hangingLegRaise: {
    view: 'side',
    prop: 'none',
    a: { ...HANG, thigh: 180, shin: 180 },
    b: { ...HANG, thigh: 90, shin: 90 },
    scenery: [BAR_TOP],
  },
} satisfies Record<string, DemoPattern>;

export type PatternName = keyof typeof PATTERNS;

/** Seeded exercises → pattern (and a prop override where the implement differs). */
const BY_ID: Record<string, PatternName | [PatternName, Prop]> = {
  'bb-squat': 'squat',
  'hack-squat': ['squat', 'none'],
  'goblet-squat': ['squat', 'none'],
  'leg-press': 'legPress',
  'bulgarian-split': 'lunge',
  'db-lunge': 'lunge',
  rdl: 'hinge',
  'bb-deadlift': 'hinge',
  'hip-thrust': 'hipThrust',
  'bb-bench': 'benchPress',
  'db-bench': ['benchPress', 'dumbbell'],
  'db-incline': ['benchPress', 'dumbbell'],
  'machine-chest-press': ['benchPress', 'none'],
  'cable-fly': 'fly',
  'push-up': 'pushUp',
  dips: 'dip',
  'bb-ohp': 'overheadPress',
  'db-shoulder-press': ['overheadPress', 'dumbbell'],
  'lateral-raise': 'lateralRaise',
  'cable-lateral': ['lateralRaise', 'none'],
  'rear-delt-fly': 'lateralRaise',
  'face-pull': 'facePull',
  'pull-up': 'pullUp',
  'lat-pulldown': 'pulldown',
  'bb-row': 'bentRow',
  'db-row': ['bentRow', 'dumbbell'],
  'chest-supported-row': ['bentRow', 'none'],
  'seated-cable-row': 'seatedRow',
  'straight-arm-pulldown': 'straightArmPulldown',
  'bb-shrug': 'shrug',
  'db-shrug': 'shrug',
  'bb-curl': ['curl', 'barbell'],
  'db-incline-curl': 'curl',
  'hammer-curl': 'curl',
  'preacher-curl': 'curl',
  'cable-curl': ['curl', 'none'],
  skullcrusher: 'overheadExt',
  'overhead-ext': ['overheadExt', 'none'],
  'cable-pushdown': 'pushdown',
  'leg-extension': 'legExtension',
  'leg-curl': 'legCurl',
  'seated-leg-curl': 'seatedLegCurl',
  'calf-raise': 'calfRaise',
  'seated-calf': 'calfRaise',
  'cable-crunch': 'crunch',
  'hanging-leg-raise': 'hangingLegRaise',
};

/** Custom exercises get the closest pattern for their primary muscle. */
const BY_MUSCLE: Record<string, PatternName> = {
  chest: 'benchPress',
  back: 'bentRow',
  shoulders: 'overheadPress',
  biceps: 'curl',
  triceps: 'pushdown',
  traps: 'shrug',
  quads: 'squat',
  hamstrings: 'hinge',
  glutes: 'hipThrust',
  calves: 'calfRaise',
  abs: 'crunch',
};

export function demoFor(ex: Pick<Exercise, 'id' | 'primaryMuscles'>): DemoPattern {
  const hit = BY_ID[ex.id];
  if (Array.isArray(hit)) return { ...PATTERNS[hit[0]], prop: hit[1] };
  if (hit) return PATTERNS[hit];
  return PATTERNS[BY_MUSCLE[ex.primaryMuscles[0] ?? ''] ?? 'squat'];
}

/* ================================ solver ================================= */

/** Segment lengths in viewBox units. */
const LEN = { shin: 26, thigh: 26, torso: 32, upperArm: 18, forearm: 16, foot: 9, head: 10, shoulderHalf: 9, hipHalf: 5 };
export const SEGMENTS = 12;
const HIDDEN = -100;

/**
 * Frame at t∈[0,1]: 12 segments × (x1,y1,x2,y2), then head (x,y), then two prop
 * points. Runs on the UI thread every frame — worklet, no allocation beyond the array.
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
    hx = ax - vx(shin, LEN.shin) - vx(thigh, LEN.thigh);
    hy = ay - vy(shin, LEN.shin) - vy(thigh, LEN.thigh);
  }
  const sx = hx + vx(torso, LEN.torso);
  const sy = hy + vy(torso, LEN.torso) - lift;
  const headX = sx + vx(torso, LEN.head);
  const headY = sy + vy(torso, LEN.head);
  const out: number[] = [];
  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    out.push(x1, y1, x2, y2);
  };
  const hide = () => {
    out.push(HIDDEN, HIDDEN, HIDDEN, HIDDEN);
  };

  if (p.view === 'side') {
    const kx = hx + vx(thigh, LEN.thigh);
    const ky = hy + vy(thigh, LEN.thigh);
    const ax = kx + vx(shin, LEN.shin);
    const ay = ky + vy(shin, LEN.shin);
    const ex = sx + vx(upperArm, LEN.upperArm);
    const ey = sy + vy(upperArm, LEN.upperArm);
    const handX = ex + vx(forearm, LEN.forearm);
    const handY = ey + vy(forearm, LEN.forearm);
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

  // Front view: mirror arms and legs about the torso line.
  const side = (dir: 1 | -1) => {
    const shX = sx + dir * LEN.shoulderHalf;
    const hipX = hx + dir * LEN.hipHalf;
    const ua = dir === 1 ? upperArm : 360 - upperArm;
    const fa = dir === 1 ? forearm : 360 - forearm;
    const th = dir === 1 ? thigh : 360 - thigh;
    const sh = dir === 1 ? shin : 360 - shin;
    const ex = shX + vx(ua, LEN.upperArm);
    const ey = sy + vy(ua, LEN.upperArm);
    const handX = ex + vx(fa, LEN.forearm);
    const handY = ey + vy(fa, LEN.forearm);
    const kx = hipX + vx(th, LEN.thigh);
    const ky = hy + vy(th, LEN.thigh);
    seg(shX, sy, ex, ey);
    seg(ex, ey, handX, handY);
    seg(hipX, hy, kx, ky);
    seg(kx, ky, kx + vx(sh, LEN.shin), ky + vy(sh, LEN.shin));
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
