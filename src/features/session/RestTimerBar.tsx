import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { Ring } from '@/components/Ring';
import { fmtClock } from '@/lib/date';
import type { RestTimerView } from '@/services/restTimer';
import { color, font, material, radius, space } from '@/theme/tokens';

import { clockStyle, TimerNudge } from './Countdown';

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
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ring progress={total > 0 ? t.remainingMs / total : 0} size={40} thickness={5}>
            <View />
          </Ring>
        </View>
        <View style={styles.clockBox} accessible accessibilityLabel={`Rest, ${fmtClock(left)} left`}>
          <Text style={styles.eyebrow}>Rest</Text>
          {/* The same face the drill countdown wears, at dock size — see Countdown. */}
          <Text style={clockStyle.bar}>{fmtClock(left)}</Text>
        </View>
        <View style={styles.flex} />
        <TimerNudge label="−15" a11y="Fifteen seconds less rest" onPress={() => t.add(-15)} />
        <TimerNudge label="+30" a11y="Thirty seconds more rest" onPress={() => t.add(30)} />
        <TimerNudge label="Skip" a11y="Skip rest" quiet onPress={t.cancel} />
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
        <Text style={styles.idleHint}>{autoStart ? '. Starts when you log a set' : '. Tap to start it now'}</Text>
      </Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  idleHeld: { backgroundColor: color.surfaceHigh },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2, minHeight: 64, paddingLeft: space.md, paddingRight: space.sm, backgroundColor: color.surface, borderRadius: radius.pill, borderWidth: 1.5, borderColor: 'transparent' },
  live: { borderColor: color.accent, boxShadow: material.heat },
  flex: { flex: 1, minWidth: 0 },
  idleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 36, borderRadius: radius.pill },
  idleText: { ...font.caption, fontSize: 13, ...font.numeric, fontWeight: '700', color: color.textMuted },
  idleHint: { fontWeight: '500', color: color.textFaint },
  clockBox: { minWidth: 64 },
  eyebrow: { ...font.caption, fontSize: 11, lineHeight: 13, fontWeight: '700', color: color.textMuted },
});
