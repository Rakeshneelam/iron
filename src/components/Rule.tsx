import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { selection } from '@/lib/haptics';
import { EASE_OUT } from '@/theme/curves';
import { color, font, motion, space } from '@/theme/tokens';

import { useReducedMotion } from './Screen';

/**
 * A graduated tape under a number: where the number sits, and what it sits next to.
 *
 * A stepper says "100". It cannot say that last time was 97.5 and the plan says
 * 100 — that used to be a line of small print under the field, or a sheet away.
 * The rule puts both on a scale under the number, so "is this more than last
 * time" is answered by where two marks sit rather than by subtraction mid-set
 * (brief §6: "reveal the immediately relevant previous set directly within the
 * current interaction").
 *
 * The marks follow the app's drawing conventions (docs/13):
 *
 *   solid   — something you did: `last`, last session's same set
 *   hollow  — something planned: `target`, and a planned `band` (a rep range)
 *   line    — something derived: `trend`, the smoothed bodyweight
 *   heat    — the needle: the value under your thumb, the one live thing
 *
 * It is also an input. Dragging the tape scrubs the value a graduation at a time,
 * with a detent tick each step, for the big jumps where twenty taps of + is the
 * slow way. The ± buttons beside it stay the reliable way and the only way a
 * screen reader uses (the value's adjustable actions) — the drag is a shortcut,
 * never the door (brief §7). A tap on a labelled mark goes to that value: "target"
 * is the one-tap way back to the plan AGENTS §1.5 requires.
 */
export interface RuleMark {
  value: number;
  /** last — something you did (solid). target — planned (hollow). trend — derived (a line). */
  kind: 'last' | 'target' | 'trend';
  /** "last 97.5", "target 100". Short: it sits under a mark on a tape. */
  label: string;
  /** Tapping the mark sets the value to it. */
  onPress?: () => void;
}

export interface RuleProps {
  value: number;
  step: number;
  min: number;
  max: number;
  marks?: readonly RuleMark[];
  /** A planned range, drawn hollow along the tape — a rep range. */
  band?: readonly [number, number] | null;
  /** Graduations between the long ones. */
  major?: number;
  onChange?: (next: number) => void;
}

/** dp between graduations. Wide enough that a drag of one thumb-width is a few steps, not twenty. */
const SPACING = 14;
/** Graduations drawn either side of the window's centre; the window re-centres as the value travels. */
const WINDOW = 32;
const TICK_MINOR = 5;
const TICK_MAJOR = 9;
const HEIGHT = 33;
/** How far past either end a drag may pull before the tape resists. */
const RUBBER = 0.28;
const MARK_W = 72;
const GLYPH = 6;

type Align = 'centre' | 'before' | 'after';

/** Which mark keeps an edge when several lie beyond it. */
const PRIORITY: Record<RuleMark['kind'], number> = { target: 0, last: 1, trend: 2 };

export function Rule({ value, step, min, max, marks = [], band = null, major = 4, onChange }: RuleProps) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);

  /*
   * Which graduations exist. Their POSITIONS never depend on this — every tick sits
   * at value/step × SPACING in one coordinate space, and only the translate moves —
   * so re-centring the window as the value travels cannot make the tape jump.
   */
  const [centre, setCentre] = useState(value);
  if (Math.abs(value - centre) / step > WINDOW / 2) setCentre(value);
  const first = Math.ceil(Math.max(min, centre - WINDOW * step) / step - 1e-9);
  const last = Math.floor(Math.min(max, centre + WINDOW * step) / step + 1e-9);

  const ticks = useMemo(() => {
    let minor = '';
    let long = '';
    for (let i = first; i <= last; i++) {
      const x = (i - first) * SPACING + 1;
      if (i % major === 0) long += `M${x} 0V${TICK_MAJOR}`;
      else minor += `M${x} 0V${TICK_MINOR}`;
    }
    return { minor, long, width: (last - first) * SPACING + 2 };
  }, [first, last, major]);

  /** Where the value under the needle is, in value units. Animated; the needle never moves. */
  const pos = useSharedValue(value);
  const dragging = useSharedValue(false);
  const from = useSharedValue(value);
  /** Where a released drag is already settling, so the value it reports does not restart it. */
  const settling = useSharedValue<number | null>(null);

  useEffect(() => {
    if (dragging.get() || settling.get() === value) return;
    // ± is pressed tens of times a set: 150ms or nothing (docs/05).
    pos.set(reduced ? value : withTiming(value, { duration: motion.fast, easing: EASE_OUT }));
  }, [value, reduced, pos, dragging, settling]);

  const emit = (next: number) => {
    selection();
    onChange?.(next);
  };

  const dp = decimals(step);
  const snap = (v: number) => {
    'worklet';
    const f = 10 ** dp;
    return Math.min(max, Math.max(min, Math.round(Math.round(v / step) * step * f) / f));
  };

  /*
   * The detent: one call back to React per graduation crossed, never one per frame.
   * Only while a finger is on it — a ± press has already been through React.
   */
  useAnimatedReaction(
    () => (dragging.get() ? snap(pos.get()) : null),
    (now, before) => {
      if (now !== null && before !== null && now !== before) scheduleOnRN(emit, now);
    },
  );

  const pan = Gesture.Pan()
    .enabled(onChange !== undefined)
    // Horizontal intent only: a vertical swipe belongs to the sheet or the screen.
    .activeOffsetX([-8, 8])
    .failOffsetY([-14, 14])
    .onStart(() => {
      cancelAnimation(pos);
      settling.set(null);
      from.set(pos.get());
      dragging.set(true);
    })
    .onUpdate((e) => {
      // Pull the tape left and higher numbers come under the needle, as with a real one.
      const raw = from.get() - (e.translationX / SPACING) * step;
      const over = raw > max ? raw - max : raw < min ? raw - min : 0;
      pos.set(over === 0 ? raw : raw - over + over * RUBBER);
    })
    .onEnd((e) => {
      const velocity = (-e.velocityX / SPACING) * step;
      // A short projection, so a flick carries a few graduations rather than one.
      const target = snap(pos.get() + velocity * 0.12);
      settling.set(target);
      if (target !== snap(pos.get())) scheduleOnRN(emit, target);
      pos.set(
        withSpring(target, { ...motion.spring.rule, velocity }, (finished) => {
          if (finished) settling.set(null);
        }),
      );
    })
    .onFinalize(() => {
      dragging.set(false);
    });

  const half = width / 2;
  const tape = useAnimatedStyle(() => ({
    transform: [{ translateX: half - ((pos.get() - first * step) / step) * SPACING - 1 }],
  }));

  const xOf = (v: number) => ((v - first * step) / step) * SPACING + 1;
  /*
   * A mark further away than the tape shows would scroll out of reach — and the
   * target mark is the one-tap way back to the plan. Off-tape marks are pinned to
   * the edge they lie beyond, pointing at it, until the tape brings them in.
   */
  const reach = Math.max(0, half - MARK_W / 2) / SPACING;
  const live = marks.filter((m) => Number.isFinite(m.value));
  const onTape = live.filter((m) => Math.abs(m.value - value) / step <= reach);
  // One pinned mark per edge, or two would print over each other: the plan first,
  // then what you did, then the trend. The value's accessibility actions reach all.
  const offTape = (['below', 'above'] as const).flatMap((side) => {
    const beyond = live.filter((m) => Math.abs(m.value - value) / step > reach && (side === 'above' ? m.value > value : m.value < value));
    const pick = [...beyond].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind])[0];
    return pick ? [pick] : [];
  });
  const placed = place(onTape, step);

  return (
    <GestureDetector gesture={pan}>
      <View
        style={styles.wrap}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        // The value above already speaks for this: its adjustable actions, and a label
        // that names last time and the target. The tape would only repeat it badly.
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {width > 0 ? (
          <Animated.View style={[styles.tape, tape]}>
            <Svg width={ticks.width} height={TICK_MAJOR + 1} style={styles.ticks}>
              <Path d={ticks.minor} stroke={color.rule} strokeWidth={1} />
              <Path d={ticks.long} stroke={color.textFaint} strokeWidth={1.2} />
            </Svg>
            {band ? (
              <View pointerEvents="none" style={[styles.band, { left: xOf(band[0]) - 3, width: Math.max(6, xOf(band[1]) - xOf(band[0]) + 6) }]} />
            ) : null}
            {placed.map(({ mark, align }) => (
              <Mark key={mark.kind} mark={mark} x={xOf(mark.value)} align={align} />
            ))}
          </Animated.View>
        ) : null}
        {width > 0
          ? offTape.map((m) => (
              <Mark key={`edge-${m.kind}`} mark={{ ...m, label: m.value > value ? `${m.label} ›` : `‹ ${m.label}` }} x={m.value > value ? width - 2 : 2} align={m.value > value ? 'before' : 'after'} />
            ))
          : null}
        {/* The needle does not move; the record moves under it. */}
        <View pointerEvents="none" style={[styles.needle, { left: half - 1 }]} />
      </View>
    </GestureDetector>
  );
}

/**
 * Two marks a few graduations apart would print their labels over each other, so
 * the pair's labels turn away from each other: the lower one reads leftwards from
 * its glyph, the higher one rightwards. Equal marks are one fact, said once.
 */
function place(marks: readonly RuleMark[], step: number): { mark: RuleMark; align: Align }[] {
  const sorted = [...marks].sort((x, y) => x.value - y.value);
  // Equal marks are one fact: keep the planned one, and say it matches.
  const merged: RuleMark[] = [];
  for (const m of sorted) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(prev.value - m.value) < 1e-9) {
      const keep = prev.kind === 'target' ? prev : m.kind === 'target' ? m : prev;
      const other = keep === prev ? m : prev;
      merged[merged.length - 1] = { ...keep, label: `${keep.label} = ${other.kind}` };
    } else merged.push(m);
  }
  const near = (a: RuleMark, b: RuleMark) => (Math.abs(b.value - a.value) / step) * SPACING < MARK_W;
  return merged.map((m, i) => {
    const before = merged[i - 1];
    const after = merged[i + 1];
    const crowdedLeft = before !== undefined && near(before, m);
    const crowdedRight = after !== undefined && near(m, after);
    // Turn away from whichever neighbour is too close; a mark crowded on both sides keeps the middle.
    const align: Align = crowdedLeft && crowdedRight ? 'centre' : crowdedRight ? 'before' : crowdedLeft ? 'after' : 'centre';
    return { mark: m, align };
  });
}

/** A labelled mark under the ticks. Solid for what you did, hollow for what is planned. */
function Mark({ mark, x, align }: { mark: RuleMark; x: number; align: Align }) {
  const solid = mark.kind === 'last';
  const line = mark.kind === 'trend';
  const left = align === 'centre' ? x - MARK_W / 2 : align === 'before' ? x + GLYPH / 2 + 2 - MARK_W : x - GLYPH / 2 - 2;
  const items = align === 'centre' ? styles.centre : align === 'before' ? styles.end : styles.start;
  const body = (
    <>
      <View style={line ? styles.glyphLine : [styles.glyph, solid ? styles.glyphSolid : styles.glyphHollow]} />
      <Text style={[styles.markLabel, solid || line ? styles.markLabelLast : styles.markLabelTarget]} numberOfLines={1}>
        {mark.label}
      </Text>
    </>
  );
  const box = [styles.mark, items, { left }];
  if (!mark.onPress) {
    return (
      <View pointerEvents="none" style={box}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={mark.onPress}
      // Small on the tape, generous under a thumb. A drag still wins: the pan only
      // claims a touch once it has moved 8dp sideways, and a tap never does.
      hitSlop={{ top: space.sm, bottom: space.md, left: space.xs, right: space.xs }}
      style={box}
    >
      {body}
    </Pressable>
  );
}

function decimals(step: number): number {
  const s = String(step);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

const styles = StyleSheet.create({
  wrap: { height: HEIGHT, overflow: 'hidden', alignSelf: 'stretch' },
  tape: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 1 },
  ticks: { position: 'absolute', left: 0, top: 0 },
  band: {
    position: 'absolute',
    top: TICK_MAJOR + 4,
    height: 5,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: color.textMuted,
  },
  mark: { position: 'absolute', top: TICK_MAJOR + 3, width: MARK_W, gap: 2 },
  centre: { alignItems: 'center' },
  end: { alignItems: 'flex-end' },
  start: { alignItems: 'flex-start' },
  glyph: { width: GLYPH, height: GLYPH, transform: [{ rotate: '45deg' }], borderRadius: 1, marginHorizontal: 2 },
  glyphSolid: { backgroundColor: color.text },
  glyphHollow: { borderWidth: 1.5, borderColor: color.text },
  /** Derived: a line, the width of the diamond's diagonal, so the labels still align. */
  glyphLine: { width: 2, height: 10, borderRadius: 1, backgroundColor: color.textMuted, marginHorizontal: 4 },
  markLabel: { ...font.caption, fontSize: 11, lineHeight: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  markLabelLast: { color: color.textMuted },
  markLabelTarget: { color: color.text },
  needle: { position: 'absolute', top: 0, width: 2, height: TICK_MAJOR + 3, borderRadius: 1, backgroundColor: color.accent },
});
