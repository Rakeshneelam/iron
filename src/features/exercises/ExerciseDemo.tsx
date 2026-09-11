import { useEffect, useMemo } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';

import { useReducedMotion } from '@/components/Screen';
import type { Exercise } from '@/db/repositories/exercises';
import { color } from '@/theme/tokens';

import { demoFor, SEGMENTS, solveFrame, type DemoPattern } from './demo';

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const MOVE_MS = 1100;
const HOLD_MS = 350;
const STROKE = 5;

/** Minimal black-and-white figure performing the movement, looping on the UI thread. */
export function ExerciseDemo({ exercise, size = 200 }: { exercise: Pick<Exercise, 'id' | 'primaryMuscles'>; size?: number }) {
  const pattern = useMemo(() => demoFor(exercise), [exercise]);
  const reduced = useReducedMotion();
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      t.value = 1;
      return;
    }
    const ease = { duration: MOVE_MS, easing: Easing.inOut(Easing.quad) };
    t.value = 0;
    t.value = withRepeat(
      withSequence(withTiming(1, ease), withTiming(1, { duration: HOLD_MS }), withTiming(0, ease), withTiming(0, { duration: HOLD_MS })),
      -1,
    );
    return () => cancelAnimation(t);
  }, [pattern, reduced, t]);

  const frame = useDerivedValue(() => solveFrame(pattern, t.value));

  return (
    <Svg width={size} height={size} viewBox="0 -20 120 136" accessibilityLabel="Exercise demonstration">
      {(pattern.scenery ?? []).map(([x1, y1, x2, y2], i) => (
        <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color.textFaint} strokeWidth={3} strokeLinecap="round" />
      ))}
      <Line x1={4} y1={113} x2={116} y2={113} stroke={color.border} strokeWidth={1.5} />
      {pattern.anchor ? <Cable frame={frame} anchor={pattern.anchor} /> : null}
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <Segment key={i} frame={frame} index={i} />
      ))}
      <Head frame={frame} />
      <PropMark frame={frame} pattern={pattern} which={0} />
      <PropMark frame={frame} pattern={pattern} which={1} />
    </Svg>
  );
}

const HEAD = SEGMENTS * 4;

function Segment({ frame, index }: { frame: SharedValue<number[]>; index: number }) {
  const props = useAnimatedProps(() => {
    const f = frame.value;
    const i = index * 4;
    return { x1: f[i] ?? -100, y1: f[i + 1] ?? -100, x2: f[i + 2] ?? -100, y2: f[i + 3] ?? -100 };
  });
  return <AnimatedLine animatedProps={props} stroke={color.text} strokeWidth={STROKE} strokeLinecap="round" />;
}

function Head({ frame }: { frame: SharedValue<number[]> }) {
  const props = useAnimatedProps(() => ({ cx: frame.value[HEAD] ?? -100, cy: frame.value[HEAD + 1] ?? -100 }));
  return <AnimatedCircle animatedProps={props} r={6.5} fill={color.text} />;
}

function PropMark({ frame, pattern, which }: { frame: SharedValue<number[]>; pattern: DemoPattern; which: 0 | 1 }) {
  const at = HEAD + 2 + which * 2;
  const props = useAnimatedProps(() => ({ cx: frame.value[at] ?? -100, cy: frame.value[at + 1] ?? -100 }));
  if (pattern.prop === 'none') return null;
  const plate = pattern.prop === 'barbell' || pattern.prop === 'barOnBack';
  return (
    <AnimatedCircle
      animatedProps={props}
      r={plate ? 8 : 4}
      fill={plate ? color.surface : color.text}
      stroke={color.textMuted}
      strokeWidth={plate ? 3 : 0}
    />
  );
}

function Cable({ frame, anchor }: { frame: SharedValue<number[]>; anchor: readonly [number, number] }) {
  const props = useAnimatedProps(() => ({ x2: frame.value[HEAD + 2] ?? anchor[0], y2: frame.value[HEAD + 3] ?? anchor[1] }));
  return <AnimatedLine animatedProps={props} x1={anchor[0]} y1={anchor[1]} stroke={color.textFaint} strokeWidth={1.5} strokeDasharray="3 3" />;
}
