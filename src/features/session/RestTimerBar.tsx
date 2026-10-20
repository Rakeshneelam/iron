import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { fmtClock } from '@/lib/date';
import { selection } from '@/lib/haptics';
import type { RestTimerView } from '@/services/restTimer';
import { CSS_LINEAR, type AnimatedViewStyle } from '@/theme/curves';
import { color, font, hit, material, radius, space } from '@/theme/tokens';

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
  onAutoStart: (on: boolean) => void;
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
export function RestTimerBar({ timer: t, seconds, autoStart, onAutoStart, onStart }: RestTimerBarProps) {
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
  return (
    <View style={styles.row}>
      <Pressable
        style={styles.idle}
        disabled={autoStart}
        onPress={onStart}
        accessibilityRole={autoStart ? undefined : 'button'}
        accessibilityLabel={autoStart ? `Rest ${fmtClock(seconds)}, starts when you log a set` : `Start ${fmtClock(seconds)} rest now`}
      >
        <Icon name="timer" size={22} color={color.textMuted} />
        <View style={styles.flex}>
          <Text style={styles.title}>Rest {fmtClock(seconds)}</Text>
          <Text style={styles.sub}>{autoStart ? 'Starts when you log a set' : 'Tap to start it now'}</Text>
        </View>
      </Pressable>
      <Text style={styles.autoLabel}>Auto-start</Text>
      <Switch
        value={autoStart}
        onValueChange={(v) => {
          selection();
          onAutoStart(v);
        }}
        accessibilityLabel="Auto-start rest timer"
        trackColor={{ false: color.border, true: color.accent }}
        thumbColor={autoStart ? color.onAccent : color.textMuted}
      />
    </View>
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
  idle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hit.default },
  title: { ...font.label, fontSize: 16, fontWeight: '700', ...font.numeric, color: color.text },
  sub: { ...font.caption, fontSize: 13, color: color.textMuted },
  autoLabel: { ...font.caption, fontSize: 12, fontWeight: '600', color: color.textMuted },
  clockBox: { minWidth: 96 },
  eyebrow: { ...font.eyebrow, fontSize: 10, color: color.textFaint },
  /** 4px, not 3: the drain is the only thing on screen reporting the timer's state at a glance. */
  progress: { position: 'absolute', left: 0, bottom: 0, height: 4, backgroundColor: color.accent },
});
