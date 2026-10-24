import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FitText } from '@/components/FitText';
import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { Ring } from '@/components/Ring';
import { fmtClock } from '@/lib/date';
import { selection, success } from '@/lib/haptics';
import { color, font, hit, material, radius, space } from '@/theme/tokens';

/**
 * One countdown, one look, everywhere a clock runs: timed warm-up drills, timed
 * working sets, timed cool-down holds. The rest timer between sets wears the bar
 * version of the same parts (`TimerNudge`, `clockStyle`) because it has to share
 * the dock with the set controls, but the typography and the controls match.
 *
 * Why a ring and not a bar: in a gym the phone is on the floor or a bench, two
 * feet away and at an angle, and the question is "how much longer" rather than
 * "what is the exact number". A closing arc answers that from across a rack; four
 * digits do not. The digits are still there, in the middle, at the one size on
 * this screen that is bigger than the set you are logging.
 *
 * The number is `endsAt - now`, recomputed on render from a timestamp, so it is
 * right after a re-render, a backgrounding or a screen-off — never a counter that
 * drifts because an interval was throttled.
 */
export interface CountdownHandle {
  /** Seconds left, counting down. */
  remaining: number;
  running: boolean;
  /** Start, or resume from where it was paused. */
  start: () => void;
  pause: () => void;
  /** Back to the full duration, stopped. */
  reset: () => void;
  add: (seconds: number) => void;
  /** True once it has run down to zero and not been reset. */
  finished: boolean;
}

/**
 * A countdown owned by the component that shows it.
 *
 * Deliberately NOT the rest timer (`services/restTimer`): that one is a
 * foreground service because it has to survive Doze while the phone is in a
 * pocket between sets. A drill timer is watched while it runs — the user is
 * holding a stretch, looking at it — so a timestamp and an interval is the whole
 * requirement, and a second foreground service would be a notification channel
 * and a native lifecycle for no gain.
 */
export function useCountdown(totalSeconds: number, resetKey?: string): CountdownHandle {
  const [left, setLeft] = useState(totalSeconds);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  /*
   * Moving to another drill resets the clock, during render, so the previous
   * drill's seconds never show for a frame.
   *
   * It keys on `resetKey` and not on the duration alone. Two 30-second stretches
   * back to back have the same duration, so a duration-only check saw no change
   * and handed the second one the first one's clock — which had just run to zero,
   * so the drill opened already "done" with nothing to start.
   */
  const [shownFor, setShownFor] = useState({ totalSeconds, resetKey });
  if (shownFor.totalSeconds !== totalSeconds || shownFor.resetKey !== resetKey) {
    setShownFor({ totalSeconds, resetKey });
    setLeft(totalSeconds);
    setEndsAt(null);
  }

  const remaining = endsAt === null ? left : Math.max(0, Math.ceil((endsAt - now) / 1000));

  useEffect(() => {
    if (endsAt === null) return;
    const t = setInterval(() => {
      const at = Date.now();
      if (at < endsAt) {
        setNow(at);
        return;
      }
      setEndsAt(null);
      setLeft(0);
      success();
    }, 250);
    return () => clearInterval(t);
  }, [endsAt]);

  return {
    remaining,
    running: endsAt !== null,
    finished: endsAt === null && left === 0 && totalSeconds > 0,
    start: () => {
      const from = remaining === 0 ? totalSeconds : remaining;
      setNow(Date.now());
      setEndsAt(Date.now() + from * 1000);
    },
    pause: () => {
      setLeft(remaining);
      setEndsAt(null);
    },
    reset: () => {
      setLeft(totalSeconds);
      setEndsAt(null);
    },
    add: (seconds) => {
      if (endsAt === null) setLeft(Math.max(0, left + seconds));
      else setEndsAt(Math.max(Date.now(), endsAt + seconds * 1000));
    },
  };
}

export interface CountdownProps {
  timer: CountdownHandle;
  total: number;
  /** Over the clock: 'Hold', 'Rest', 'Each side'. */
  caption?: string;
  /** Under the clock while running — "Switch sides", say. */
  note?: string | null;
  size?: number;
  /** Hide ±15/+30 where nudging the clock makes no sense. */
  nudges?: boolean;
}

/**
 * The hero countdown. Ring, clock, one obvious control, and the two nudges — the
 * same three gestures the rest timer offers, in the same order, so there is one
 * timer to learn rather than three.
 */
export function Countdown({ timer, total, caption, note, size = 208, nudges = true }: CountdownProps) {
  const t = timer;
  // Finished draws a FULL ring, not an empty one: an empty ring is what "not
  // started" looks like, and the two states must not share a picture. Heat only
  // while it runs — a stopped dial is not live — and finished is chalk, because
  // finishing a hold is the normal case and green is kept for a best.
  const progress = t.finished ? 1 : total > 0 ? t.remaining / total : 0;
  const tone = t.running ? 'accent' : 'chalk';

  return (
    <View style={styles.wrap}>
      {/* Running is live, so it glows; stopped, it is just a dial (see material.heat). */}
      <View style={[styles.dial, t.running && styles.dialLive]}>
        <Ring progress={progress} size={size} thickness={10} tone={tone} graduations={60}>
          {caption ? <Text style={styles.caption}>{caption}</Text> : null}
          <FitText style={styles.clock} numberOfLines={1} minimumFontScale={0.6}>
            {fmtClock(t.remaining)}
          </FitText>
          <Text style={styles.note} numberOfLines={1}>
            {t.finished ? 'done' : (note ?? (t.running ? 'remaining' : 'ready'))}
          </Text>
        </Ring>
      </View>

      <View style={styles.controls}>
        {nudges ? <TimerNudge label="−15" a11y="Fifteen seconds less" onPress={() => t.add(-15)} /> : null}
        <Press
          onPress={() => {
            selection();
            if (t.running) t.pause();
            else t.start();
          }}
          accessibilityRole="button"
          accessibilityLabel={t.running ? 'Pause the timer' : t.finished ? 'Run it again' : 'Start the timer'}
          style={[styles.play, t.running ? styles.playOn : styles.playHot]}
          pressedStyle={styles.playHeld}
        >
          <Icon
            name={t.running ? 'pause' : t.finished ? 'undo' : 'play'}
            size={22}
            color={t.running ? color.text : color.onAccent}
            strokeWidth={2.4}
          />
          <Text style={[styles.playText, t.running && styles.playTextOn]}>{t.running ? 'Pause' : t.finished ? 'Again' : 'Start'}</Text>
        </Press>
        {nudges ? <TimerNudge label="+30" a11y="Thirty seconds more" onPress={() => t.add(30)} /> : null}
      </View>
    </View>
  );
}

/** A square ± control. Shared with the rest-timer bar so both clocks nudge alike. */
export function TimerNudge({ label, a11y, quiet, onPress }: { label: string; a11y: string; quiet?: boolean; onPress: () => void }) {
  return (
    <Press
      onPress={() => {
        selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={[styles.nudge, quiet && styles.nudgeQuiet]}
      pressedStyle={styles.nudgeHeld}
    >
      <Text style={[styles.nudgeText, quiet && styles.nudgeTextQuiet]}>{label}</Text>
    </Press>
  );
}

/**
 * The clock face, at the one size that fits a dock row. Exported so the rest
 * timer reads as the same instrument as the drill timer rather than as a
 * different component that happens to also count down.
 *
 * `lineHeight` is set explicitly on every size here: the display face carries
 * lineHeight 48, and digits larger than their inherited line height clip at the
 * top on Android.
 */
export const clockStyle = StyleSheet.create({
  bar: { ...font.measure, fontSize: 38, lineHeight: 42, fontWeight: '800', letterSpacing: -0.6, color: color.text },
});

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.lg },
  dial: { borderRadius: radius.pill },
  dialLive: { boxShadow: material.heat },
  caption: { ...font.eyebrow, color: color.textFaint },
  clock: { ...font.measure, fontSize: 64, lineHeight: 68, fontWeight: '800', letterSpacing: -1, color: color.text },
  note: { ...font.caption, fontSize: 12, color: color.textMuted },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  play: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minWidth: 132,
    minHeight: hit.gym,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    backgroundColor: color.accentFill,
  },
  playHot: { boxShadow: material.heat },
  playOn: { backgroundColor: color.surfaceHigh, borderWidth: 1, borderColor: color.border },
  playHeld: { backgroundColor: color.accentFillPressed },
  playText: { ...font.heading, fontSize: 18, color: color.onAccent },
  playTextOn: { color: color.text },
  nudge: {
    minWidth: hit.gym,
    height: hit.gym,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    backgroundColor: color.surfaceHigh,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeQuiet: { backgroundColor: 'transparent' },
  nudgeHeld: { backgroundColor: color.border },
  nudgeText: { ...font.measure, fontSize: 18, lineHeight: 22, color: color.text },
  nudgeTextQuiet: { fontWeight: '600', color: color.textMuted },
});
