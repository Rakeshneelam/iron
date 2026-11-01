import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { fmtClock } from '@/lib/date';
import type { RestTimerView } from '@/services/restTimer';
import { CSS_LINEAR, type AnimatedViewStyle } from '@/theme/curves';
import { color, font, radius, space } from '@/theme/tokens';

import { clockStyle, TimerNudge } from './Countdown';

/**
 * The line drains smoothly between the timer's once-a-second updates. The number is
 * still `endsAt - now`, recomputed on render; this only interpolates the width.
 * Animating `width` is safe here: the line has no children and nothing beside it.
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
      // A strip, not a card: a second big pill directly over Log set read as two
      // buttons fighting for the thumb (device test, 0.8.0). The draining line
      // under it is the glance from across the rack.
      <View style={styles.strip} accessibilityLiveRegion="none">
        <View style={styles.stripRow}>
          <Icon name="timer" size={18} color={color.accent} strokeWidth={2.4} />
          <View style={styles.clockBox} accessible accessibilityLabel={`Rest, ${fmtClock(left)} left`}>
            <Text style={clockStyle.bar}>{fmtClock(left)}</Text>
          </View>
          <View style={styles.flex} />
          <TimerNudge plain label="−15" a11y="Fifteen seconds less rest" onPress={() => t.add(-15)} />
          <TimerNudge plain label="+30" a11y="Thirty seconds more rest" onPress={() => t.add(30)} />
          <TimerNudge plain quiet label="Skip" a11y="Skip rest" onPress={t.cancel} />
        </View>
        <View style={styles.track}>
          <Animated.View style={[styles.drain, DRAIN, { width: `${Math.max(0, Math.min(1, t.remainingMs / total)) * 100}%` }]} />
        </View>
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
    <Press
      feedback="highlight"
      style={styles.idleRow}
      pressedStyle={styles.idleHeld}
      disabled={autoStart}
      onPress={onStart}
      accessibilityRole={autoStart ? undefined : 'button'}
      accessibilityLabel={autoStart ? `Rest ${fmtClock(seconds)}, starts when you log a set` : `Start ${fmtClock(seconds)} rest now`}
    >
      <Icon name="timer" size={16} color={color.textFaint} />
      <Text style={styles.idleText} numberOfLines={1}>
        Rest {fmtClock(seconds)}
        {autoStart ? null : <Text style={styles.idleHint}> · tap to start</Text>}
      </Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  idleHeld: { backgroundColor: color.surfaceHigh },
  strip: { paddingTop: space.xs },
  stripRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: space.xs },
  flex: { flex: 1, minWidth: 0 },
  clockBox: { minWidth: 64 },
  track: { height: 3, borderRadius: radius.pill, backgroundColor: color.surfaceHigh, overflow: 'hidden', marginTop: space.xs },
  drain: { height: '100%', borderRadius: radius.pill, backgroundColor: color.accent },
  idleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 36, borderRadius: radius.pill },
  idleText: { ...font.caption, fontSize: 13, ...font.numeric, fontWeight: '700', color: color.textMuted },
  idleHint: { fontWeight: '500', color: color.textFaint },
});
