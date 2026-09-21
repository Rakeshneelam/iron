/**
 * Haptics, with one switch that actually reaches everything.
 *
 * Settings has a Haptics toggle. It was consulted in exactly one place — the
 * session screen's commit feedback — while Stepper, ChipRow and every button went
 * straight to expo-haptics with their own `haptics = true` default. Turning it off
 * silenced logging a set and nothing else: every ± tap and every chip still buzzed
 * (UX-11).
 *
 * A module-level flag rather than a hook, because these fire from tap handlers
 * inside shared primitives that have no business importing a repository. The
 * settings layer pushes the value in; everything else just calls through.
 */
import * as Haptics from 'expo-haptics';

let enabled = true;

/** Called by the settings layer whenever the preference is read or changed. */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export function hapticsEnabled(): boolean {
  return enabled;
}

/** Stepping a number, picking a chip — the small stuff. */
export function selection(): void {
  if (enabled) void Haptics.selectionAsync().catch(() => undefined);
}

/** Pressing a button. */
export function impact(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light): void {
  if (enabled) void Haptics.impactAsync(style).catch(() => undefined);
}

/** A commit: a set logged, a weigh-in saved. Stronger, and still switchable. */
export function success(): void {
  if (enabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
