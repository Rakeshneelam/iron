import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { fmtClock } from '@/lib/date';
import { selection } from '@/lib/haptics';
import type { RestTimerView } from '@/services/restTimer';
import { color, font, hit, radius, space } from '@/theme/tokens';

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
      <View style={styles.row} accessibilityLiveRegion="none">
        <View style={styles.clockBox} accessible accessibilityLabel={`Rest, ${fmtClock(left)} left`}>
          <Text style={styles.eyebrow}>Rest</Text>
          <Text style={styles.clock}>{fmtClock(left)}</Text>
        </View>
        <View style={styles.flex} />
        <Nudge label="−15" a11y="Fifteen seconds less rest" onPress={() => t.add(-15)} />
        <Nudge label="+30" a11y="Thirty seconds more rest" onPress={() => t.add(30)} />
        <Nudge label="Skip" a11y="Skip rest" quiet onPress={t.cancel} />
        <View style={[styles.progress, { width: `${Math.max(0, Math.min(1, t.remainingMs / total)) * 100}%` }]} />
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

function Nudge({ label, a11y, quiet, onPress }: { label: string; a11y: string; quiet?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [styles.nudge, quiet && styles.nudgeQuiet, pressed && styles.pressed]}
    >
      <Text style={[styles.nudgeText, quiet && styles.nudgeTextQuiet]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 64,
    paddingLeft: space.lg,
    paddingRight: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    overflow: 'hidden',
  },
  flex: { flex: 1, minWidth: 0 },
  idle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hit.default },
  title: { ...font.label, fontSize: 14, fontWeight: '600', ...font.numeric, color: color.text },
  sub: { ...font.caption, fontSize: 12, color: color.textFaint },
  autoLabel: { ...font.caption, fontSize: 12, fontWeight: '600', color: color.textMuted },
  clockBox: { minWidth: 88 },
  eyebrow: { ...font.eyebrow, fontSize: 10, color: color.textFaint },
  clock: { ...font.title, fontSize: 30, fontWeight: '800', ...font.numeric, color: color.text },
  nudge: {
    minWidth: hit.default,
    height: hit.default,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    backgroundColor: color.surfaceHigh,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeQuiet: { backgroundColor: 'transparent' },
  nudgeText: { ...font.label, fontSize: 14, fontWeight: '700', ...font.numeric, color: color.text },
  nudgeTextQuiet: { fontWeight: '600', color: color.textMuted },
  pressed: { opacity: 0.7 },
  progress: { position: 'absolute', left: 0, bottom: 0, height: 3, backgroundColor: color.accent },
});
