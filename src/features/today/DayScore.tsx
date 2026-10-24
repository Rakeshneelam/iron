import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';

import { Press } from '@/components/Press';
import { fmtClockOfDay } from '@/features/settings/time';
import { ml } from '@/lib/format';
import { color, font, hit, radius, space } from '@/theme/tokens';

/**
 * Today, as one instrument: every lane on the same clock.
 *
 * A home made of cards gives each tracker its own box and its own idea of time —
 * a calorie number here, a water ring there, a workout card above them — and
 * leaves the reader to put the day back together. This draws the day once, on one
 * time axis, with a lane per thing you record (brief §11): what you trained, ate
 * and drank sit at the hours they happened, and "now" is one needle through all of
 * them. Orientation is the whole job of a home screen (§12), and a clock is what
 * orientation in a day is.
 *
 * The conventions are the app's (docs/13), so the lanes read like everything else:
 *
 *   Train — a planned workout is a hollow block at your usual time, as long as its
 *           estimate; a finished one is solid from its start to its end; one in
 *           progress is heat, growing to now.
 *   Food  — a solid mark per meal at the time it was logged, its height its share
 *           of the day's calories. Entries logged together are one meal.
 *   Water — the day's level: a solid line stepping up at each glass, against a
 *           dashed pace line from waking to bedtime — the same pro-rata pace the
 *           reminders run on (services/hydration), so the picture and the nudges
 *           never disagree.
 *   Body  — this morning's weigh-in, in words. Weigh-ins carry a date and no time,
 *           so it is not placed on the clock: drawing it at an hour would be
 *           inventing one.
 *
 * Every lane is a way in: tapping it opens its screen. Water also carries the one
 * thing done eight times a day, a glass, in one tap.
 */
export interface DayScoreProps {
  now: Date;
  /** Minutes past midnight: the day the axis spans, from settings. */
  wake: number;
  sleep: number;
  train: {
    /** Finished workouts today. */
    done: { start: number; end: number }[];
    /** The open workout's start, if one is running. */
    live: number | null;
    /** A workout planned and not yet started: when, and for how long. */
    planned: { at: number; minutes: number } | null;
    /** What to say when the lane has nothing on it. */
    idle: string;
  };
  food: { meals: { at: number; kcal: number }[]; kcal: number; target: number };
  water: { steps: { at: number; ml: number }[]; total: number; target: number };
  body: { kg: number | null; trend: number | null };
  onTrain: () => void;
  onFood: () => void;
  onWater: () => void;
  onBody: () => void;
  onGlass: () => void;
}

const TRACK = 20;
/** Entries logged within this many minutes of each other are one meal. */
const MEAL_GAP = 40;

export function DayScore(p: DayScoreProps) {
  const [width, setWidth] = useState(0);
  const nowMin = p.now.getHours() * 60 + p.now.getMinutes();
  // The axis is your day, stretched to hold anything logged outside it.
  const times = [...p.food.meals.map((m) => m.at), ...p.water.steps.map((s) => s.at), ...p.train.done.flatMap((d) => [d.start, d.end])];
  if (p.train.live !== null) times.push(p.train.live);
  const from = Math.floor(Math.min(p.wake, ...times) / 60) * 60;
  const to = Math.ceil(Math.max(p.sleep, nowMin, ...times) / 60) * 60;
  const x = (min: number) => ((min - from) / Math.max(1, to - from)) * width;
  const needle = nowMin >= from && nowMin <= to && width > 0 ? x(nowMin) : null;

  const hours: number[] = [];
  for (let h = Math.ceil(from / 180) * 180; h <= to; h += 180) hours.push(h);

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* The clock every lane below is drawn against. */}
      <View style={styles.axis} importantForAccessibility="no-hide-descendants">
        {width > 0
          ? hours.map((h) => (
              <Text key={h} style={[styles.hour, { left: Math.min(width - 22, Math.max(0, x(h) - 11)) }]}>
                {fmtClockOfDay(h).slice(0, 2)}
              </Text>
            ))
          : null}
      </View>

      <Lane
        label="Train"
        value={p.train.live !== null ? 'in progress' : p.train.done.length ? `${p.train.done.length === 1 ? 'done' : `${p.train.done.length} done`}` : p.train.planned ? `planned ${fmtClockOfDay(p.train.planned.at)}` : ''}
        valueTone={p.train.live !== null ? 'heat' : 'muted'}
        a11y={
          p.train.live !== null
            ? 'Train: a workout is in progress. Opens it.'
            : p.train.done.length
              ? `Train: ${p.train.done.length} workout${p.train.done.length === 1 ? '' : 's'} done today.`
              : p.train.planned
                ? `Train: planned for ${fmtClockOfDay(p.train.planned.at)}, about ${p.train.planned.minutes} minutes.`
                : `Train: ${p.train.idle}.`
        }
        onPress={p.onTrain}
      >
        {width > 0 ? (
          <Svg width={width} height={TRACK}>
            <Line x1={0} y1={TRACK - 0.5} x2={width} y2={TRACK - 0.5} stroke={color.border} strokeWidth={1} />
            {p.train.planned ? (
              <Rect
                x={x(p.train.planned.at)}
                y={3}
                width={Math.max(6, x(p.train.planned.at + p.train.planned.minutes) - x(p.train.planned.at))}
                height={TRACK - 6}
                rx={2}
                fill="none"
                stroke={color.textMuted}
                strokeWidth={1.2}
                strokeDasharray="3 2"
              />
            ) : null}
            {p.train.done.map((d) => (
              <Rect key={d.start} x={x(d.start)} y={3} width={Math.max(4, x(d.end) - x(d.start))} height={TRACK - 6} rx={2} fill={color.text} />
            ))}
            {p.train.live !== null ? (
              <Rect x={x(p.train.live)} y={3} width={Math.max(4, x(nowMin) - x(p.train.live))} height={TRACK - 6} rx={2} fill={color.accent} />
            ) : null}
            <Needle at={needle} height={TRACK} />
          </Svg>
        ) : null}
        {!p.train.planned && !p.train.done.length && p.train.live === null ? <Text style={styles.idle}>{p.train.idle}</Text> : null}
      </Lane>

      <Lane
        label="Food"
        value={p.food.kcal > 0 ? `${Math.round(p.food.kcal).toLocaleString()} of ${p.food.target.toLocaleString()} kcal` : `0 of ${p.food.target.toLocaleString()} kcal`}
        a11y={`Food: ${Math.round(p.food.kcal)} of ${p.food.target} kilocalories, ${p.food.meals.length} ${p.food.meals.length === 1 ? 'meal' : 'meals'} logged. Opens Food.`}
        onPress={p.onFood}
      >
        {width > 0 ? <FoodTrack meals={p.food.meals} x={x} width={width} needle={needle} /> : null}
        {p.food.meals.length === 0 ? <Text style={styles.idle}>Nothing logged yet</Text> : null}
      </Lane>

      <Lane
        label="Water"
        value={`${ml(p.water.total)} of ${ml(p.water.target)}`}
        valueTone="cold"
        a11y={`Water: ${ml(p.water.total)} of ${ml(p.water.target)} today. Opens Water.`}
        onPress={p.onWater}
        action={{ label: '+250', a11y: 'Log a 250 millilitre glass of water', onPress: p.onGlass }}
      >
        {width > 0 ? <WaterTrack {...p.water} wake={p.wake} sleep={p.sleep} nowMin={nowMin} x={x} width={width} needle={needle} /> : null}
      </Lane>

      <Lane
        label="Body"
        value={p.body.kg !== null ? `${p.body.kg.toFixed(1)} kg today` : 'not weighed today'}
        a11y={`Body: ${p.body.kg !== null ? `${p.body.kg.toFixed(1)} kilograms today` : 'not weighed today'}${p.body.trend !== null ? `, trend ${p.body.trend.toFixed(1)}` : ''}. Opens Body.`}
        onPress={p.onBody}
        bare
      >
        <Text style={styles.bodyText} numberOfLines={1}>
          {p.body.trend !== null ? (
            <>
              Trend <Text style={styles.bodyStrong}>{p.body.trend.toFixed(1)} kg</Text>
            </>
          ) : (
            'Weigh in a few mornings and a trend appears'
          )}
        </Text>
      </Lane>

    </View>
  );
}

function Lane({
  label,
  value,
  valueTone = 'muted',
  a11y,
  onPress,
  action,
  bare,
  children,
}: {
  label: string;
  value: string;
  valueTone?: 'muted' | 'heat' | 'cold';
  a11y: string;
  onPress: () => void;
  action?: { label: string; a11y: string; onPress: () => void };
  bare?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View>
      <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} feedback="highlight" style={styles.laneBody} pressedStyle={styles.laneHeld}>
        <View style={[styles.laneHead, action && styles.laneHeadAction]}>
          <Text style={styles.laneLabel}>{label}</Text>
          <Text style={[styles.laneValue, valueTone === 'heat' && styles.heat, valueTone === 'cold' && styles.cold]} numberOfLines={1}>
            {value}
          </Text>
        </View>
        <View style={bare ? styles.bare : styles.track}>{children}</View>
      </Press>
      {/*
        A sibling over the head row, not a child of the lane's button: a button
        inside a button is one control to a screen reader, and the glass would be
        unreachable. The track under it still spans the full width, so every lane
        keeps the same clock.
      */}
      {action ? (
        <Press
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.a11y}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          touchStyle={styles.actionTouch}
          style={styles.action}
          pressedStyle={styles.actionHeld}
        >
          <Text style={styles.actionText}>{action.label}</Text>
        </Press>
      ) : null}
    </View>
  );
}

/** Now, as a heat hairline in each track — through the clock, never through the words. */
function Needle({ at, height }: { at: number | null; height: number }) {
  return at === null ? null : <Line x1={at} y1={0} x2={at} y2={height} stroke={color.accent} strokeWidth={1.5} />;
}

function FoodTrack({ meals, x, width, needle }: { meals: { at: number; kcal: number }[]; x: (m: number) => number; width: number; needle: number | null }) {
  // Items logged together are one meal: a breakfast of four foods is one mark, not four.
  const grouped: { at: number; kcal: number }[] = [];
  for (const m of [...meals].sort((a, b) => a.at - b.at)) {
    const prev = grouped[grouped.length - 1];
    if (prev && m.at - prev.at <= MEAL_GAP) prev.kcal += m.kcal;
    else grouped.push({ ...m });
  }
  const top = Math.max(1, ...grouped.map((g) => g.kcal));
  return (
    <Svg width={width} height={TRACK}>
      <Line x1={0} y1={TRACK - 0.5} x2={width} y2={TRACK - 0.5} stroke={color.border} strokeWidth={1} />
      {grouped.map((g) => {
        const h = 4 + (TRACK - 6) * (g.kcal / top);
        return <Rect key={g.at} x={x(g.at) - 3} y={TRACK - 1 - h} width={6} height={h} rx={1} fill={color.text} />;
      })}
      <Needle at={needle} height={TRACK} />
    </Svg>
  );
}

function WaterTrack({
  steps,
  total,
  target,
  wake,
  sleep,
  nowMin,
  x,
  width,
  needle,
}: {
  steps: { at: number; ml: number }[];
  total: number;
  target: number;
  wake: number;
  sleep: number;
  nowMin: number;
  x: (m: number) => number;
  width: number;
  needle: number | null;
}) {
  const top = Math.max(target, total, 1);
  const y = (v: number) => TRACK - 1 - (v / top) * (TRACK - 3);
  // The level: flat, then up at each glass, then flat to now.
  let level = 0;
  let d = `M${x(wake)} ${y(0)}`;
  for (const s of [...steps].sort((a, b) => a.at - b.at)) {
    d += `L${x(s.at)} ${y(level)}`;
    level += s.ml;
    d += `L${x(s.at)} ${y(level)}`;
  }
  const end = Math.max(nowMin, ...steps.map((s) => s.at), wake);
  d += `L${x(end)} ${y(level)}`;
  const area = `${d}L${x(end)} ${y(0)}Z`;
  return (
    <Svg width={width} height={TRACK}>
      <Line x1={0} y1={TRACK - 0.5} x2={width} y2={TRACK - 0.5} stroke={color.border} strokeWidth={1} />
      {/* The pace the reminders run on: planned, so dashed. */}
      <Line x1={x(wake)} y1={y(0)} x2={x(sleep)} y2={y(target)} stroke={color.textFaint} strokeWidth={1} strokeDasharray="3 3" />
      <Path d={area} fill={color.coldSoft} />
      <Path d={d} stroke={color.cold} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
      <Needle at={needle} height={TRACK} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', gap: 2 },
  flex: { flex: 1 },
  axis: { height: 16 },
  hour: { position: 'absolute', top: 0, width: 22, textAlign: 'center', ...font.caption, fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'], color: color.textFaint },
  laneBody: { minHeight: hit.default, paddingVertical: space.xs + 2, borderRadius: radius.sm, gap: 3 },
  laneHeld: { backgroundColor: color.surface },
  laneHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md, minHeight: 20 },
  /** Room for the glass button, which sits over the right end of this row. */
  laneHeadAction: { paddingRight: 64 + space.sm, minHeight: 28, alignItems: 'center' },
  laneLabel: { ...font.label, fontSize: 14, fontWeight: '600', color: color.text },
  laneValue: { ...font.caption, fontSize: 13, fontVariant: ['tabular-nums'], color: color.textMuted, flexShrink: 1, textAlign: 'right' },
  heat: { color: color.accent, fontWeight: '600' },
  cold: { color: color.cold, fontWeight: '600' },
  track: { height: TRACK, justifyContent: 'center' },
  bare: { minHeight: 18, justifyContent: 'center' },
  idle: { position: 'absolute', left: 0, ...font.caption, fontSize: 12, color: color.textFaint },
  bodyText: { ...font.caption, fontVariant: ['tabular-nums'], color: color.textMuted },
  bodyStrong: { color: color.text, fontWeight: '600' },
  actionTouch: { position: 'absolute', right: 0, top: space.xs + 2 },
  action: {
    width: 64,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: color.cold,
  },
  actionHeld: { backgroundColor: color.coldSoft },
  actionText: { ...font.label, fontSize: 14, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'], color: color.cold },
});
