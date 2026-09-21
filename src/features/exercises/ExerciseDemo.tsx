import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
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

import { ChipRow } from '@/components/ChipRow';
import { IconButton } from '@/components/IconButton';
import { useReducedMotion } from '@/components/Screen';
import { color, font, radius, space } from '@/theme/tokens';

import { demoViews, FRONT_PARTS, PART_MUSCLES, SEGMENTS, SIDE_PARTS, solveFrame, type DemoPattern } from './demo';
import { exerciseMedia, mediaCredit } from './media';

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Slow enough to read the movement: ~1.6 s each way, a pause at each end. */
const MOVE_MS = 1600;
const HOLD_MS = 450;
const STROKE = 5;

/** Segment colours: primary muscles solid accent, secondary soft accent, the rest white. */
function strokesFor(pattern: DemoPattern, primary: readonly string[], secondary: readonly string[]): string[] {
  const parts = pattern.view === 'side' ? SIDE_PARTS : FRONT_PARTS;
  return parts.map((p) => {
    const muscles = PART_MUSCLES[p];
    if (muscles.some((m) => primary.includes(m))) return color.accent;
    if (muscles.some((m) => secondary.includes(m))) return color.accentSoft;
    return color.text;
  });
}

export interface FigureDemoProps {
  pattern: DemoPattern;
  size?: number;
  primary?: readonly string[];
  secondary?: readonly string[];
  playing?: boolean;
  /** Bump to restart from the start position. */
  runId?: number;
}

/** The animated figure alone — used by exercise guides and drill players. */
export function FigureDemo({ pattern, size = 200, primary = [], secondary = [], playing = true, runId = 0 }: FigureDemoProps) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(t);
    if (reduced) {
      t.value = 1;
      return;
    }
    if (!playing) return;
    const ease = { duration: MOVE_MS, easing: Easing.inOut(Easing.quad) };
    t.value = 0;
    t.value = withRepeat(
      withSequence(withTiming(0, { duration: HOLD_MS }), withTiming(1, ease), withTiming(1, { duration: HOLD_MS }), withTiming(0, ease)),
      -1,
    );
    return () => cancelAnimation(t);
  }, [pattern, playing, reduced, runId, t]);

  const frame = useDerivedValue(() => solveFrame(pattern, t.value));
  const strokes = useMemo(() => strokesFor(pattern, primary, secondary), [pattern, primary, secondary]);
  const barred = pattern.view === 'front' && (pattern.prop === 'barbell' || pattern.prop === 'bar');

  return (
    <Svg width={size} height={size} viewBox="0 -20 120 136" accessibilityLabel="Exercise demonstration">
      {(pattern.scenery ?? []).map(([x1, y1, x2, y2], i) => (
        <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color.textFaint} strokeWidth={3} strokeLinecap="round" />
      ))}
      <Line x1={4} y1={113} x2={116} y2={113} stroke={color.border} strokeWidth={1.5} />
      {pattern.anchor ? <Cable frame={frame} anchor={pattern.anchor} /> : null}
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <Segment key={i} frame={frame} index={i} stroke={strokes[i] ?? color.text} />
      ))}
      <Head frame={frame} />
      {barred ? <Bar frame={frame} plates={pattern.prop === 'barbell'} /> : null}
      {!barred ? <PropMark frame={frame} pattern={pattern} which={0} /> : null}
      {!barred ? <PropMark frame={frame} pattern={pattern} which={1} /> : null}
    </Svg>
  );
}

/** Figure with pause / replay and a view switch when the exercise has more than one angle. */
/**
 * The demonstration for one exercise.
 *
 * Bundled artwork wins when there is any for this movement; the drawn figure is
 * the fallback. Iron ships no artwork — the obvious source for it (the Gym visual
 * frames in hasaneyldrm/exercises-dataset) is not licensed for redistribution, so
 * the registry is empty until someone imports their own. See ./media/index.ts.
 */
export function ExerciseDemo({
  exercise,
  size = 200,
}: {
  exercise: { id: string; name?: string; primaryMuscles: readonly string[]; secondaryMuscles?: readonly string[] | null };
  size?: number;
}) {
  const media = exerciseMedia(exercise.id);
  if (media) return <MediaDemo media={media} fallbackName={exercise.name} size={size} />;
  return <FigureFallback exercise={exercise} size={size} />;
}

/**
 * A looping frame. Never upscaled past the artwork's own pixel size: the licence
 * that covers this media distributes it at 180×180, and stretching it to 230
 * would only make a blurry picture out of a sharp one.
 */
function MediaDemo({ media, fallbackName, size }: { media: ReturnType<typeof exerciseMedia> & object; fallbackName?: string; size: number }) {
  const box = Math.min(size, media.size);
  const credit = mediaCredit();
  return (
    <View style={styles.wrap}>
      <Image
        source={media.source}
        style={[styles.media, { width: box, height: box }]}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel={`Demonstration of ${media.name || fallbackName || 'the movement'}`}
      />
      {/* Required by the media licence, and rendered only when media actually is. */}
      {credit ? <Text style={styles.credit}>{credit}</Text> : null}
    </View>
  );
}

function FigureFallback({
  exercise,
  size,
}: {
  exercise: { id: string; primaryMuscles: readonly string[]; secondaryMuscles?: readonly string[] | null };
  size: number;
}) {
  const views = useMemo(() => demoViews(exercise), [exercise]);
  const [viewIdx, setViewIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [runId, setRunId] = useState(0);
  const view = views[Math.min(viewIdx, views.length - 1)] ?? views[0];
  if (!view) return null;

  return (
    <View style={styles.wrap}>
      <FigureDemo
        pattern={view.pattern}
        size={size}
        primary={exercise.primaryMuscles}
        secondary={exercise.secondaryMuscles ?? []}
        playing={playing}
        runId={runId}
      />
      <View style={styles.controls}>
        <IconButton icon={playing ? 'pause' : 'play'} accessibilityLabel={playing ? 'Pause' : 'Play'} tone="neutral" onPress={() => setPlaying(!playing)} />
        <IconButton
          icon="replay"
          accessibilityLabel="Replay from the start"
          tone="neutral"
          onPress={() => {
            setPlaying(true);
            setRunId(runId + 1);
          }}
        />
        {views.length > 1 ? (
          <View style={styles.views}>
            <ChipRow options={views.map((v, i) => ({ label: v.label, value: i }))} value={viewIdx} onChange={setViewIdx} fill={false} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const HEAD = SEGMENTS * 4;

function Segment({ frame, index, stroke }: { frame: SharedValue<number[]>; index: number; stroke: string }) {
  const props = useAnimatedProps(() => {
    const f = frame.value;
    const i = index * 4;
    return { x1: f[i] ?? -100, y1: f[i + 1] ?? -100, x2: f[i + 2] ?? -100, y2: f[i + 3] ?? -100 };
  });
  return <AnimatedLine animatedProps={props} stroke={stroke} strokeWidth={STROKE} strokeLinecap="round" />;
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
  return <AnimatedCircle animatedProps={props} r={plate ? 8 : 4} fill={plate ? color.surface : color.text} stroke={color.textMuted} strokeWidth={plate ? 3 : 0} />;
}

/** Front views: a bar across both hands, with plates for a barbell. */
function Bar({ frame, plates }: { frame: SharedValue<number[]>; plates: boolean }) {
  const line = useAnimatedProps(() => {
    const f = frame.value;
    const rx = f[HEAD + 2] ?? -100;
    const lx = f[HEAD + 4] ?? -100;
    const y = ((f[HEAD + 3] ?? -100) + (f[HEAD + 5] ?? -100)) / 2;
    return { x1: lx - 12, y1: y, x2: rx + 12, y2: y };
  });
  const right = useAnimatedProps(() => {
    const f = frame.value;
    return { cx: (f[HEAD + 2] ?? -100) + 12, cy: ((f[HEAD + 3] ?? -100) + (f[HEAD + 5] ?? -100)) / 2 };
  });
  const left = useAnimatedProps(() => {
    const f = frame.value;
    return { cx: (f[HEAD + 4] ?? -100) - 12, cy: ((f[HEAD + 3] ?? -100) + (f[HEAD + 5] ?? -100)) / 2 };
  });
  return (
    <>
      <AnimatedLine animatedProps={line} stroke={color.textMuted} strokeWidth={3} strokeLinecap="round" />
      {plates ? <AnimatedCircle animatedProps={right} r={7} fill={color.surface} stroke={color.textMuted} strokeWidth={3} /> : null}
      {plates ? <AnimatedCircle animatedProps={left} r={7} fill={color.surface} stroke={color.textMuted} strokeWidth={3} /> : null}
    </>
  );
}

function Cable({ frame, anchor }: { frame: SharedValue<number[]>; anchor: readonly [number, number] }) {
  const props = useAnimatedProps(() => ({ x2: frame.value[HEAD + 2] ?? anchor[0], y2: frame.value[HEAD + 3] ?? anchor[1] }));
  return <AnimatedLine animatedProps={props} x1={anchor[0]} y1={anchor[1]} stroke={color.textFaint} strokeWidth={1.5} strokeDasharray="3 3" />;
}

const styles = StyleSheet.create({
  media: { borderRadius: radius.md, backgroundColor: color.surface },
  credit: { ...font.caption, color: color.textMuted, textAlign: 'center' },
  wrap: { alignItems: 'center', gap: space.lg },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  views: { marginLeft: space.sm },
});
