import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius, space } from '@/theme/tokens';

export type CardTone = 'default' | 'accent' | 'positive' | 'warning' | 'danger';

export interface CardProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
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
  if (!onPress && !onLongPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [base, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.lg,
    marginBottom: space.md,
  },
  pressed: { backgroundColor: color.surfaceHigh },
});
