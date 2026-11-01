import { useEffect, type ReactNode } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from './Screen';

/** One slow breath, in and out: the period of a calm resting pulse. */
const PERIOD_MS = 1800;

/**
 * Something live, breathing: a slow scale and glow, repeated for as long as `on`.
 * The ring around your avatar while a workout is open, the rest timer while it
 * runs. Off, it sits still at full size; under reduced motion it never moves.
 */
export function Breathe({ on, amount = 0.04, children, style }: { on: boolean; amount?: number; children: ReactNode; style?: object }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!on || reduced) {
      t.set(withTiming(0, { duration: 300 }));
      return;
    }
    t.set(withRepeat(withTiming(1, { duration: PERIOD_MS, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [on, reduced, t]);
  const breathe = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + amount * t.get() }],
    opacity: 1 - 0.12 * t.get(),
  }));
  return <Animated.View style={[style, breathe]}>{children}</Animated.View>;
}
