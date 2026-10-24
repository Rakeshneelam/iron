import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Line, Path } from 'react-native-svg';

import { useReducedMotion } from '@/components/Screen';
import { fmtClockOfDay } from '@/features/settings/time';
import { ml } from '@/lib/format';
import { EASE_OUT } from '@/theme/curves';
import { color, font, motion } from '@/theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface WaterLevelProps {
  /** The day's entries: minutes past midnight, and how much. */
  steps: readonly { id: string; at: number; ml: number }[];
  target: number;
  /** The waking day the pace runs across, from settings. */
  wake: number;
  sleep: number;
  /** Minutes past midnight now, or null for a day that is over. */
  now: number | null;
  /** The entry just logged: it arrives hot and cools into water's ink. */
  fresh?: string | null;
  height?: number;
}

/**
 * The day's water as a level, on the clock.
 *
 * Not a ring. A ring answers "what fraction" and nothing else, and every water app
 * has one. A level on a time axis answers the question the reminders are actually
 * about — am I where the day expects me to be — because the pace line it is drawn
 * against is the same pro-rata line, waking to bedtime, that decides whether a
 * reminder fires (services/hydration). Ahead of it, nothing will buzz; under it, one
 * nudge. The picture and the behaviour cannot disagree, because they are one rule.
 *
 * Drawing conventions (docs/13): the level is logged, so it is a solid line with
 * the volume under it; the pace and the target are planned, so they are dashed.
 * The glass just logged arrives in heat and cools into water's ink.
 */
export function WaterLevel({ steps, target, wake, sleep, now, fresh, height = 168 }: WaterLevelProps) {
  const [width, setWidth] = useState(0);
  const reduced = useReducedMotion();
  const sorted = [...steps].sort((a, b) => a.at - b.at);
  const total = sorted.reduce((t, s) => t + s.ml, 0);

  const from = Math.floor(Math.min(wake, ...sorted.map((s) => s.at)) / 60) * 60;
  const to = Math.ceil(Math.max(sleep, now ?? 0, ...sorted.map((s) => s.at)) / 60) * 60;
  const top = Math.max(target, total, 1) * 1.08;
  const PAD = 4;
  const x = (min: number) => ((min - from) / Math.max(1, to - from)) * width;
  const y = (v: number) => height - PAD - (v / top) * (height - PAD * 2);

  // The level: flat, then up at each entry, then flat to now (or to the last entry).
  let level = 0;
  let d = `M${x(wake)} ${y(0)}`;
  let freshSeg = '';
  for (const s of sorted) {
    d += `L${x(s.at)} ${y(level)}`;
    const before = level;
    level += s.ml;
    d += `L${x(s.at)} ${y(level)}`;
    if (s.id === fresh) freshSeg = `M${x(s.at)} ${y(before)}L${x(s.at)} ${y(level)}`;
  }
  const end = now ?? Math.max(wake, ...sorted.map((s) => s.at));
  d += `L${x(Math.max(end, wake))} ${y(level)}`;
  const area = `${d}L${x(Math.max(end, wake))} ${y(0)}Z`;

  const hours: number[] = [];
  for (let h = Math.ceil(from / 180) * 180; h <= to; h += 180) hours.push(h);

  return (
    <View>
      <View
        style={{ height }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${ml(total)} of ${ml(target)}, ${sorted.length} ${sorted.length === 1 ? 'entry' : 'entries'}${
          now !== null ? `. The pace line expects about ${ml(Math.round((target * Math.min(1, Math.max(0, (now - wake) / Math.max(1, sleep - wake)))) / 10) * 10)} by now` : ''
        }.`}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Line x1={0} y1={y(0) + 0.5} x2={width} y2={y(0) + 0.5} stroke={color.border} strokeWidth={1} />
            {/* The target and the pace: both planned, so both dashed. */}
            <Line x1={0} y1={y(target)} x2={width} y2={y(target)} stroke={color.textMuted} strokeWidth={1} strokeDasharray="4 3" />
            <Line x1={x(wake)} y1={y(0)} x2={x(sleep)} y2={y(target)} stroke={color.textFaint} strokeWidth={1} strokeDasharray="2 4" />
            <Path d={area} fill={color.coldSoft} />
            <Path d={d} stroke={color.cold} strokeWidth={2.2} fill="none" strokeLinejoin="round" />
            {freshSeg && !reduced ? <Heat key={fresh ?? ''} d={freshSeg} /> : null}
            {now !== null && now >= from && now <= to ? <Line x1={x(now)} y1={0} x2={x(now)} y2={height} stroke={color.accent} strokeWidth={1.5} /> : null}
          </Svg>
        ) : null}
        <Text style={[styles.tag, { top: Math.max(0, y(target) - 16) }]}>target {ml(target)}</Text>
      </View>
      <View style={styles.axis} importantForAccessibility="no-hide-descendants">
        {width > 0
          ? hours.map((h) => (
              <Text key={h} style={[styles.hour, { left: Math.min(width - 24, Math.max(0, x(h) - 12)) }]}>
                {fmtClockOfDay(h).slice(0, 2)}
              </Text>
            ))
          : null}
      </View>
    </View>
  );
}

/** The newest step, as heat over the cold line, cooling away over `motion.cool`. */
function Heat({ d }: { d: string }) {
  const t = useSharedValue(1);
  useEffect(() => {
    t.set(withTiming(0, { duration: motion.cool, easing: EASE_OUT }));
  }, [t]);
  const props = useAnimatedProps(() => ({ opacity: t.get() }));
  return <AnimatedPath d={d} stroke={color.accent} strokeWidth={3.2} strokeLinecap="round" fill="none" animatedProps={props} />;
}

const styles = StyleSheet.create({
  tag: { position: 'absolute', right: 0, ...font.caption, fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'], color: color.textMuted },
  axis: { height: 16, marginTop: 4 },
  hour: { position: 'absolute', top: 0, width: 24, textAlign: 'center', ...font.caption, fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'], color: color.textFaint },
});
