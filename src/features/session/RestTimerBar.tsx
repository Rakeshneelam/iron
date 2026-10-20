import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { fmtClock } from '@/lib/date';
import type { RestTimerView } from '@/services/restTimer';
import { CSS_LINEAR, type AnimatedViewStyle } from '@/theme/curves';
import { color, font, material, radius, space } from '@/theme/tokens';

import { clockStyle, TimerNudge } from './Countdown';

/**
 * The bar drains smoothly between the timer's own once-a-second updates.
 *
 * The remaining time is still the only source of truth — `endsAt - now`,
 * recomputed on render — and this does not touch it. It just interpolates the
 * width across the gap between two of those values, so a countdown reads as
 * draining rather than ticking down in steps.
 *
 * Animating `width` is normally the one thing to avoid, because it re-runs layout
 * for the node and its siblings every frame. This element is the exception the
 * rule is written around: absolutely positioned, with no children and no
 * siblings in flow, so nothing re-lays-out — and a `scaleX` would smear its
 * corners and have to be anchored by hand.
 */
const DRAIN: AnimatedViewStyle = {
  transitionProperty: ['width'],
  transitionDuration: 1000,
  transitionTimingFunction: CSS_LINEAR,
};

export interface RestTimerBarProps {
  timer: RestTimerView;
  /** This exercise's planned rest. Null when there is nothing to rest from (cardio, no exercise). */
  seconds: number | null;
  autoStart: boolean;
  onStart: () => void;
}

/**
 * The rest row, always in the same place above Log set. Idle, it says what rest
 * is coming and owns the auto-start switch — with auto-start off, the row itself
 * starts the timer. Running, it is the countdown.
 *
 * The number is endsAt - now, recomputed every render. The timer is passed in
 * rather than subscribed to here: it has to survive the current exercise being
 * skipped, removed or absent, so the screen owns the one subscription.
 */
export function RestTimerBar({ timer: t, seconds, autoStart, onStart }: RestTimerBarProps) {
  if (t.running) {
    const left = Math.ceil(t.remainingMs / 1000);
    const total = t.totalMs || t.remainingMs;
    return (
      // Running is the one live thing on this screen, so it is the one thing that
      // glows. See `material.heat`.
      <View style={[styles.row, styles.live]} accessibilityLiveRegion="none">
        <View style={styles.clockBox} accessible accessibilityLabel={`Rest, ${fmtClock(left)} left`}>
          <Text style={styles.eyebrow}>Rest</Text>
          {/* The same face the drill countdown wears, at dock size — see Countdown. */}
          <Text style={clockStyle.bar}>{fmtClock(left)}</Text>
        </View>
        <View style={styles.flex} />
        <TimerNudge label="−15" a11y="Fifteen seconds less rest" onPress={() => t.add(-15)} />
        <TimerNudge label="+30" a11y="Thirty seconds more rest" onPress={() => t.add(30)} />
        <TimerNudge label="Skip" a11y="Skip rest" quiet onPress={t.cancel} />
        <Animated.View style={[styles.progress, DRAIN, { width: `${Math.max(0, Math.min(1, t.remainingMs / total)) * 100}%` }]} />
      </View>
    );
  }
  if (seconds === null) return null;
  /*
   * Idle, this is one thin line, not a card.
   *
   * It used to be 76dp carrying a two-line block and a duplicate of the
   * "Start rest after each set" switch that already lives in Settings — a
   * preference someone changes once, permanently occupying the dock of the
   * screen where Weight, Reps and Log set were fighting for room. The switch is
   * gone; the setting is where settings are.
   */
  return (
    <Pressable
      style={styles.idleRow}
      disabled={autoStart}
      onPress={onStart}
      accessibilityRole={autoStart ? undefined : 'button'}
      accessibilityLabel={autoStart ? `Rest ${fmtClock(seconds)}, starts when you log a set` : `Start ${fmtClock(seconds)} rest now`}
    >
      <Icon name="timer" size={16} color={color.textFaint} />
      <Text style={styles.idleText} numberOfLines={1}>
        Rest {fmtClock(seconds)} <Text style={styles.idleHint}>{autoStart ? 'starts when you log a set' : '· tap to start now'}</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 76,
    paddingLeft: space.lg,
    paddingRight: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    overflow: 'hidden',
  },
  live: { borderColor: color.accent, boxShadow: material.heat },
  flex: { flex: 1, minWidth: 0 },
  idleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 36 },
  idleText: { ...font.caption, fontSize: 13, ...font.numeric, color: color.textMuted },
  idleHint: { color: color.textFaint },
  clockBox: { minWidth: 96 },
  eyebrow: { ...font.eyebrow, fontSize: 10, color: color.textFaint },
  /** 4px, not 3: the drain is the only thing on screen reporting the timer's state at a glance. */
  progress: { position: 'absolute', left: 0, bottom: 0, height: 4, backgroundColor: color.accent },
});
