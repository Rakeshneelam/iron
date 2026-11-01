import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import type { AnimatedViewStyle } from '@/theme/curves';
import { color, gap, material, radius, space } from '@/theme/tokens';

import { Press } from './Press';

/**
 * A rounded slab. `default` is a dark card; the tracker tones are filled tiles in
 * that tracker's colour with near-black ink; the state tones are a dark card with a
 * coloured outline, for things that need noticing without shouting.
 */
export type CardTone = 'default' | 'volt' | 'sky' | 'peach' | 'lav' | 'accent' | 'positive' | 'warning' | 'danger';

export interface CardProps {
  children?: ReactNode;
  style?: StyleProp<AnimatedViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  tone?: CardTone;
  accessibilityLabel?: string;
  /**
   * Layout for the touch target of a pressable card — `flex: 1` in a row. The box
   * itself sits inside it, so a row's flex has to land here or the card shrinks to
   * its content.
   */
  touchStyle?: StyleProp<ViewStyle>;
}

const FILL: Partial<Record<CardTone, string>> = { volt: color.accent, sky: color.cold, peach: color.peach, lav: color.lav };
const GLOW: Partial<Record<CardTone, string>> = { volt: material.glow.volt, sky: material.glow.sky, peach: material.glow.peach, lav: material.glow.lav };
const OUTLINE: Partial<Record<CardTone, string>> = { accent: color.accent, positive: color.positive, warning: color.warning, danger: color.danger };

/** True when a card is a filled tile, so whatever sits on it should use `onTile` ink. */
export const isTile = (tone: CardTone | undefined) => tone !== undefined && FILL[tone] !== undefined;

export function Card({ children, style, onPress, onLongPress, tone = 'default', accessibilityLabel, touchStyle }: CardProps) {
  const base = [
    styles.card,
    FILL[tone] ? { backgroundColor: FILL[tone], boxShadow: GLOW[tone] } : null,
    OUTLINE[tone] ? { borderWidth: 1.5, borderColor: OUTLINE[tone] } : null,
    style,
  ];
  if (!onPress && !onLongPress) return <Animated.View style={base}>{children}</Animated.View>;
  return (
    <Press onPress={onPress} onLongPress={onLongPress} style={base} touchStyle={touchStyle} pressedStyle={FILL[tone] ? styles.pressedTile : styles.pressed} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {children}
    </Press>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.lg + 2,
    marginBottom: gap.between,
  },
  pressed: { backgroundColor: color.surfaceHigh },
  pressedTile: { opacity: 0.88 },
});
