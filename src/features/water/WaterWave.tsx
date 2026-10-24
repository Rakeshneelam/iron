import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { useReducedMotion } from '@/components/Screen';
import { EASE_OUT } from '@/theme/curves';
import { color, motion, radius } from '@/theme/tokens';

/** Height of the wave's crest band, above the flat water under it. */
const CREST = 26;
/** The top of the card stays dry for the figures written there. */
const HEADROOM = 150;

/**
 * The day's water as water: a dark card that fills from the bottom toward the
 * target, its surface a wave. The figures sit in the dry top of the card; anything
 * passed as `badge` floats at the bottom-left, on the water.
 *
 * The level moves on the UI thread when a drink is logged, and jumps there instead
 * when reduced motion is on. Past the target it simply stays full.
 */
export function WaterWave({ fraction, height = 290, children, badge }: { fraction: number; height?: number; children?: ReactNode; badge?: ReactNode }) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const level = useSharedValue(f);
  const span = height - HEADROOM;

  useEffect(() => {
    level.set(reduced ? f : withTiming(f, { duration: motion.slow * 3, easing: EASE_OUT }));
  }, [f, level, reduced]);

  const rise = useAnimatedStyle(() => ({ transform: [{ translateY: height - CREST / 2 - level.get() * span }] }));

  const w = width;
  const h = height + CREST;
  const front = `M0 ${CREST * 0.55} C${w * 0.22} ${CREST * 1.05} ${w * 0.36} ${CREST * 0.05} ${w * 0.6} ${CREST * 0.45} S${w * 0.88} ${CREST * 0.85} ${w} ${CREST * 0.3} L${w} ${h} L0 ${h} Z`;
  const back = `M0 ${CREST * 0.15} C${w * 0.18} ${CREST * -0.2} ${w * 0.42} ${CREST * 0.9} ${w * 0.64} ${CREST * 0.25} S${w * 0.9} ${CREST * -0.1} ${w} ${CREST * 0.6} L${w} ${h} L0 ${h} Z`;

  return (
    <View style={[styles.card, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {w > 0 ? (
        <Animated.View style={[styles.water, { height: h }, rise]} pointerEvents="none">
          <Svg width={w} height={h}>
            <Defs>
              <LinearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color.cold} />
                <Stop offset="1" stopColor={color.coldDeep} />
              </LinearGradient>
            </Defs>
            <Path d={back} fill={color.cold} fillOpacity={0.35} />
            <Path d={front} fill="url(#waterFill)" />
          </Svg>
        </Animated.View>
      ) : null}
      <View style={styles.content}>{children}</View>
      {badge ? <View style={styles.badge}>{badge}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, backgroundColor: color.surface, overflow: 'hidden' },
  water: { position: 'absolute', top: 0, left: 0, right: 0 },
  content: { paddingHorizontal: 22, paddingTop: 20 },
  badge: { position: 'absolute', left: 16, bottom: 16 },
});
