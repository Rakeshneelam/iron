import { type ReactNode, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { color, font, motion } from '@/theme/tokens';

import { useReducedMotion } from './Screen';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type RingTone = 'accent' | 'positive' | 'warning';

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
}

const STROKE: Record<RingTone, string> = { accent: color.accent, positive: color.positive, warning: color.warning };

export function Ring({ progress, size, thickness = 14, label, sublabel, tone = 'accent', children }: RingProps) {
  const reduced = useReducedMotion();
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const p = useSharedValue(target);

  useEffect(() => {
    p.value = reduced ? target : withTiming(target, { duration: motion.slow });
  }, [p, reduced, target]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - p.value),
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
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
            <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>
              {label}
            </Text>
            {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: '18%' },
  label: { ...font.title, ...font.numeric, color: color.text },
  sublabel: { ...font.label, color: color.textMuted },
});
