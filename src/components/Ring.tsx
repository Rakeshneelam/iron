import { type ReactNode, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { EASE_OUT } from '@/theme/curves';
import { color, font, motion } from '@/theme/tokens';

import { FitText } from './FitText';
import { useReducedMotion } from './Screen';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type RingTone = 'accent' | 'positive' | 'warning' | 'chalk';

export interface RingProps {
  /** 0..1; values above 1 draw a full ring. */
  progress: number;
  size: number;
  thickness?: number;
  label?: string;
  sublabel?: string;
  tone?: RingTone;
  /** Replaces label and sublabel with your own centre. */
  children?: ReactNode;
  /**
   * Graduations around the outside, as on a stopwatch bezel — a dial is an
   * instrument, and an instrument is graduated (docs/13). Every fifth is long.
   */
  graduations?: number;
}

const STROKE: Record<RingTone, string> = { accent: color.accent, positive: color.positive, warning: color.warning, chalk: color.text };

export function Ring({ progress, size, thickness = 14, label, sublabel, tone = 'accent', children, graduations = 0 }: RingProps) {
  const reduced = useReducedMotion();
  // Room outside the track for the graduations, when there are any.
  const bezel = graduations > 0 ? 9 : 0;
  const r = (size - thickness) / 2 - bezel;
  const circumference = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const p = useSharedValue(target);

  useEffect(() => {
    // `.set`/`.get` rather than `.value`: the same API, but the form the React
    // Compiler can see through, and the one the Reanimated docs now recommend.
    p.set(reduced ? target : withTiming(target, { duration: motion.slow, easing: EASE_OUT }));
  }, [p, reduced, target]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - p.get()),
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {graduations > 0 ? <Path d={bezelPath(size, graduations)} stroke={color.rule} strokeWidth={1.2} strokeLinecap="round" /> : null}
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color.surfaceHigh} strokeWidth={thickness} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={STROKE[tone]}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        {children ?? (
          <>
            <FitText style={styles.label} numberOfLines={1}>
              {label}
            </FitText>
            {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
          </>
        )}
      </View>
    </View>
  );
}

/** Radial ticks just inside the dial's edge; every fifth reaches further in. */
function bezelPath(size: number, n: number): string {
  const c = size / 2;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const outer = c - 1;
    const inner = c - (i % 5 === 0 ? 8 : 4);
    d += `M${c + Math.cos(a) * outer} ${c + Math.sin(a) * outer}L${c + Math.cos(a) * inner} ${c + Math.sin(a) * inner}`;
  }
  return d;
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: '18%' },
  label: { ...font.measure, fontSize: 32, lineHeight: 36, color: color.text },
  sublabel: { ...font.label, color: color.textMuted },
});
