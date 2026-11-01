import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, Icon, ListCard, ListRow, MiniBars, Pill, PrimaryButton, Screen, SectionHeader, type PillTone } from '@/components';
import { Press } from '@/components/Press';
import { MUSCLE_LABEL, type Muscle } from '@/data/catalog';
import { useLive } from '@/db/live';
import { getCheckIn, listCheckIns, recentCheckIns } from '@/db/repositories/body';
import { lastTrainedByMuscle } from '@/db/repositories/progress';
import { readinessModifier } from '@/engine/progression';
import { CheckInSheet, sleepLabel } from '@/features/checkin/CheckInSheet';
import { addDays, daysBetweenISO, fmtDayLabel, lastNDays, parseISODate, todayISO } from '@/lib/date';
import { color, font, radius, space } from '@/theme/tokens';

import type { BodySectionProps } from './WeightSection';

const WEEKDAY = 'SMTWTFS';
/** Where a night's bar turns green: seven hours is the floor for most adults. */
const SLEEP_GOAL_H = 7;
/** The big movers, in the order people think of them. Others appear once trained. */
const MUSCLES: readonly Muscle[] = ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes', 'biceps', 'triceps'];

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The window the muscle lines span: two weeks, today at the right. */
const SPAN_DAYS = 14;

/** The engine's readiness score, in words. It only ever lowers a target, never raises one. */
const READINESS: Record<string, { title: string; pill: string; tone: PillTone }> = {
  '1': { title: 'Good to train hard', pill: 'Ready', tone: 'positive' },
  '0.98': { title: 'Train as planned', pill: 'Fine', tone: 'muted' },
  '0.95': { title: 'Ease off a little', pill: 'Lower', tone: 'warning' },
  '0.9': { title: 'Take it easier today', pill: 'Low', tone: 'warning' },
};

/**
 * Body → Recovery. Today's readiness and where it came from, how each muscle is
 * coming back, sleep, and every past answer — each of which can be corrected. The
 * one action opens the same CheckInSheet Today does; there is no second form (UX-03).
 */
export function RecoverySection({ frame }: BodySectionProps) {
  const today = todayISO();
  const checkIns = useLive(() => listCheckIns(addDays(today, -13)), ['check_in'], [today]);
  const recorded = useLive(() => recentCheckIns(14), ['check_in']);
  const todays = useLive(() => getCheckIn(today) ?? null, ['check_in'], [today]);
  const trained = useLive(() => lastTrainedByMuscle(14), ['set_log', 'session']);
  const [editing, setEditing] = useState<string | null>(null);

  const sleepByDate = new Map(checkIns.map((c) => [c.date, c.sleepHours ?? 0]));
  const nights = lastNDays(14, today).map((d) => ({ label: WEEKDAY[parseISODate(d).getDay()] ?? '', value: sleepByDate.get(d) ?? 0 }));
  const slept = checkIns.flatMap((c) => (c.sleepHours === null ? [] : [c.sleepHours]));

  const answered = todays && (todays.sleepHours !== null || todays.soreness !== null || todays.stress !== null);
  const r = answered
    ? {
        ...(todays.sleepHours !== null ? { sleepHours: todays.sleepHours } : {}),
        ...(todays.soreness !== null ? { soreness: todays.soreness } : {}),
        ...(todays.stress !== null ? { stress: todays.stress } : {}),
      }
    : undefined;
  const verdict = READINESS[String(readinessModifier(r))] ?? READINESS['1'];
  const facts = answered
    ? [
        todays.sleepHours !== null ? `Slept ${sleepLabel(todays.sleepHours)}` : null,
        todays.soreness !== null ? `soreness ${todays.soreness} of 5` : null,
        todays.stress !== null ? `stress ${todays.stress} of 5` : null,
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  const muscles = [...MUSCLES, ...[...trained.keys()].filter((m) => !MUSCLES.includes(m as Muscle))];

  return (
    <Screen
      {...frame}
      tab
      dock={
        <PrimaryButton
          label={answered ? "Edit today's check-in" : 'Check in'}
          size="gym"
          icon={<Icon name="pulse" size={20} color={color.onAccent} />}
          onPress={() => setEditing(today)}
        />
      }
    >
      <Card style={styles.ready}>
        {answered && verdict ? (
          <>
            <View style={styles.rowBetween}>
              <Text style={styles.readyTitle}>{verdict.title}</Text>
              <Pill label={verdict.pill} tone={verdict.tone} />
            </View>
            <Text style={styles.muted}>{facts}</Text>
          </>
        ) : (
          <>
            <Text style={styles.readyTitle}>No check-in today</Text>
            <Text style={styles.muted}>Optional, before a workout or any time.</Text>
          </>
        )}
        <Press onPress={() => setEditing(today)} accessibilityRole="button" hitSlop={space.sm} style={styles.linkWrap}>
          <Icon name={answered ? 'edit' : 'pulse'} size={14} color={color.lav} />
          <Text style={styles.link}>{answered ? 'Edit check-in' : 'Check in now'}</Text>
        </Press>
      </Card>

      {/*
        The fact, not a verdict on it. These rows used to be fill bars of a
        "recovered %" from a fixed 40%-plus-16%-a-day ramp, green or amber — a
        physiological claim the data cannot make (brief §5). Each row is now two
        weeks on a line, with a solid mark on the day that muscle last got a
        working set: what happened, in the app's own marks, and nothing inferred.
      */}
      <SectionHeader title="Last trained" right={<Text style={styles.legend}>14 days</Text>} />
      <View>
        {muscles.map((m, i) => {
          const last = trained.get(m);
          const days = last ? daysBetweenISO(last, today) : null;
          const label = MUSCLE_LABEL[m as Muscle] ?? m;
          const at = days === null ? null : ((SPAN_DAYS - 1 - Math.min(SPAN_DAYS - 1, days)) / (SPAN_DAYS - 1)) * 100;
          return (
            <View
              key={m}
              style={[styles.muscle, i > 0 && styles.divider]}
              accessible
              accessibilityLabel={`${label}: ${days === null ? 'not trained in the last two weeks' : `last trained ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}`}`}
            >
              <Text style={styles.muscleName} numberOfLines={1}>
                {label}
              </Text>
              <View style={styles.span}>
                <View style={styles.spanLine} />
                {at !== null ? <View style={[styles.spanMark, { left: `${at}%` }]} /> : null}
              </View>
              <Text style={styles.ago}>{days === null ? '—' : days === 0 ? 'today' : `${days} d ago`}</Text>
            </View>
          );
        })}
      </View>

      <SectionHeader title="Sleep" />
      <Card>
        {slept.length ? (
          <>
            <MiniBars data={nights} target={SLEEP_GOAL_H} highlight={nights.length - 1} ink={color.lav} bubble={`${nights[nights.length - 1]?.value ?? 0} h`} />
            <Text style={styles.hint}>
              Average {mean(slept).toFixed(1)} h across {slept.length} {slept.length === 1 ? 'night' : 'nights'}.
            </Text>
          </>
        ) : (
          <EmptyState message="No sleep logged yet." hint="Add last night's sleep when you check in." />
        )}
      </Card>

      {recorded.length ? (
        <>
          <SectionHeader title="Check-ins" />
          <ListCard>
            {recorded.map((c, i) => {
              const parts = [
                c.sleepHours !== null ? sleepLabel(c.sleepHours) : null,
                c.soreness !== null ? `soreness ${c.soreness}` : null,
                c.stress !== null ? `stress ${c.stress}` : null,
              ].filter(Boolean);
              return (
                <ListRow
                  key={c.date}
                  divider={i > 0}
                  title={fmtDayLabel(c.date)}
                  sub={parts.length ? parts.join(', ') : 'Not recorded'}
                  onPress={() => setEditing(c.date)}
                  accessibilityLabel={`Check-in for ${fmtDayLabel(c.date)}: ${parts.length ? parts.join(', ') : 'nothing recorded'}. Tap to correct.`}
                />
              );
            })}
          </ListCard>
        </>
      ) : null}

      {/* Keyed by day so each opening reads that day's answers. */}
      <CheckInSheet visible={editing !== null} date={editing ?? today} datePicker onClose={() => setEditing(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  ready: { gap: space.sm, marginBottom: 0 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  readyTitle: { ...font.titleSm, color: color.text, flexShrink: 1 },
  muted: { ...font.caption, color: color.textMuted },
  linkWrap: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: space.md, marginTop: space.xs, borderRadius: radius.pill, backgroundColor: color.lavSoft },
  link: { ...font.caption, fontWeight: '800', color: color.lav },
  legend: { ...font.caption, fontSize: 12, color: color.textFaint },
  muscle: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  divider: { borderTopWidth: 1, borderTopColor: color.border },
  muscleName: { ...font.label, fontSize: 14, fontWeight: '600', color: color.text, width: 88 },
  span: { flex: 1, height: 14, justifyContent: 'center' },
  spanLine: { height: 4, borderRadius: radius.pill, backgroundColor: color.surfaceHigh },
  spanMark: { position: 'absolute', top: 1, width: 12, height: 12, marginLeft: -6, borderRadius: radius.pill, backgroundColor: color.lav },
  ago: { ...font.caption, fontSize: 12, ...font.numeric, color: color.textFaint, width: 52, textAlign: 'right' },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
});
