import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line, Rect } from 'react-native-svg';

import { Press } from '@/components/Press';
import type { SetRow } from '@/db/repositories/sessions';
import { fmtDayLabel } from '@/lib/date';
import { kgNum } from '@/lib/format';
import { color, font, radius, space } from '@/theme/tokens';

/**
 * One lift's record — every session of it, and today — as a grammar rather than
 * a chart.
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
 * Nothing here is derived. No composite "progress index", no percentage, no
 * trend fitted through six points. A plateau looks flat because the loads were
 * flat; a back-off week sits lower because it was lighter. The picture cannot
 * flatter the data because it IS the data (AGENTS §6).
 *
 * **Today is drawn on the same scale, to the right of a divider.** That is the
 * whole point of the component: the set you are about to do is not a separate
 * widget from the sets you have done, it is the newest column of one record.
 * The hollow accent mark is bound to the stepper, so dialling the weight moves
 * it against your history and "is this more than last time" is answered by
 * looking instead of by arithmetic.
 *
 * Exercises with no external load (bodyweight, bands) have nothing to say on a
 * load axis, so position switches to reps and the width encoding is dropped
 * rather than drawing a dimension that does not exist.
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
  /**
   * The set logged a moment ago, drawn hot so the commit is visible without
   * looking away. It cools on a timer owned by the screen — the acknowledgement
   * the old tile grid carried (docs/12, "heat is state").
   */
  justLoggedId?: string | null;
  /** Tapping a logged column edits it, as the old tiles did. */
  onEditSet?: (s: SetRow) => void;
}

export interface LoadLineProps {
  /** Newest-first, as `exerciseSessions` returns it. */
  sessions: readonly LoadLineSession[];
  today?: LoadLineToday;
  /** Reps are seconds for timed work; changes wording only. */
  measure?: 'reps' | 'time';
  height?: number;
  /** How many past sessions to draw. Older ones fall off the left. */
  limit?: number;
}

/** Below this a column is too thin to read a width off. */
const MIN_COL = 22;
const PAD_Y = 12;
/** A break in training is data. Past this, draw the gap. */
const GAP_DAYS = 10;

const daysBetween = (a: string, b: string) => Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000);

/** RIR 0 is everything you had; RIR 4+ is a warm-up in disguise. */
const densityFor = (rir: number) => Math.max(0.4, 1 - Math.min(4, Math.max(0, rir)) * 0.15);

export function LoadLine({ sessions, today, measure = 'reps', height = 120, limit = 7 }: LoadLineProps) {
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);

  // Oldest-left is the only order a history reads in.
  const past = useMemo(() => [...sessions].slice(0, limit).reverse(), [sessions, limit]);

  const model = useMemo(() => {
    const logged = [...past.flatMap((s) => s.sets), ...(today?.sets ?? [])];
    if (logged.length === 0 && !today?.proposed) return null;
    // An exercise nobody loads has nothing to say on a load axis.
    const loaded = logged.some((s) => s.weight > 0) || (today?.proposed?.weight ?? 0) > 0;
    const valueOf = (w: number, r: number) => (loaded ? w : r);
    const values = logged.map((s) => valueOf(s.weight, s.reps));
    if (today?.proposed) values.push(valueOf(today.proposed.weight, today.proposed.reps));
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const maxReps = Math.max(...logged.map((s) => s.reps), today?.proposed?.reps ?? 0, 1);
    const best = logged.reduce((b, s) => (s.e1rm > (b?.e1rm ?? -1) ? s : b), undefined as SetRow | undefined);
    return { loaded, valueOf, lo, hi, maxReps, best };
  }, [past, today]);

  if (!model) {
    return (
      <View style={[styles.empty, { minHeight: height }]} accessible accessibilityLabel="No history for this exercise yet.">
        <Text style={styles.emptyText}>No history yet — this is where it starts.</Text>
      </View>
    );
  }

  const { loaded, valueOf, lo, hi, maxReps, best } = model;
  const span = hi - lo || 1;
  // A flat history would otherwise pin every mark to one edge.
  const yFor = (v: number) => {
    const t = hi === lo ? 0.5 : (v - lo) / span;
    return height - PAD_Y - t * (height - PAD_Y * 2);
  };

  const todayCols = today ? Math.max(today.target, today.sets.length) : 0;
  const cols = past.length + todayCols;
  const colW = width > 0 && cols > 0 ? Math.max(MIN_COL, width / cols) : MIN_COL;
  const splitX = past.length * colW;
  const unit = loaded ? 'kg' : measure === 'time' ? 's' : 'reps';

  const pickedSession = past.find((s) => s.sessionId === picked) ?? null;

  const barFor = (w: number, r: number) => (loaded ? Math.max(0.34, r / maxReps) * (colW - 6) : colW - 10);

  return (
    <View style={styles.wrap}>
      <View
        style={[styles.plot, { height }]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${past.length} past ${past.length === 1 ? 'session' : 'sessions'}${
          today ? ` and today` : ''
        }, ${loaded ? `${kgNum(lo)} to ${kgNum(hi)} kilograms` : `${lo} to ${hi} ${unit}`}. Each bar is one set: higher is heavier, wider is more reps.`}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            {/* The floor of the range, so marks sit on something rather than float. */}
            <Line x1={0} y1={height - PAD_Y / 2} x2={width} y2={height - PAD_Y / 2} stroke={color.border} strokeWidth={1} />

            {past.map((s, i) => {
              const cx = i * colW + colW / 2;
              const prev = past[i - 1];
              const gap = prev ? daysBetween(s.date, prev.date) : 0;
              const on = s.sessionId === picked;
              return (
                <G key={s.sessionId}>
                  {/* Time off is part of the record, not a rendering gap to hide. */}
                  {gap > GAP_DAYS ? (
                    <Line x1={i * colW} y1={PAD_Y / 2} x2={i * colW} y2={height - PAD_Y / 2} stroke={color.border} strokeWidth={1} strokeDasharray="2 4" />
                  ) : null}
                  {s.sets.map((set) => {
                    const w = barFor(set.weight, set.reps);
                    return (
                      <Rect
                        key={set.id}
                        x={cx - w / 2}
                        y={yFor(valueOf(set.weight, set.reps)) - 2.5}
                        width={w}
                        height={5}
                        rx={2}
                        fill={set.painFlag ? color.danger : best && set.id === best.id ? color.positive : color.text}
                        opacity={(on ? 1 : 0.5) * densityFor(set.rir)}
                      />
                    );
                  })}
                </G>
              );
            })}

            {/* Where the record stops and today begins. */}
            {today && past.length > 0 ? (
              <Line x1={splitX} y1={0} x2={splitX} y2={height} stroke={color.border} strokeWidth={1} />
            ) : null}

            {today
              ? Array.from({ length: todayCols }, (_, i) => {
                  const cx = splitX + i * colW + colW / 2;
                  const done = today.sets[i];
                  if (done) {
                    const w = barFor(done.weight, done.reps);
                    return (
                      <Rect
                        key={done.id}
                        x={cx - w / 2}
                        y={yFor(valueOf(done.weight, done.reps)) - 3}
                        width={w}
                        height={6}
                        rx={2}
                        fill={done.painFlag ? color.danger : done.id === today.justLoggedId ? color.accent : color.text}
                        opacity={done.id === today.justLoggedId ? 1 : densityFor(done.rir)}
                      />
                    );
                  }
                  // The next slot carries the steppers; the ones after it are just waiting.
                  const next = i === today.sets.length;
                  if (!today.proposed) return null;
                  const w = barFor(today.proposed.weight, today.proposed.reps);
                  return (
                    <Rect
                      key={`todo-${i}`}
                      x={cx - w / 2}
                      y={yFor(valueOf(today.proposed.weight, today.proposed.reps)) - 3.5}
                      width={w}
                      height={7}
                      rx={2}
                      fill="none"
                      stroke={color.accent}
                      strokeWidth={next ? 1.8 : 1}
                      strokeDasharray={next ? undefined : '3 3'}
                      opacity={next ? 1 : 0.35}
                    />
                  );
                })
              : null}
          </Svg>
        ) : null}

        {/* Two numbers, not a gridline: the range the picture is drawn inside. */}
        <Text style={[styles.axis, styles.axisTop]}>{loaded ? `${kgNum(hi)} kg` : `${hi} ${unit}`}</Text>
        <Text style={[styles.axis, styles.axisBottom]}>{loaded ? `${kgNum(lo)} kg` : `${lo} ${unit}`}</Text>
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
                  <View style={[styles.tick, styles.tickToday, done && styles.tickDone]} />
                </Press>
              );
            })
          : null}
      </View>

      {/*
        Exact values, always, at a size readable at arm's length on a bench. The
        grammar above carries the comparison; this carries the facts (§13), and
        it is what replaced the old 84dp row of set tiles.
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
            <Text style={styles.readoutTag}>TODAY</Text>
            {'   '}
            {today.sets.length
              ? today.sets.map((x) => setText(x.weight, x.reps, loaded, measure)).join('   ')
              : today.proposed
                ? `${setText(today.proposed.weight, today.proposed.reps, loaded, measure)} up next`
                : '—'}
          </>
        ) : (
          <Text style={styles.readoutTag}>Tap a session to read its sets</Text>
        )}
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
  axis: { position: 'absolute', right: 0, ...font.caption, fontSize: 11, lineHeight: 13, ...font.numeric, color: color.textFaint },
  axisTop: { top: 0 },
  axisBottom: { bottom: 0 },
  picks: { flexDirection: 'row' },
  pick: { height: 32, alignItems: 'center', justifyContent: 'center' },
  pickHeld: { backgroundColor: color.surfaceHigh, borderRadius: radius.sm },
  tick: { width: 14, height: 2, borderRadius: radius.pill, backgroundColor: color.border },
  tickOn: { backgroundColor: color.text },
  tickToday: { backgroundColor: color.accentSoft },
  tickDone: { backgroundColor: color.accent },
  /** 16pt, tabular: these are the numbers you check mid-set without leaning in. */
  readout: { ...font.label, fontSize: 16, lineHeight: 22, fontWeight: '600', ...font.numeric, color: color.text },
  readoutTag: { ...font.eyebrow, fontSize: 10, color: color.textFaint },
  empty: { justifyContent: 'center' },
  emptyText: { ...font.caption, color: color.textFaint },
});
