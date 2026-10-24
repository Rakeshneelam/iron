import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line, Path, Rect } from 'react-native-svg';

import { Press } from '@/components/Press';
import type { WeekRecord } from '@/db/repositories/progress';
import { fmtDayLabel, parseISODate } from '@/lib/date';
import { kgNum, ml } from '@/lib/format';
import { color, font, radius, space } from '@/theme/tokens';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Months of the record at once: weeks across, one lane per thing you record.
 *
 * It is the day score's long magnification (features/today/DayScore): the same
 * lanes, the same marks, with the clock replaced by a calendar. Each lane keeps its
 * own scale and its own unit, because sets, kilograms of bodyweight and calories
 * are not one quantity and must never share an axis (brief §6) — what they share
 * is the week they happened in, and that is what lines them up.
 *
 *   Train — a solid mark per workout that happened, an open mark per planned day
 *           marked missed. Rest days are not drawn: they are not a debt.
 *   Sets  — the week's working sets, as a solid column.
 *   Body  — the smoothed weight as it stood at each week's end. Derived, so a line.
 *   Food  — the mean of the days you logged, against today's target (dashed).
 *           A week with nothing logged is blank, never zero.
 *   Water — days at the target (solid) within days logged (faint).
 *
 * Tapping a week selects it for everything below. Not a streak calendar: there is
 * no chain here and nothing to break, only weeks and what was in them.
 */
export function LongRecord({
  weeks,
  selected,
  kcalTarget,
  waterTarget,
  onSelect,
}: {
  weeks: readonly WeekRecord[];
  selected: string;
  kcalTarget: number;
  waterTarget: number;
  onSelect: (weekStart: string) => void;
}) {
  const [width, setWidth] = useState(0);
  const colW = width > 0 ? width / Math.max(1, weeks.length) : 0;
  const cx = (i: number) => i * colW + colW / 2;

  const maxSets = Math.max(1, ...weeks.map((w) => w.sets));
  const trends = weeks.map((w) => w.trend).filter((t): t is number => t !== null);
  const tLo = trends.length ? Math.min(...trends) : 0;
  const tHi = trends.length ? Math.max(...trends) : 1;
  const kcals = weeks.map((w) => w.avgKcal).filter((k): k is number => k !== null);
  const kTop = Math.max(kcalTarget, ...kcals, 1) * 1.1;

  const lanes = [
    { key: 'train', label: 'Train', h: 30 },
    { key: 'sets', label: 'Sets', h: 26 },
    { key: 'body', label: 'Body', h: 30 },
    { key: 'food', label: 'Food', h: 24 },
    { key: 'water', label: 'Water', h: 22 },
  ] as const;
  const LABEL_H = 16;
  const GAP = 6;
  const tops: number[] = [];
  let y = LABEL_H + 2;
  for (const l of lanes) {
    tops.push(y + 14);
    y += 14 + l.h + GAP;
  }
  const height = y;
  const top = (k: (typeof lanes)[number]['key']) => tops[lanes.findIndex((l) => l.key === k)] ?? 0;
  const laneH = (k: (typeof lanes)[number]['key']) => lanes.find((l) => l.key === k)?.h ?? 0;

  // Body: one path through the weeks that have a trend, broken where they do not.
  const bodyY = (t: number) => top('body') + laneH('body') - 4 - (tHi === tLo ? (laneH('body') - 8) / 2 : ((t - tLo) / (tHi - tLo)) * (laneH('body') - 8));
  const bodyPath = weeks
    .map((w, i) => (w.trend === null ? '' : `${weeks[i - 1]?.trend != null ? 'L' : 'M'}${cx(i)} ${bodyY(w.trend)}`))
    .join('');
  const lastTrend = [...weeks].reverse().find((w) => w.trend !== null)?.trend ?? null;

  return (
    <View>
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
            {weeks.map((w, i) => {
              const on = w.weekStart === selected;
              const trainTop = top('train');
              const trainH = laneH('train');
              const mark = Math.min(6, (trainH - 2) / 5 - 1);
              const marks = [...Array.from({ length: w.trained }, () => 'solid' as const), ...Array.from({ length: w.missed }, () => 'open' as const)].slice(0, 5);
              const setsH = (w.sets / maxSets) * (laneH('sets') - 2);
              const foodY = w.avgKcal !== null ? top('food') + laneH('food') - (w.avgKcal / kTop) * laneH('food') : null;
              const waterH = laneH('water') - 2;
              return (
                <G key={w.weekStart}>
                  {on ? (
                    <Rect x={i * colW + 1} y={LABEL_H} width={colW - 2} height={height - LABEL_H - 1} rx={radius.sm} fill="none" stroke={color.text} strokeWidth={1} opacity={0.6} />
                  ) : null}
                  {marks.map((kind, j) => {
                    const yy = trainTop + trainH - (j + 1) * (mark + 1.5);
                    return kind === 'solid' ? (
                      <Rect key={j} x={cx(i) - mark / 2} y={yy} width={mark} height={mark} rx={1} fill={color.text} />
                    ) : (
                      <Rect key={j} x={cx(i) - mark / 2 + 0.5} y={yy + 0.5} width={mark - 1} height={mark - 1} rx={1} fill="none" stroke={color.textMuted} strokeWidth={1} />
                    );
                  })}
                  {w.sets > 0 ? <Rect x={cx(i) - Math.min(6, colW / 3) / 2} y={top('sets') + laneH('sets') - setsH} width={Math.min(6, colW / 3)} height={setsH} rx={1} fill={color.text} opacity={0.85} /> : null}
                  {foodY !== null ? <Rect x={cx(i) - 4} y={foodY - 1.5} width={8} height={3} rx={1} fill={color.text} /> : null}
                  {w.waterDays > 0 ? (
                    <>
                      <Rect x={cx(i) - 3} y={top('water') + laneH('water') - (w.waterDays / 7) * waterH} width={6} height={(w.waterDays / 7) * waterH} rx={1} fill={color.coldSoft} />
                      <Rect x={cx(i) - 3} y={top('water') + laneH('water') - (w.waterHit / 7) * waterH} width={6} height={(w.waterHit / 7) * waterH} rx={1} fill={color.cold} />
                    </>
                  ) : null}
                </G>
              );
            })}
            {/* The floors each lane stands on. */}
            {lanes.map((l) => (
              <Line key={l.key} x1={0} y1={top(l.key) + l.h + 0.5} x2={width} y2={top(l.key) + l.h + 0.5} stroke={color.border} strokeWidth={1} />
            ))}
            {/* The calorie target: planned, so dashed. Today's target, said so below. */}
            <Line x1={0} y1={top('food') + laneH('food') - (kcalTarget / kTop) * laneH('food')} x2={width} y2={top('food') + laneH('food') - (kcalTarget / kTop) * laneH('food')} stroke={color.textFaint} strokeWidth={1} strokeDasharray="3 3" />
            {bodyPath ? <Path d={bodyPath} stroke={color.text} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          </Svg>
        ) : null}

        {/* Month names where a month starts: the calendar, without a calendar grid. */}
        {width > 0
          ? weeks.map((w, i) => {
              const d = parseISODate(w.weekStart);
              const prev = weeks[i - 1];
              const newMonth = !prev || parseISODate(prev.weekStart).getMonth() !== d.getMonth();
              return newMonth ? (
                <Text key={`m-${w.weekStart}`} style={[styles.month, { left: i * colW + 2 }]} numberOfLines={1}>
                  {MONTHS[d.getMonth()]}
                </Text>
              ) : null;
            })
          : null}
        {lanes.map((l) => (
          <View key={l.key} style={[styles.laneHead, { top: top(l.key) - 14 }]} pointerEvents="none">
            <Text style={styles.laneLabel}>{l.label}</Text>
            <Text style={styles.laneNote} numberOfLines={1}>
              {l.key === 'body' && lastTrend !== null
                ? `trend ${kgNum(Math.round(lastTrend * 10) / 10)} kg`
                : l.key === 'food'
                  ? `mean of logged days, target ${kcalTarget.toLocaleString()}`
                  : l.key === 'water'
                    ? `days at ${ml(waterTarget)}`
                    : l.key === 'sets'
                      ? `most ${maxSets} a week`
                      : ''}
            </Text>
          </View>
        ))}

        {/* A week is a column you can tap: the whole height, not a thin tick. */}
        <View style={[StyleSheet.absoluteFill, styles.columns]}>
          {weeks.map((w) => (
            <Press
              key={w.weekStart}
              onPress={() => onSelect(w.weekStart)}
              accessibilityRole="button"
              accessibilityState={{ selected: w.weekStart === selected }}
              accessibilityLabel={describe(w, waterTarget)}
              feedback="none"
              touchStyle={styles.column}
              style={styles.column}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function describe(w: WeekRecord, waterTarget: number): string {
  const parts = [
    `Week of ${fmtDayLabel(w.weekStart)}`,
    `${w.trained} ${w.trained === 1 ? 'workout' : 'workouts'}, ${w.sets} sets`,
    w.missed ? `${w.missed} missed` : '',
    w.rest ? `${w.rest} rest ${w.rest === 1 ? 'day' : 'days'}` : '',
    w.trend !== null ? `bodyweight trend ${kgNum(Math.round(w.trend * 10) / 10)} kilograms` : '',
    w.foodDays ? `food logged ${w.foodDays} ${w.foodDays === 1 ? 'day' : 'days'}, averaging ${w.avgKcal ?? 0} kilocalories` : '',
    w.waterDays ? `water at ${ml(waterTarget)} on ${w.waterHit} of ${w.waterDays} days logged` : '',
  ];
  return parts.filter(Boolean).join('. ');
}

const styles = StyleSheet.create({
  month: { position: 'absolute', top: 0, ...font.caption, fontSize: 11, lineHeight: 14, fontWeight: '600', color: color.textMuted },
  laneHead: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'baseline', gap: space.sm, height: 14 },
  laneLabel: { ...font.caption, fontSize: 11, lineHeight: 14, fontWeight: '600', color: color.text },
  laneNote: { ...font.caption, fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'], color: color.textFaint, flexShrink: 1 },
  columns: { flexDirection: 'row', top: 16 },
  column: { flex: 1 },
});
