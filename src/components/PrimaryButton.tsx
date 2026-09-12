import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, font, hit, radius, space } from '@/theme/tokens';

/**
 * Three weights, and they have to look like three weights.
 *
 *   accent  — the one thing to do here. Filled.
 *   neutral — a real alternative. Filled, quieter.
 *   ghost   — dismiss, go back, show more. Text only.
 *
 * Ghost used to carry a 1px border, which on a near-black background made it read
 * as another filled button: a screen with one accent and three outlined buttons has
 * no hierarchy, it has a menu. Dropping the border is what separates "the other
 * option" from "never mind". The tap target is unchanged.
 */
export type ButtonTone = 'accent' | 'neutral' | 'danger' | 'ghost';

export interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  tone?: ButtonTone;
  size?: 'gym' | 'default';
  disabled?: boolean;
  icon?: ReactNode;
  /** Light haptic on press. Commits (log set) fire their own, stronger one. */
  haptic?: boolean;
  /** Overrides the label for screen readers when the label alone is ambiguous. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const BG: Record<ButtonTone, string> = {
  accent: color.accent,
  neutral: color.surfaceHigh,
  danger: color.danger,
  ghost: 'transparent',
};

export function PrimaryButton({
  label,
  onPress,
  onLongPress,
  tone = 'accent',
  size = 'default',
  disabled = false,
  icon,
  haptic = false,
  style,
  accessibilityLabel,
}: PrimaryButtonProps) {
  const fg = tone === 'neutral' || tone === 'ghost' ? color.text : color.onAccent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.base,
        { minHeight: hit[size], backgroundColor: BG[tone] },
        tone === 'ghost' && styles.ghost,
        tone === 'neutral' && styles.neutral,
        pressed && (tone === 'accent' ? { backgroundColor: color.accentPressed } : styles.pressed),
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.row}>
        {icon}
        <Text style={[size === 'gym' ? styles.labelGym : styles.label, { color: fg }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: { paddingHorizontal: space.sm },
  // A hairline, not a frame: enough to read as tappable, not enough to compete.
  neutral: { borderWidth: 1, borderColor: color.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: { ...font.label },
  labelGym: { ...font.heading },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
});
