import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line, Rect } from 'react-native-svg';

import { Press } from '@/components/Press';
import type { SetRow } from '@/db/repositories/sessions';
import { fmtDayLabel } from '@/lib/date';
import { kgNum } from '@/lib/format';
import { color, font, radius, space } from '@/theme/tokens';

/**
 * One lift's whole history, as a grammar rather than a chart.
 *
 * A line chart answers "is the number going up". That is not the question a
 * lifter asks. The question is "what did I actually do, and what is being asked
 * of me next" — and a single plotted point per session throws away the shape of
 * the work: three clean sets and three grinding ones become the same dot.
 *
 * So every working set gets its own mark, and three logged columns drive three
 * visual properties:
 *
 *   vertical position  →  load          (set_log.weight)
 *   bar width          →  reps          (set_log.reps)
 *   fill density       →  effort        (set_log.rir, 0 = nothing left)
 *
 * Nothing here is a derived score. There is no composite "progress index", no
 * percentage, no trend line fitted through six points. A plateau looks like a
 * flat run because the loads were flat; a back-off week sits visibly lower
 * because it was lighter. The picture cannot flatter the data because it IS
 * the data (AGENTS §6 — opaque suggestions are an anti-feature).
 *
 * Exercises with no external load (bodyweight, bands) have nothing meaningful on
 * the load axis, so position switches to reps and the width encoding is dropped
 * rather than drawing a dimension that does not exist.
 */

export interface LoadLineSession {
  sessionId: string;
  date: string;
  sets: SetRow[];
}

export interface LoadLineProps {
  /** Newest-first, as `exerciseSessions` returns it. */
  sessions: readonly LoadLineSession[];
  /** What the engine is asking for next, drawn hollow at the right edge. */
  proposed?: { weight: number; reps: number } | null;
  /** Reps are seconds for timed work, which changes the caption wording only. */
  measure?: 'reps' | 'time';
  height?: number;
  /** How many sessions to draw. Older ones fall off the left. */
  limit?: number;
}

/** Below this, a column is too thin to read a width off. */
const MIN_COL = 26;
const PAD_Y = 14;
/** A break in training is data. Anything past this draws a visible gap. */
const GAP_DAYS = 10;

const daysBetween = (a: string, b: string) => Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000);

/** RIR 0 is everything you had; RIR 4+ is a warm-up in disguise. */
const densityFor = (rir: number) => Math.max(0.4, 1 - Math.min(4, Math.max(0, rir)) * 0.15);

export function LoadLine({ sessions, proposed, measure = 'reps', height = 132, limit = 8 }: LoadLineProps) {
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);

  // Oldest-left is the only order a history reads in.
  const shown = useMemo(() => [...sessions].slice(0, limit).reverse(), [sessions, limit]);

  const model = useMemo(() => {
    const all = shown.flatMap((s) => s.sets);
    if (all.length === 0) return null;
    // An exercise nobody loads has nothing to say on a load axis.
    const loaded = all.some((s) => s.weight > 0);
    const valueOf = (s: SetRow) => (loaded ? s.weight : s.reps);
    const values = all.map(valueOf);
    const proposedValue = proposed ? (loaded ? proposed.weight : proposed.reps) : null;
    const lo = Math.min(...values, proposedValue ?? Infinity);
    const hi = Math.max(...values, proposedValue ?? -Infinity);
    const maxReps = Math.max(...all.map((s) => s.reps), proposed?.reps ?? 0, 1);
    // The best estimated single, for the one mark that gets called out.
    const best = all.reduce((b, s) => (s.e1rm > (b?.e1rm ?? -1) ? s : b), undefined as SetRow | undefined);
    return { loaded, valueOf, lo, hi, maxReps, best, proposedValue };
  }, [shown, proposed]);

  if (shown.length === 0 || !model) {
    return (
      <View style={[styles.empty, { minHeight: height }]}>
        <Text style={styles.emptyText}>No history yet. This is where it starts.</Text>
      </View>
    );
  }

  const { loaded, valueOf, lo, hi, maxReps, best, proposedValue } = model;
  const span = hi - lo || 1;
  // A flat history would otherwise pin every mark to the top edge.
  const yFor = (v: number) => {
    const t = hi === lo ? 0.5 : (v - lo) / span;
    return height - PAD_Y - t * (height - PAD_Y * 2);
  };

  const cols = shown.length + (proposed ? 1 : 0);
  const colW = width > 0 ? Math.max(MIN_COL, width / cols) : MIN_COL;
  const unit = loaded ? 'kg' : measure === 'time' ? 's' : 'reps';

  const selected = shown.find((s) => s.sessionId === picked) ?? shown[shown.length - 1];

  return (
    <View style={styles.wrap}>
      <View
        style={[styles.plot, { height }]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`History: ${shown.length} ${shown.length === 1 ? 'session' : 'sessions'}, ${
          loaded ? `${kgNum(lo)} to ${kgNum(hi)} kg` : `${lo} to ${hi} ${unit}`
        }. Each bar is one set; higher is heavier, wider is more reps.`}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            {/* The floor of the range, so the marks sit on something rather than float. */}
            <Line x1={0} y1={height - PAD_Y / 2} x2={width} y2={height - PAD_Y / 2} stroke={color.border} strokeWidth={1} />
            {shown.map((s, i) => {
              const cx = i * colW + colW / 2;
              const prev = shown[i - 1];
              const gap = prev ? daysBetween(s.date, prev.date) : 0;
              return (
                <G key={s.sessionId}>
                  {gap > GAP_DAYS ? (
                    <Line
                      x1={i * colW}
                      y1={PAD_Y / 2}
                      x2={i * colW}
                      y2={height - PAD_Y / 2}
                      stroke={color.border}
                      strokeWidth={1}
                      strokeDasharray="2 4"
                    />
                  ) : null}
                  {s.sets.map((set) => {
                    const w = loaded ? Math.max(0.34, set.reps / maxReps) * (colW - 8) : colW - 12;
                    const y = yFor(valueOf(set));
                    const isBest = best !== undefined && set.id === best.id;
                    const isPicked = s.sessionId === selected?.sessionId;
                    return (
                      <Rect
                        key={set.id}
                        x={cx - w / 2}
                        y={y - 3}
                        width={w}
                        height={6}
                        rx={2}
                        fill={set.painFlag ? color.danger : isBest ? color.positive : color.text}
                        opacity={(isPicked ? 1 : 0.55) * densityFor(set.rir)}
                      />
                    );
                  })}
                </G>
              );
            })}
            {/* What is being asked for next, hollow because it has not happened. */}
            {proposed && proposedValue !== null ? (
              <Rect
                x={shown.length * colW + 4}
                y={yFor(proposedValue) - 4}
                width={colW - 8}
                height={8}
                rx={2}
                fill="none"
                stroke={color.accent}
                strokeWidth={1.5}
                strokeDasharray="3 2"
              />
            ) : null}
          </Svg>
        ) : null}

        {/* Two numbers, not a gridline: the range the picture is drawn inside. */}
        <Text style={[styles.axis, styles.axisTop]}>{loaded ? `${kgNum(hi)} kg` : `${hi} ${unit}`}</Text>
        <Text style={[styles.axis, styles.axisBottom]}>{loaded ? `${kgNum(lo)} kg` : `${lo} ${unit}`}</Text>
      </View>

      {/* The tap targets live outside the SVG so they are real, 44dp, and reachable. */}
      <View style={styles.picks}>
        {shown.map((s) => (
          <Press
            key={s.sessionId}
            onPress={() => setPicked(s.sessionId)}
            accessibilityRole="button"
            accessibilityLabel={`${fmtDayLabel(s.date)}: ${s.sets.map((x) => setText(x, loaded, measure)).join(', ')}`}
            accessibilityState={{ selected: s.sessionId === selected?.sessionId }}
            feedback="highlight"
            style={[styles.pick, { width: colW }]}
            pressedStyle={styles.pickHeld}
          >
            <View style={[styles.pickMark, s.sessionId === selected?.sessionId && styles.pickMarkOn]} />
          </Press>
        ))}
        {proposed ? <View style={{ width: colW }} /> : null}
      </View>

      {/* Exact values, always. The grammar shows shape; this keeps it readable (§13). */}
      {selected ? (
        <Text style={styles.readout} numberOfLines={2}>
          <Text style={styles.readoutDate}>{fmtDayLabel(selected.date)}</Text>
          {'   '}
          {selected.sets.map((x) => setText(x, loaded, measure)).join('   ')}
        </Text>
      ) : null}
    </View>
  );
}

function setText(s: SetRow, loaded: boolean, measure: 'reps' | 'time'): string {
  if (!loaded) return measure === 'time' ? `${s.reps}s` : `${s.reps}`;
  return `${kgNum(s.weight)}×${s.reps}`;
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  plot: { position: 'relative', justifyContent: 'center' },
  axis: { position: 'absolute', right: 0, ...font.caption, fontSize: 11, lineHeight: 14, ...font.numeric, color: color.textFaint },
  axisTop: { top: 0 },
  axisBottom: { bottom: 0 },
  picks: { flexDirection: 'row' },
  pick: { height: 24, alignItems: 'center', justifyContent: 'center' },
  pickHeld: { backgroundColor: color.surfaceHigh, borderRadius: radius.sm },
  pickMark: { width: 16, height: 2, borderRadius: radius.pill, backgroundColor: color.border },
  pickMarkOn: { backgroundColor: color.accent },
  readout: { ...font.caption, fontSize: 13, ...font.numeric, color: color.textMuted },
  readoutDate: { color: color.textFaint },
  empty: { justifyContent: 'center' },
  emptyText: { ...font.caption, color: color.textFaint },
});
