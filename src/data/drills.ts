/**
 * Warm-up, mobility, activation, stretching and breathing drills. PURE DATA — no
 * imports — so the engine (and node tests) can read it.
 *
 * Kinds follow the evidence on what belongs where:
 *   general     raise temperature (light cardio)          → before training
 *   mobility    DYNAMIC range-of-motion work              → before training, rest days
 *   activation  low-load primers for muscles about to work → before, sparingly
 *   prep        the day's movement pattern, unloaded      → before the first lift
 *   stretch     STATIC holds                               → after training, rest days
 *   breathing   down-regulation                            → after training, rest days
 * Static stretching over ~60 s per muscle right before lifting measurably reduces
 * strength (Behm et al., 2016), so static holds never appear in a warm-up.
 */

export type DrillKind = 'general' | 'mobility' | 'activation' | 'prep' | 'stretch' | 'breathing';
export type Region =
  | 'hips' | 'ankles' | 'thoracic' | 'shoulders' | 'hamstrings' | 'quads' | 'glutes' | 'calves'
  | 'chest' | 'lats' | 'lowerBack' | 'adductors' | 'wrists' | 'arms' | 'core' | 'wholeBody';
export type DrillEquipment = 'none' | 'band' | 'cardio_machine' | 'pullup_bar';

export interface Drill {
  id: string;
  name: string;
  kind: DrillKind;
  regions: readonly Region[];
  /** Default dose. `seconds` → timed; `reps` → counted. `perSide` doubles the time. */
  dose: { reps?: number; seconds?: number; perSide?: boolean };
  equipment: DrillEquipment;
  level?: 'beginner' | 'intermediate';
  /** Stick-figure pattern name (features/exercises/demo.ts), when one fits. */
  demo?: string;
  /** Two or three short cues. */
  cues: readonly string[];
}

export const DRILLS: readonly Drill[] = [
  /* ------------------------------ general ------------------------------ */
  { id: 'g-bike', name: 'Easy bike', kind: 'general', regions: ['wholeBody', 'quads'], dose: { seconds: 180 }, equipment: 'cardio_machine', demo: 'bike', cues: ['Easy pace — you could hold a conversation.', 'Aim to feel warm, not tired.'] },
  { id: 'g-rower', name: 'Easy row', kind: 'general', regions: ['wholeBody', 'lats'], dose: { seconds: 180 }, equipment: 'cardio_machine', demo: 'rower', cues: ['Legs, then body, then arms; reverse on the way back.', 'Light pressure on the handle.'] },
  { id: 'g-walk', name: 'Brisk walk', kind: 'general', regions: ['wholeBody', 'calves'], dose: { seconds: 180 }, equipment: 'cardio_machine', demo: 'walk', cues: ['Treadmill, slight incline if you like.', 'Walk briskly until you feel warm.'] },
  { id: 'g-march', name: 'March or light jog in place', kind: 'general', regions: ['wholeBody', 'hips'], dose: { seconds: 120 }, equipment: 'none', demo: 'walk', cues: ['Lift the knees, swing the arms.', 'Build the pace gradually.'] },
  { id: 'g-jacks', name: 'Jumping jacks', kind: 'general', regions: ['wholeBody', 'calves', 'shoulders'], dose: { seconds: 60 }, equipment: 'none', demo: 'jumpingJack', cues: ['Land softly on the balls of your feet.', 'Step side to side instead if jumping bothers you.'] },

  /* ------------------------------ mobility ----------------------------- */
  { id: 'm-cat-cow', name: 'Cat–cow', kind: 'mobility', regions: ['thoracic', 'lowerBack'], dose: { reps: 8 }, equipment: 'none', cues: ['On hands and knees, round the whole spine up.', 'Then let the chest drop and look forward. Slow and smooth.'] },
  { id: 'm-open-book', name: 'Open book', kind: 'mobility', regions: ['thoracic', 'chest', 'shoulders'], dose: { reps: 6, perSide: true }, equipment: 'none', cues: ['Lie on your side, knees bent, arms out in front.', 'Sweep the top arm open and follow it with your eyes; keep the knees together.'] },
  { id: 'm-leg-swing-front', name: 'Leg swings — front to back', kind: 'mobility', regions: ['hamstrings', 'hips'], dose: { reps: 10, perSide: true }, equipment: 'none', demo: 'legSwing', cues: ['Hold something for balance.', 'Swing loosely, a little higher each rep, no forcing.'] },
  { id: 'm-leg-swing-side', name: 'Leg swings — side to side', kind: 'mobility', regions: ['adductors', 'hips'], dose: { reps: 10, perSide: true }, equipment: 'none', cues: ['Face a wall or rack and swing the leg across and out.', 'Keep the hips facing forward.'] },
  { id: 'm-hip-circles', name: 'Standing hip circles', kind: 'mobility', regions: ['hips', 'glutes'], dose: { reps: 6, perSide: true }, equipment: 'none', cues: ['Lift a knee to hip height and draw big circles.', 'Both directions; move slowly.'] },
  { id: 'm-9090', name: '90/90 hip switches', kind: 'mobility', regions: ['hips', 'glutes', 'adductors'], dose: { reps: 6, perSide: true }, equipment: 'none', level: 'intermediate', cues: ['Sit with both knees bent at 90°, one in front, one to the side.', 'Rotate both knees to the other side, chest tall; use hands for support.'] },
  { id: 'm-worlds-greatest', name: "World's greatest stretch", kind: 'mobility', regions: ['hips', 'thoracic', 'hamstrings', 'adductors'], dose: { reps: 4, perSide: true }, equipment: 'none', cues: ['Step into a long lunge, both hands inside the front foot.', 'Rotate the inside arm to the ceiling, then straighten the front leg. Move through it — don’t hold.'] },
  { id: 'm-ankle-rock', name: 'Knee-to-wall ankle rocks', kind: 'mobility', regions: ['ankles', 'calves'], dose: { reps: 10, perSide: true }, equipment: 'none', cues: ['Half-kneel facing a wall, front foot a hand’s width away.', 'Drive the knee toward the wall over the toes, heel down.'] },
  { id: 'm-deep-squat', name: 'Deep squat pry', kind: 'mobility', regions: ['hips', 'ankles', 'adductors'], dose: { seconds: 30 }, equipment: 'none', cues: ['Sink into a deep squat holding a rack or door frame.', 'Gently shift side to side and push the knees out with the elbows.'] },
  { id: 'm-cossack', name: 'Cossack squat', kind: 'mobility', regions: ['adductors', 'hips', 'ankles'], dose: { reps: 5, perSide: true }, equipment: 'none', level: 'intermediate', cues: ['Wide stance; sit down to one side, the other leg straight.', 'Only go as deep as is comfortable; use your hands for balance.'] },
  { id: 'm-arm-circles', name: 'Arm circles', kind: 'mobility', regions: ['shoulders'], dose: { reps: 10 }, equipment: 'none', demo: 'armCircles', cues: ['Small circles growing to big ones.', 'Forward, then backward.'] },
  { id: 'm-band-dislocate', name: 'Band pass-throughs', kind: 'mobility', regions: ['shoulders', 'chest', 'thoracic'], dose: { reps: 10 }, equipment: 'band', cues: ['Wide grip on a light band; arms straight.', 'Lift it overhead and behind you, then back. Widen the grip if it pinches.'] },
  { id: 'm-wall-slide', name: 'Wall slides', kind: 'mobility', regions: ['shoulders', 'thoracic'], dose: { reps: 8 }, equipment: 'none', cues: ['Back and forearms against a wall, elbows at 90°.', 'Slide the arms up without the lower back arching, then pull the elbows down.'] },
  { id: 'm-inchworm', name: 'Inchworm', kind: 'mobility', regions: ['hamstrings', 'shoulders', 'core'], dose: { reps: 5 }, equipment: 'none', cues: ['Fold forward, walk the hands out to a plank.', 'Walk the feet in toward the hands; bend the knees as needed.'] },
  { id: 'm-lunge-reach', name: 'Reverse lunge with reach', kind: 'mobility', regions: ['hips', 'quads', 'thoracic'], dose: { reps: 5, perSide: true }, equipment: 'none', cues: ['Step back into a lunge and reach both arms overhead.', 'Squeeze the back-leg glute to open the front of the hip.'] },
  { id: 'm-wrist-circles', name: 'Wrist circles and rocks', kind: 'mobility', regions: ['wrists', 'arms'], dose: { reps: 10 }, equipment: 'none', cues: ['Circle the wrists both ways.', 'On hands and knees, rock gently forward and back over the palms.'] },
  { id: 'm-thoracic-rotation', name: 'Quadruped thoracic rotation', kind: 'mobility', regions: ['thoracic', 'shoulders'], dose: { reps: 6, perSide: true }, equipment: 'none', cues: ['On hands and knees, one hand behind your head.', 'Rotate that elbow down toward the other wrist, then up to the ceiling.'] },

  /* ----------------------------- activation ---------------------------- */
  { id: 'a-glute-bridge', name: 'Glute bridge', kind: 'activation', regions: ['glutes', 'hamstrings'], dose: { reps: 10 }, equipment: 'none', demo: 'bridge', cues: ['On your back, knees bent, feet flat.', 'Push through the heels and squeeze the glutes at the top for a second.'] },
  { id: 'a-band-walk', name: 'Banded lateral walk', kind: 'activation', regions: ['glutes', 'hips'], dose: { reps: 10, perSide: true }, equipment: 'band', cues: ['Light band around the knees or ankles, half squat.', 'Step sideways keeping tension; don’t let the knees cave.'] },
  { id: 'a-pull-apart', name: 'Band pull-apart', kind: 'activation', regions: ['shoulders', 'thoracic'], dose: { reps: 15 }, equipment: 'band', demo: 'bandPullApart', cues: ['Arms straight in front, light band.', 'Pull the band to the chest by squeezing the shoulder blades together.'] },
  { id: 'a-scap-pushup', name: 'Scapular push-up', kind: 'activation', regions: ['shoulders', 'chest'], dose: { reps: 10 }, equipment: 'none', cues: ['In a plank with straight arms.', 'Let the chest sink between the shoulders, then push the floor away. Elbows stay straight.'] },
  { id: 'a-ext-rot', name: 'Band external rotation', kind: 'activation', regions: ['shoulders'], dose: { reps: 12, perSide: true }, equipment: 'band', cues: ['Elbow at your side bent 90°, band across the body.', 'Rotate the forearm outward slowly; keep the elbow pinned.'] },
  { id: 'a-dead-bug', name: 'Dead bug', kind: 'activation', regions: ['core'], dose: { reps: 6, perSide: true }, equipment: 'none', demo: 'deadBug', cues: ['On your back, arms up, knees over hips.', 'Lower the opposite arm and leg while keeping the lower back down.'] },
  { id: 'a-bird-dog', name: 'Bird dog', kind: 'activation', regions: ['core', 'lowerBack', 'glutes'], dose: { reps: 6, perSide: true }, equipment: 'none', demo: 'birdDog', cues: ['On hands and knees, reach one arm and the opposite leg long.', 'Keep the hips level; pause, return, switch.'] },
  { id: 'a-scap-pull', name: 'Scapular pull-up', kind: 'activation', regions: ['lats', 'shoulders'], dose: { reps: 6 }, equipment: 'pullup_bar', cues: ['Hang from the bar with straight arms.', 'Pull the shoulders down away from the ears without bending the elbows.'] },

  /* ------------------------------- prep -------------------------------- */
  { id: 'p-bw-squat', name: 'Bodyweight squat', kind: 'prep', regions: ['quads', 'hips', 'ankles'], dose: { reps: 10 }, equipment: 'none', demo: 'squatFront', cues: ['Feet about shoulder width, sit down between the heels.', 'Use the same depth and stance you’ll use under load.'] },
  { id: 'p-hip-hinge', name: 'Hip hinge drill', kind: 'prep', regions: ['hamstrings', 'lowerBack', 'hips'], dose: { reps: 10 }, equipment: 'none', demo: 'hinge:none', cues: ['Hands on hips, soft knees.', 'Push the hips back until you feel the hamstrings; keep the back flat.'] },
  { id: 'p-split-squat', name: 'Bodyweight split squat', kind: 'prep', regions: ['quads', 'hips', 'glutes'], dose: { reps: 6, perSide: true }, equipment: 'none', demo: 'lunge', cues: ['Long stance, back heel up.', 'Drop the back knee toward the floor, torso tall.'] },
  { id: 'p-incline-pushup', name: 'Incline push-up', kind: 'prep', regions: ['chest', 'shoulders', 'arms'], dose: { reps: 8 }, equipment: 'none', demo: 'pushUp', cues: ['Hands on a bench or bar, body in one line.', 'Easy, smooth reps — you’re rehearsing the press.'] },
  { id: 'p-pushup', name: 'Easy push-ups', kind: 'prep', regions: ['chest', 'shoulders', 'arms'], dose: { reps: 8 }, equipment: 'none', demo: 'pushUp', cues: ['Stop well short of hard.', 'Tuck the elbows slightly as you lower.'] },
  { id: 'p-band-row', name: 'Band row', kind: 'prep', regions: ['lats', 'shoulders'], dose: { reps: 12 }, equipment: 'band', cues: ['Anchor a band at chest height.', 'Pull the elbows back past the ribs and squeeze.'] },

  /* ------------------------------ stretch ------------------------------ */
  { id: 's-quad', name: 'Standing quad stretch', kind: 'stretch', regions: ['quads', 'hips'], dose: { seconds: 30, perSide: true }, equipment: 'none', cues: ['Hold an ankle behind you, knees together.', 'Tuck the pelvis slightly; breathe and relax into it.'] },
  { id: 's-hamstring', name: 'Hamstring stretch', kind: 'stretch', regions: ['hamstrings'], dose: { seconds: 30, perSide: true }, equipment: 'none', cues: ['On your back, lift one straight leg (a strap helps).', 'Stop at a gentle stretch, not pain.'] },
  { id: 's-hip-flexor', name: 'Half-kneeling hip flexor stretch', kind: 'stretch', regions: ['hips', 'quads'], dose: { seconds: 30, perSide: true }, equipment: 'none', cues: ['Kneel on one knee, other foot forward.', 'Squeeze the back glute and shift forward slightly.'] },
  { id: 's-figure4', name: 'Figure-4 glute stretch', kind: 'stretch', regions: ['glutes', 'hips'], dose: { seconds: 30, perSide: true }, equipment: 'none', cues: ['On your back, cross an ankle over the opposite knee.', 'Pull the lower leg toward you.'] },
  { id: 's-calf', name: 'Wall calf stretch', kind: 'stretch', regions: ['calves', 'ankles'], dose: { seconds: 30, perSide: true }, equipment: 'none', cues: ['Hands on a wall, one leg back straight, heel down.', 'Lean in until you feel the calf.'] },
  { id: 's-chest', name: 'Doorway chest stretch', kind: 'stretch', regions: ['chest', 'shoulders'], dose: { seconds: 30, perSide: true }, equipment: 'none', cues: ['Forearm on a door frame, elbow at shoulder height.', 'Step through gently until the chest stretches.'] },
  { id: 's-lat', name: 'Kneeling lat stretch', kind: 'stretch', regions: ['lats', 'shoulders'], dose: { seconds: 30, perSide: true }, equipment: 'none', cues: ['Kneel, reach both hands forward onto a bench.', 'Sink the hips back and the chest down; lean to one side.'] },
  { id: 's-cross-shoulder', name: 'Cross-body shoulder stretch', kind: 'stretch', regions: ['shoulders'], dose: { seconds: 30, perSide: true }, equipment: 'none', cues: ['Bring one arm across the chest.', 'Hug it in with the other arm; shoulder stays down.'] },
  { id: 's-triceps', name: 'Overhead triceps stretch', kind: 'stretch', regions: ['arms', 'lats'], dose: { seconds: 30, perSide: true }, equipment: 'none', cues: ['Reach one hand down your back, elbow up.', 'Gently press the elbow with the other hand.'] },
  { id: 's-childs', name: "Child's pose", kind: 'stretch', regions: ['lowerBack', 'lats', 'hips'], dose: { seconds: 45 }, equipment: 'none', cues: ['Knees wide, sit back onto the heels.', 'Reach the arms forward and breathe into the back.'] },
  { id: 's-butterfly', name: 'Butterfly stretch', kind: 'stretch', regions: ['adductors', 'hips'], dose: { seconds: 30 }, equipment: 'none', cues: ['Sit with the soles of the feet together.', 'Sit tall and let the knees drop.'] },
  { id: 's-forearm', name: 'Wrist flexor and extensor stretch', kind: 'stretch', regions: ['wrists', 'arms'], dose: { seconds: 20, perSide: true }, equipment: 'none', cues: ['Arm straight, gently pull the fingers back.', 'Then point them down and pull gently.'] },

  /* ----------------------------- breathing ----------------------------- */
  { id: 'b-box', name: 'Box breathing', kind: 'breathing', regions: ['wholeBody'], dose: { seconds: 60 }, equipment: 'none', cues: ['In for 4, hold 4, out for 4, hold 4.', 'Breathe through the nose if you can.'] },
  { id: 'b-legs-up', name: 'Legs-up breathing', kind: 'breathing', regions: ['lowerBack', 'core'], dose: { seconds: 90 }, equipment: 'none', cues: ['On your back, calves on a bench or knees bent.', 'Slow breaths; exhale longer than you inhale.'] },
];

export const DRILL_BY_ID: ReadonlyMap<string, Drill> = new Map(DRILLS.map((d) => [d.id, d]));

/** Rough time for one drill at its dose, including the change-over. */
export function drillSeconds(d: Pick<Drill, 'dose'>, dose: Drill['dose'] = d.dose): number {
  const sides = dose.perSide ? 2 : 1;
  const work = dose.seconds ?? (dose.reps ?? 8) * 3;
  return work * sides + 10;
}

/** "10 reps each side" / "30 s each side" / "3 min". */
export function doseLabel(dose: Drill['dose']): string {
  const each = dose.perSide ? ' each side' : '';
  if (dose.seconds !== undefined) return dose.seconds >= 120 ? `${Math.round(dose.seconds / 60)} min${each}` : `${dose.seconds} s${each}`;
  return `${dose.reps ?? 8} reps${each}`;
}
