import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { press, transition, type AnimatedViewStyle } from '@/theme/curves';
import { motion } from '@/theme/tokens';

/**
 * The one press feedback in the app.
 *
 * Every pressable used to say it had been touched by dropping to `opacity: 0.6` —
 * the cheapest feedback there is, and the flattest: a button going translucent
 * looks disabled, not pressed. This gives the surface somewhere to go instead.
 *
 * Two kinds, and which one you want depends on the size of the thing:
 *
 *   scale     — buttons, chips, cards, icons. 3% in 120ms. Scale takes the label
 *               and icon down with it, which is what makes it read as the surface
 *               giving way under a thumb rather than as a colour change.
 *   highlight — full-width list rows. A row that scales reads as the whole screen
 *               squashing, so a row lights up instead.
 *
 * The touch target stays a plain `Pressable` and every prop passed here lands on
 * it, so the careful accessibility work in the components that use this — roles,
 * states, labels, hints, actions — is untouched. Only the visual moves to the
 * Animated.View inside.
 *
 * `setState` is the right tool here and not a worklet: it fires twice per press,
 * not once per frame, and a press is two states rather than a continuous value.
 */
export interface PressProps extends Omit<PressableProps, 'style' | 'children'> {
  children?: ReactNode;
  /** The visual box. Goes on the inner animated view, not the touch target. */
  style?: StyleProp<AnimatedViewStyle>;
  /** Applied while held — a background, a border colour. Optional for `scale`. */
  pressedStyle?: StyleProp<AnimatedViewStyle>;
  /**
   * Layout for the touch target itself: `flex: 1` in a row, a margin above.
   * It has to live on the Pressable, because that is the child the parent's
   * flexbox sees — put `flex: 1` on the inner view and the button stops filling
   * its half of a pair.
   */
  touchStyle?: StyleProp<ViewStyle>;
  feedback?: 'scale' | 'highlight' | 'none';
}

export function Press({ children, style, pressedStyle, touchStyle, feedback = 'scale', ...rest }: PressProps) {
  const [held, setHeld] = useState(false);
  return (
    <Pressable
      // A thumb drifting a few pixels mid-press meant it, so do not cancel on it.
      pressRetentionOffset={16}
      {...rest}
      style={touchStyle}
      onPressIn={(e) => {
        setHeld(true);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setHeld(false);
        rest.onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, FEEDBACK[feedback], held && pressedStyle, held && feedback === 'scale' && press.down]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/**
 * `highlight` transitions its background rather than its transform, so the row
 * lights and fades instead of moving. `none` still needs no transition at all —
 * a caller that wants an instant change is saying the change IS the feedback.
 */
const FEEDBACK: Record<NonNullable<PressProps['feedback']>, AnimatedViewStyle | undefined> = {
  scale: press.base,
  highlight: transition(['backgroundColor'], motion.press),
  none: undefined,
};
