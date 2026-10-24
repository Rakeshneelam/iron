import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import type { SetRow } from '@/db/repositories/sessions';
import { fmtClockOfDay } from '@/features/settings/time';
import { minutesSinceMidnight } from '@/lib/date';
import { color, font, space } from '@/theme/tokens';

export interface ScoreLane {
  exerciseId: string;
  name: string;
  rows: readonly SetRow[];
  /** A new best this session: its heaviest mark is drawn as one. */
  isPR: boolean;
}

/**
 * One workout as it actually went: a lane per exercise, a mark per set at the
 * minute it was logged.
 *
 * Every set has always carried its `logged_at`; nothing ever drew it. A list of
 * "3 × 8 @ 100" throws away the shape of the hour — the long rest before the heavy
 * set, the superset that alternated, the accessory squeezed in at the end. This is
 * the session magnification of the one record (docs/13): the day score at an
 * hour's scale.
 *
 * Height within a lane is that exercise's own load, against its own range only —
 * a curl and a squat never share an axis (brief §6). Warm-ups are hollow, because
 * they were preparation rather than the work; a set past your previous best is
 * green, the one colour a best ever gets.
 */
export function SessionScore({ lanes, startedAt, endedAt }: { lanes: readonly ScoreLane[]; startedAt: string; endedAt: string | null }) {
  const [width, setWidth] = useState(0);
  const all = lanes.flatMap((l) => l.rows);
  if (all.length === 0) return null;

  const start = Date.parse(startedAt);
  const times = all.map((r) => Date.parse(r.loggedAt));
  const end = Math.max(endedAt ? Date.parse(endedAt) : 0, ...times, start + 60_000);
  const x = (t: number) => ((t - start) / Math.max(1, end - start)) * width;
  const LANE = 26;
  const minutes = Math.round((end - start) / 60_000);
  // A tick every 15 minutes, or every 5 for a short session: the hour, graduated.
  const every = minutes > 50 ? 15 : 5;
  const ticks = Array.from({ length: Math.floor(minutes / every) + 1 }, (_, i) => i * every);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`The workout as it went, ${minutes} minutes from ${fmtClockOfDay(minutesSinceMidnight(new Date(startedAt)))}: ${lanes
        .map((l) => `${l.name}, ${l.rows.filter((r) => r.isWarmup === 0).length} sets`)
        .join('; ')}.`}
    >
      {lanes.map((lane) => {
        const work = lane.rows.filter((r) => r.isWarmup === 0);
        const lo = Math.min(...lane.rows.map((r) => r.weight));
        const hi = Math.max(...lane.rows.map((r) => r.weight));
        const top = work.reduce<SetRow | undefined>((b, r) => (!b || r.e1rm > b.e1rm ? r : b), undefined);
        const y = (w: number) => (hi === lo ? LANE / 2 : LANE - 4 - ((w - lo) / (hi - lo)) * (LANE - 8));
        return (
          <View key={lane.exerciseId} style={styles.lane}>
            <Text style={styles.name} numberOfLines={1}>
              {lane.name}
            </Text>
            <View style={{ height: LANE }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
              {width > 0 ? (
                <Svg width={width} height={LANE}>
                  <Line x1={0} y1={LANE - 0.5} x2={width} y2={LANE - 0.5} stroke={color.border} strokeWidth={1} />
                  {lane.rows.map((r) => {
                    const at = x(Date.parse(r.loggedAt));
                    const warm = r.isWarmup === 1;
                    const best = lane.isPR && top?.id === r.id;
                    return warm ? (
                      <Rect key={r.id} x={at - 3} y={y(r.weight) - 2.5} width={6} height={5} rx={1.5} fill="none" stroke={color.textMuted} strokeWidth={1} />
                    ) : (
                      <Rect key={r.id} x={at - 3.5} y={y(r.weight) - 3} width={7} height={6} rx={1.5} fill={r.painFlag ? color.danger : best ? color.positive : color.text} />
                    );
                  })}
                </Svg>
              ) : null}
            </View>
          </View>
        );
      })}
      <View style={styles.axis}>
        {width > 0
          ? ticks.map((m) => (
              <Text key={m} style={[styles.tick, { left: Math.min(width - 28, Math.max(0, x(start + m * 60_000) - 14)) }]}>
                {m === 0 ? fmtClockOfDay(minutesSinceMidnight(new Date(startedAt))) : `+${m}`}
              </Text>
            ))
          : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lane: { gap: 2, marginBottom: space.sm },
  name: { ...font.caption, fontSize: 12, fontWeight: '600', color: color.textMuted },
  axis: { height: 14 },
  tick: { position: 'absolute', top: 0, width: 28, textAlign: 'center', ...font.caption, fontSize: 10, lineHeight: 13, fontVariant: ['tabular-nums'], color: color.textFaint },
});
