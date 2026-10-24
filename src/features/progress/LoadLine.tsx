import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { G, Line, Path, Rect } from 'react-native-svg';

import { Press } from '@/components/Press';
import { useReducedMotion } from '@/components/Screen';
import type { SetRow } from '@/db/repositories/sessions';
import { fmtDayLabel } from '@/lib/date';
import { kgNum } from '@/lib/format';
import { EASE_OUT } from '@/theme/curves';
import { color, font, motion, radius, space } from '@/theme/tokens';

/**
 * One lift's record — every session of it, and today — drawn rather than charted.
 *
 * A line chart answers "is the number going up". That is not the question a
 * lifter asks. The question is "what did I actually do, and what is being asked
 * of me next" — and one plotted point per session throws away the shape of the
 * work: three clean sets and three grinding ones become the same dot.
 *
 * So every working set gets its own mark, and three logged columns drive three
 * visual properties:
 *
 *   vertical position  →  load     (set_log.weight)
 *   bar width          →  reps     (set_log.reps)
 *   fill density       →  effort   (set_log.rir, 0 = nothing left in the tank)
 *
 * And the drawing conventions every instrument in the app shares (docs/13):
 *
 *   solid       — a set you logged
 *   hollow      — a set still planned; drawn in heat when it is the one under
 *                 your thumb, because the steppers move it as you dial
 *   heat → ink  — the set you just logged, arriving hot and cooling into the
 *                 record over `motion.cool`. Hollow becomes solid becomes chalk:
 *                 the plan turning into a fact, in the one place you look
 *   datum       — your best before today, a labelled line across the record. A
 *                 set past it is drawn green and the label says by how much. A
 *                 first-ever session is never a record — there was nothing to beat
 *   dimension   — the change from last session's top set to today's, with its
 *                 exact value. Never a percentage: kilograms are what you load
 *   break       — a zigzag on the floor where training stopped for a while, as a
 *                 drawing marks an omitted length. Time off is part of the record
 *
 * Nothing is derived except the datum (a maximum) and, on the exercise page, the
 * estimated 1RM — and that lives in its own lane above the marks, as a line, under
 * the word "estimated", so an estimate never sits among the things you lifted.
 *
 * Exercises with no external load have nothing to say on a load axis, so position
 * switches to reps and the width encoding is dropped rather than drawing a
 * dimension that does not exist.
 */

export interface LoadLineSession {
  sessionId: string;
  date: string;
  sets: SetRow[];
}

export interface LoadLineToday {
  /** Working sets logged in this session, in order. */
  sets: readonly SetRow[];
  /** How many sets today is running to, so the empty slots are drawn. */
  target: number;
  /** What the steppers currently say. Moves live. */
  proposed: { weight: number; reps: number } | null;
  /** The set logged a moment ago — drawn hot, cooling into ink. One id, so reopening a session sets nothing off. */
  justLoggedId?: string | null;
  /** Tapping a logged column edits it. */
  onEditSet?: (s: SetRow) => void;
}

export interface LoadLineProps {
  /** Newest-first, as `exerciseSessions` returns it. */
  sessions: readonly LoadLineSession[];
  today?: LoadLineToday;
  /** Reps are seconds for timed work; changes wording only. */
  measure?: 'reps' | 'time';
  height?: number;
  /** How many past sessions to draw inline. Older ones fall off the left. */
  limit?: number;
  /**
   * The exercise page: every session, scrolled to the newest, with the estimate
   * lane above. Columns stop shrinking to fit and the record scrolls instead —
   * the history is direct manipulation, not a summary of itself.
   */
  full?: boolean;
  /** Per-session estimated 1RM, for the estimate lane. `full` only. */
  estimate?: readonly { sessionId: string; e1rm: number }[];
  /** A picked session's way further in (the exercise page opens its workout). */
  onOpenSession?: (sessionId: string) => void;
}

/** Below this a column is too thin to read a width off. */
const MIN_COL = 22;
/** The exercise page's columns: wide enough to tap, narrow enough to show months. */
const FULL_COL = 30;
const PAD_Y = 12;
/** A break in training is data. Past this, draw the break. */
const GAP_DAYS = 10;
const LANE = 44;

const daysBetween = (a: string, b: string) => Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000);

/** RIR 0 is everything you had; RIR 4+ is a warm-up in disguise. */
const densityFor = (rir: number) => Math.max(0.4, 1 - Math.min(4, Math.max(0, rir)) * 0.15);

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export function LoadLine({ sessions, today, measure = 'reps', height = 120, limit = 7, full = false, estimate, onOpenSession }: LoadLineProps) {
  const [viewport, setViewport] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const scroller = useRef<ScrollView>(null);

  // Oldest-left is the only order a history reads in.
  const past = useMemo(() => (full ? [...sessions] : sessions.slice(0, limit)).reverse(), [sessions, limit, full]);

  const model = useMemo(() => {
    const pastSets = past.flatMap((s) => s.sets);
    const logged = [...pastSets, ...(today?.sets ?? [])];
    if (logged.length === 0 && !today?.proposed) return null;
    // An exercise nobody loads has nothing to say on a load axis.
    const loaded = logged.some((s) => s.weight > 0) || (today?.proposed?.weight ?? 0) > 0;
    const valueOf = (w: number, r: number) => (loaded ? w : r);
    const values = logged.map((s) => valueOf(s.weight, s.reps));
    if (today?.proposed) values.push(valueOf(today.proposed.weight, today.proposed.reps));
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const maxReps = Math.max(...logged.map((s) => s.reps), today?.proposed?.reps ?? 0, 1);
    // The datum: your best BEFORE today, by the axis's own measure.
    const datum = pastSets.length ? Math.max(...pastSets.map((s) => valueOf(s.weight, s.reps))) : null;
    const lastSession = past[past.length - 1];
    const lastTop = lastSession?.sets.length ? Math.max(...lastSession.sets.map((s) => valueOf(s.weight, s.reps))) : null;
    return { loaded, valueOf, lo, hi, maxReps, datum, lastTop };
  }, [past, today]);

  const todayCols = today ? Math.max(today.target, today.sets.length) : 0;
  const cols = past.length + todayCols;
  const colW = full ? FULL_COL : viewport > 0 && cols > 0 ? Math.max(MIN_COL, viewport / cols) : MIN_COL;
  const plotW = full ? Math.max(viewport, cols * colW) : viewport;

  // The newest end is where a history is read from; start there.
  useEffect(() => {
    if (full && plotW > viewport) scroller.current?.scrollToEnd({ animated: false });
  }, [full, plotW, viewport]);

  if (!model) {
    return (
      <View style={[styles.empty, { minHeight: Math.min(height, 72) }]} accessible accessibilityLabel="No history for this exercise yet. Your first set starts it.">
        <View style={styles.emptyFloor} />
        <Text style={styles.emptyText}>No history yet. Your first set starts the record here.</Text>
      </View>
    );
  }

  const { loaded, valueOf, lo, hi, maxReps, datum, lastTop } = model;
  const span = hi - lo || 1;
  // A flat history would otherwise pin every mark to one edge.
  const yFor = (v: number) => {
    const t = hi === lo ? 0.5 : (v - lo) / span;
    return height - PAD_Y - t * (height - PAD_Y * 2);
  };
  const splitX = past.length * colW;
  const unit = loaded ? 'kg' : measure === 'time' ? 's' : 'reps';
  const fmtV = (v: number) => (loaded ? kgNum(v) : `${v}${measure === 'time' ? 's' : ''}`);
  const barFor = (r: number) => (loaded ? Math.max(0.34, r / maxReps) * (colW - 6) : colW - 10);

  const todayValues = (today?.sets ?? []).map((s) => valueOf(s.weight, s.reps));
  const todayBest = todayValues.length ? Math.max(...todayValues) : null;
  const newBest = datum !== null && todayBest !== null && todayBest > datum + 1e-6;
  const proposedV = today?.proposed ? valueOf(today.proposed.weight, today.proposed.reps) : null;
  // The dimension compares like with like: last session's top against today's top,
  // or against the set under your thumb before anything is logged.
  const nowV = todayBest ?? proposedV;
  const delta = lastTop !== null && nowV !== null && today ? Math.round((nowV - lastTop) * 100) / 100 : null;

  const pickedSession = past.find((s) => s.sessionId === picked) ?? null;
  /** The estimate lane pushes the plot down; overlays have to know by how much. */
  const laneOffset = full && estimate?.length ? LANE : 0;

  const plot = (
    <View style={{ width: plotW }}>
      {full && estimate?.length ? <EstimateLane past={past} estimate={estimate} colW={colW} width={plotW} /> : null}
      <View style={[styles.plot, { height }]}>
        {plotW > 0 ? (
          <Svg width={plotW} height={height}>
            {/* The floor of the range, so marks sit on something rather than float. */}
            <Line x1={0} y1={height - PAD_Y / 2} x2={plotW} y2={height - PAD_Y / 2} stroke={color.border} strokeWidth={1} />

            {datum !== null ? (
              <Line x1={0} y1={yFor(datum)} x2={plotW} y2={yFor(datum)} stroke={color.positive} strokeWidth={1} opacity={0.55} />
            ) : null}

            {past.map((s, i) => {
              const cx = i * colW + colW / 2;
              const prev = past[i - 1];
              const gap = prev ? daysBetween(s.date, prev.date) : 0;
              const on = s.sessionId === picked;
              return (
                <G key={s.sessionId}>
                  {gap > GAP_DAYS ? <BreakMark x={i * colW} y={height - PAD_Y / 2} /> : null}
                  {s.sets.map((set) => {
                    const w = barFor(set.reps);
                    return (
                      <Rect
                        key={set.id}
                        x={cx - w / 2}
                        y={yFor(valueOf(set.weight, set.reps)) - 2.5}
                        width={w}
                        height={5}
                        rx={1.5}
                        fill={set.painFlag ? color.danger : color.text}
                        opacity={(on || picked === null ? 0.72 : 0.38) * densityFor(set.rir) + (on ? 0.28 : 0)}
                      />
                    );
                  })}
                </G>
              );
            })}

            {/* Where the record stops and today begins. */}
            {today && past.length > 0 ? <Line x1={splitX} y1={0} x2={splitX} y2={height} stroke={color.border} strokeWidth={1} /> : null}

            {/* On the divider itself: the step from last time to today, measured where the two meet. */}
            {delta !== null && delta !== 0 && lastTop !== null && nowV !== null ? <Dimension x={splitX} y1={yFor(lastTop)} y2={yFor(nowV)} /> : null}

            {today
              ? Array.from({ length: todayCols }, (_, i) => {
                  const cx = splitX + i * colW + colW / 2;
                  const done = today.sets[i];
                  if (done) {
                    const v = valueOf(done.weight, done.reps);
                    const w = barFor(done.reps);
                    const ink = done.painFlag ? color.danger : datum !== null && v > datum + 1e-6 ? color.positive : color.text;
                    return (
                      <G key={done.id}>
                        <Rect x={cx - w / 2} y={yFor(v) - 3} width={w} height={6} rx={1.5} fill={ink} opacity={densityFor(done.rir)} />
                        {done.id === today.justLoggedId && !reduced ? <Cooling x={cx - w / 2} y={yFor(v) - 3} width={w} /> : null}
                      </G>
                    );
                  }
                  // The next slot carries the steppers; the ones after it are just waiting.
                  if (!today.proposed || proposedV === null) return null;
                  const next = i === today.sets.length;
                  const w = barFor(today.proposed.reps);
                  return (
                    <Rect
                      key={`todo-${i}`}
                      x={cx - w / 2}
                      y={yFor(proposedV) - 3.5}
                      width={w}
                      height={7}
                      rx={1.5}
                      fill="none"
                      stroke={next ? color.accent : color.textMuted}
                      strokeWidth={next ? 1.8 : 1}
                      opacity={next ? 1 : 0.45}
                    />
                  );
                })
              : null}
          </Svg>
        ) : null}

      </View>

      {/* Real tap targets, outside the SVG, so they are reachable and 32dp tall. */}
      <View style={styles.picks}>
        {past.map((s) => (
          <Press
            key={s.sessionId}
            onPress={() => setPicked(s.sessionId === picked ? null : s.sessionId)}
            accessibilityRole="button"
            accessibilityState={{ selected: s.sessionId === picked }}
            accessibilityLabel={`${fmtDayLabel(s.date)}: ${s.sets.map((x) => setText(x.weight, x.reps, loaded, measure)).join(', ')}`}
            feedback="highlight"
            style={[styles.pick, { width: colW }]}
            pressedStyle={styles.pickHeld}
          >
            <View style={[styles.tick, s.sessionId === picked && styles.tickOn]} />
          </Press>
        ))}
        {today
          ? Array.from({ length: todayCols }, (_, i) => {
              const done = today.sets[i];
              return (
                <Press
                  key={`pick-today-${i}`}
                  onPress={() => done && today.onEditSet?.(done)}
                  disabled={!done}
                  accessibilityRole={done ? 'button' : undefined}
                  accessibilityLabel={done ? `Set ${i + 1} today: ${setText(done.weight, done.reps, loaded, measure)}. Tap to edit.` : undefined}
                  feedback="highlight"
                  style={[styles.pick, { width: colW }]}
                  pressedStyle={styles.pickHeld}
                >
                  <View style={[styles.tick, done ? styles.tickDone : styles.tickToday]} />
                </Press>
              );
            })
          : null}
      </View>
    </View>
  );

  return (
    <View style={styles.wrap}>
      <View
        onLayout={(e) => setViewport(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${past.length} past ${past.length === 1 ? 'session' : 'sessions'}${today ? ' and today' : ''}, ${
          loaded ? `${kgNum(lo)} to ${kgNum(hi)} kilograms` : `${lo} to ${hi} ${unit}`
        }. Each bar is one set: higher is heavier, wider is more reps.${datum !== null ? ` Best before today: ${fmtV(datum)} ${unit}.` : ''}${
          newBest ? ' Today went past it.' : ''
        }`}
      >
        {full ? (
          <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false}>
            {plot}
          </ScrollView>
        ) : (
          plot
        )}
        {/*
          Overlays, outside the scroll, so the record's labels stay on screen while
          its history moves under them.
        */}
        {datum !== null ? (
          <Text style={[styles.datum, { top: laneOffset + Math.max(0, yFor(datum) - 15) }]} numberOfLines={1}>
            {newBest && todayBest !== null ? `new best +${fmtV(Math.round((todayBest - datum) * 100) / 100)}` : `best ${fmtV(datum)}`}
          </Text>
        ) : null}
        {/* Two numbers, not a gridline: the range the picture is drawn inside. */}
        <Text style={[styles.axis, { top: laneOffset }]}>{loaded ? `${kgNum(hi)} kg` : `${hi} ${unit}`}</Text>
        <Text style={[styles.axis, styles.axisBottom]}>{loaded ? `${kgNum(lo)} kg` : `${lo} ${unit}`}</Text>
      </View>

      {/*
        Exact values, always, at a size readable at arm's length on a bench. The
        drawing carries the comparison; this carries the facts (§13).
      */}
      <Text style={styles.readout} numberOfLines={2}>
        {pickedSession ? (
          <>
            <Text style={styles.readoutTag}>{fmtDayLabel(pickedSession.date)}</Text>
            {'   '}
            {pickedSession.sets.map((x) => setText(x.weight, x.reps, loaded, measure)).join('   ')}
          </>
        ) : today ? (
          <>
            <Text style={styles.readoutTag}>Today</Text>
            {'   '}
            {today.sets.length
              ? today.sets.map((x) => setText(x.weight, x.reps, loaded, measure)).join('   ')
              : today.proposed
                ? `${setText(today.proposed.weight, today.proposed.reps, loaded, measure)} up next`
                : '—'}
            {/* The dimension's value, said where it can be read: exact, in the unit you load. */}
            {delta !== null && delta !== 0 ? (
              <Text style={[styles.readoutDelta, delta > 0 && styles.readoutUp]}>
                {'   '}
                {delta > 0 ? '+' : '−'}
                {fmtV(Math.abs(delta))}
                {loaded ? ' kg' : ''} on last time
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.readoutTag}>Tap a session to read its sets</Text>
        )}
      </Text>
      {pickedSession && onOpenSession ? (
        <Press onPress={() => onOpenSession(pickedSession.sessionId)} accessibilityRole="button" hitSlop={space.sm} style={styles.open}>
          <Text style={styles.openText}>Open this workout</Text>
        </Press>
      ) : null}
    </View>
  );
}

/**
 * The set just logged, as light over its own ink. It arrives at full heat and
 * fades to nothing over `motion.cool`, leaving the chalk mark underneath — so the
 * record never shows a colour it will not keep. Opacity only: one property, on the
 * UI thread, and nothing else re-lays-out.
 */
function Cooling({ x, y, width }: { x: number; y: number; width: number }) {
  const heat = useSharedValue(1);
  useEffect(() => {
    heat.set(withTiming(0, { duration: motion.cool, easing: EASE_OUT }));
  }, [heat]);
  const props = useAnimatedProps(() => ({ opacity: heat.get() }));
  return <AnimatedRect x={x - 1} y={y - 1} width={width + 2} height={8} rx={2} fill={color.accent} animatedProps={props} />;
}

/** A drawing's break line: the length between was left out, and says so. */
function BreakMark({ x, y }: { x: number; y: number }) {
  return <Path d={`M${x - 4} ${y + 3}L${x - 1} ${y - 4}L${x + 1} ${y + 4}L${x + 4} ${y - 3}`} stroke={color.textFaint} strokeWidth={1.2} fill="none" />;
}

/** A dimension: a measured difference between two levels, with arrowheads, value beside it. */
function Dimension({ x, y1, y2 }: { x: number; y1: number; y2: number }) {
  const up = y2 < y1;
  const a = 3;
  return (
    <G>
      <Line x1={x} y1={y1} x2={x} y2={y2} stroke={color.text} strokeWidth={1.5} />
      <Path d={`M${x - a} ${y2 + (up ? a : -a)}L${x} ${y2}L${x + a} ${y2 + (up ? a : -a)}`} stroke={color.text} strokeWidth={1.5} fill="none" />
      <Line x1={x - a} y1={y1} x2={x + a} y2={y1} stroke={color.text} strokeWidth={1.5} />
    </G>
  );
}

/**
 * The estimated 1RM, per session, as a line in its own lane above the marks.
 *
 * Derived, so it is a line; estimated, so it is labelled as one; in its own lane
 * with its own range, because putting an estimate on the same axis as the loads
 * you lifted would let it be read as one of them (brief §6).
 */
function EstimateLane({ past, estimate, colW, width }: { past: readonly LoadLineSession[]; estimate: readonly { sessionId: string; e1rm: number }[]; colW: number; width: number }) {
  const bySession = new Map(estimate.map((e) => [e.sessionId, e.e1rm]));
  const pts = past.map((s, i) => ({ x: i * colW + colW / 2, v: bySession.get(s.sessionId) })).filter((p): p is { x: number; v: number } => p.v !== undefined);
  if (pts.length === 0) return null;
  const lo = Math.min(...pts.map((p) => p.v));
  const hi = Math.max(...pts.map((p) => p.v));
  const y = (v: number) => (hi === lo ? LANE / 2 : LANE - 8 - ((v - lo) / (hi - lo)) * (LANE - 22));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${y(p.v)}`).join('');
  const lastPt = pts[pts.length - 1];
  return (
    <View style={{ height: LANE }}>
      <Svg width={width} height={LANE}>
        <Path d={d} stroke={color.textMuted} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
        {lastPt ? <Rect x={lastPt.x - 2.5} y={y(lastPt.v) - 2.5} width={5} height={5} fill={color.textMuted} /> : null}
      </Svg>
      <Text style={styles.laneLabel} numberOfLines={1}>
        Estimated 1RM {kgNum(Math.round(lo))}–{kgNum(Math.round(hi))} kg
      </Text>
    </View>
  );
}

function setText(w: number, r: number, loaded: boolean, measure: 'reps' | 'time'): string {
  if (!loaded) return measure === 'time' ? `${r}s` : `${r}`;
  return `${kgNum(w)}×${r}`;
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  plot: { position: 'relative', justifyContent: 'center' },
  axis: { position: 'absolute', right: 0, ...font.caption, fontSize: 11, lineHeight: 13, fontVariant: ['tabular-nums'], color: color.textFaint },
  axisBottom: { bottom: 32 + 2 },
  datum: { position: 'absolute', left: 0, ...font.caption, fontSize: 11, lineHeight: 13, fontWeight: '600', fontVariant: ['tabular-nums'], color: color.positive },
  laneLabel: { position: 'absolute', left: 0, top: 0, ...font.caption, fontSize: 11, lineHeight: 13, color: color.textFaint },
  picks: { flexDirection: 'row' },
  pick: { height: 32, alignItems: 'center', justifyContent: 'center' },
  pickHeld: { backgroundColor: color.surfaceHigh, borderRadius: radius.sm },
  tick: { width: 14, height: 2, borderRadius: radius.pill, backgroundColor: color.border },
  tickOn: { backgroundColor: color.text },
  tickToday: { backgroundColor: color.textFaint, opacity: 0.5 },
  tickDone: { backgroundColor: color.text },
  /** 16pt, tabular: these are the numbers you check mid-set without leaning in. */
  readout: { ...font.label, fontSize: 16, lineHeight: 22, fontWeight: '600', ...font.numeric, color: color.text },
  readoutTag: { ...font.eyebrow, color: color.textFaint },
  readoutDelta: { ...font.caption, fontSize: 13, fontWeight: '600', color: color.textMuted },
  readoutUp: { color: color.positive },
  open: { alignSelf: 'flex-start', paddingVertical: space.xs },
  openText: { ...font.caption, fontWeight: '600', color: color.text, textDecorationLine: 'underline' },
  empty: { justifyContent: 'center', gap: space.sm },
  emptyFloor: { height: 1, backgroundColor: color.border },
  emptyText: { ...font.caption, color: color.textMuted },
});

/**
 * How to read the record, in one line of its own marks. A new visual grammar has
 * to teach itself (brief §13): this is the key, drawn with the same glyphs.
 */
export function RecordLegend({ estimate = false }: { estimate?: boolean }) {
  return (
    <View style={legend.row} accessible accessibilityLabel={`How to read this: each bar is a set you logged; higher is heavier, wider is more reps, fainter means more left in reserve. The green line is your best before today.${estimate ? ' The thin line above is the estimated one-rep max.' : ''}`}>
      <View style={legend.item}>
        <View style={[legend.bar, legend.solid]} />
        <Text style={legend.text}>a set: higher is heavier, wider is more reps</Text>
      </View>
      <View style={legend.item}>
        <View style={[legend.bar, legend.faint]} />
        <Text style={legend.text}>fainter, more left in reserve</Text>
      </View>
      <View style={legend.item}>
        <View style={legend.datum} />
        <Text style={legend.text}>your best before today</Text>
      </View>
      {estimate ? (
        <View style={legend.item}>
          <View style={legend.line} />
          <Text style={legend.text}>estimated 1RM (a calculation, not a lift)</Text>
        </View>
      ) : null}
    </View>
  );
}

const legend = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  bar: { width: 14, height: 4, borderRadius: 1.5 },
  solid: { backgroundColor: color.text },
  faint: { backgroundColor: color.text, opacity: 0.45 },
  datum: { width: 14, height: 1.5, backgroundColor: color.positive },
  line: { width: 14, height: 1.5, backgroundColor: color.textMuted },
  text: { ...font.caption, fontSize: 12, color: color.textMuted },
});
