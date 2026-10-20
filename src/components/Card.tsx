import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp } from 'react-native';
import Animated from 'react-native-reanimated';

import { edgeStyle, type AnimatedViewStyle } from '@/theme/curves';
import { color, gap, radius, space } from '@/theme/tokens';

import { Press } from './Press';

export type CardTone = 'default' | 'accent' | 'positive' | 'warning' | 'danger';

export interface CardProps {
  children?: ReactNode;
  /**
   * Animated rather than plain `ViewStyle`, so a caller can hand a card a
   * transition or a keyframe animation. Ordinary StyleSheet styles still fit.
   */
  style?: StyleProp<AnimatedViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  tone?: CardTone;
}

const TONE_BORDER: Record<CardTone, string> = {
  default: color.border,
  accent: color.accent,
  positive: color.positive,
  warning: color.warning,
  danger: color.danger,
};

export function Card({ children, style, onPress, onLongPress, tone = 'default' }: CardProps) {
  const base = [styles.card, { borderColor: TONE_BORDER[tone] }, style];
  /**
   * The light along the top edge. A hairline child rather than a border, so it
   * costs no layout and does not push the content down a pixel — see `edgeStyle`.
   */
  const lit = (
    <>
      <View style={edgeStyle} pointerEvents="none" />
      {children}
    </>
  );
  // Animated in both branches, so a card accepts a transition whether or not it
  // is pressable. With no animated style in the array this renders as a plain view.
  if (!onPress && !onLongPress) return <Animated.View style={base}>{lit}</Animated.View>;
  return (
    <Press onPress={onPress} onLongPress={onLongPress} style={base} pressedStyle={styles.pressed} accessibilityRole="button">
      {lit}
    </Press>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.lg,
    // Siblings sit further apart than the rows inside them, so a card reads as one
    // thing rather than as more of the column above it.
    marginBottom: gap.between,
  },
  pressed: { backgroundColor: color.surfaceHigh },
});
