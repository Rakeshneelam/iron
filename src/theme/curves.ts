/**
 * The easing curves, and the one press transition every pressable shares.
 *
 * Separate from `tokens.ts` on purpose: these are Reanimated bindings, and
 * `tokens.ts` is imported by `tests/theme-contrast.test.ts` under plain `node
 * --test`, where there is no Reanimated stub. Numbers live in tokens; anything
 * that needs the animation library lives here.
 *
 * Reanimated's built-in easings are as weak as CSS's keywords, so these are
 * explicit beziers. Note the two different forms — the library takes one in CSS
 * styles and the other in `withTiming`, and 4.5.1 rejects a raw
 * 'cubic-bezier(...)' string in either:
 *
 *   cubicBezier(...)   → transitionTimingFunction / animationTimingFunction
 *   Easing.bezier(...) → withTiming, .easing(...)
 *
 * There is no `ease-in` here. It starts slow, which delays the exact instant the
 * user is watching for, and on a control under a thumb that reads as lag.
 */
import { StyleSheet, type ViewStyle } from 'react-native';
import { cubicBezier, Easing, type CSSStyle } from 'react-native-reanimated';

import { material, motion, radius } from './tokens';

/**
 * A style an `Animated.View` accepts: everything `ViewStyle` has, plus the CSS
 * transition and animation properties. React Native's own `ViewStyle` does not
 * know `transitionProperty` exists, so anything carrying one needs this instead.
 */
export type AnimatedViewStyle = CSSStyle<ViewStyle>;

/** Entering, exiting, and anything under a thumb. The workhorse. */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Something already on screen moving to a new place — a tab pill, a reorder. */
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
/** iOS's own sheet curve, for the one thing that is a sheet. */
export const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

/** The CSS-transition form of EASE_OUT. */
export const CSS_EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
/** Constant motion: a countdown draining, a progress bar filling. */
export const CSS_LINEAR = cubicBezier(0, 0, 1, 1);

/**
 * A CSS transition on the given properties.
 *
 * These cannot live inside `StyleSheet.create` — it types every value as a plain
 * RN style and widens `transitionProperty` to `string[]`, which the library then
 * rejects. So they are plain objects, and this is the one place that shape is
 * written down.
 *
 * Name the properties rather than reaching for 'all': 'all' transitions anything
 * that happens to change, which on a component that also re-lays-out means
 * animating a width or a margin by accident — the one thing guaranteed to stutter.
 */
export function transition(properties: (keyof ViewStyle | 'all')[], duration: number = motion.fast): AnimatedViewStyle {
  return { transitionProperty: properties, transitionDuration: duration, transitionTimingFunction: CSS_EASE_OUT };
}

/**
 * Press feedback as a CSS transition rather than a shared value.
 *
 * A press is two states, not a continuous one, so it needs no worklet and no
 * `useAnimatedStyle` — `setState` here fires twice per press, not once per frame.
 * Scale takes the label and any icon down with it, which is what makes it read as
 * the surface giving way rather than as a colour change.
 *
 * Spread `press.base` onto the animated view and `press.down` when pressed.
 */
export const press: Record<'base' | 'down', AnimatedViewStyle> = {
  base: { transform: [{ scale: 1 }], ...transition(['transform'], motion.press) },
  down: { transform: [{ scale: motion.pressScale }] },
};

/**
 * The machined top edge, as a child view rather than a border.
 *
 * A `borderTopColor` would need `borderTopWidth`, which changes the box and so
 * shifts every child down a pixel; an absolutely positioned hairline costs no
 * layout and can sit inside the parent's corner radius. Render it as the first
 * child of a card, under `pointerEvents="none"`.
 */
export const edgeStyle = {
  position: 'absolute' as const,
  top: 0,
  left: radius.lg,
  right: radius.lg,
  height: StyleSheet.hairlineWidth,
  backgroundColor: material.edge,
};
