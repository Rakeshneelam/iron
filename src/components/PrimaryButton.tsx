import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { impact } from '@/lib/haptics';
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
  // accentFill, not accent: white on #E8552E measures 3.64 : 1 (UX-11).
  accent: color.accentFill,
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
        if (haptic) impact();
        onPress();
      }}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.base,
        { minHeight: hit[size], backgroundColor: BG[tone] },
        tone === 'ghost' && styles.ghost,
        tone === 'neutral' && styles.neutral,
        pressed && (tone === 'accent' ? { backgroundColor: color.accentFillPressed } : styles.pressed),
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.row}>
        {icon}
        {/*
          Two lines rather than an ellipsis. numberOfLines={1} turned "Replace
          everything with this backup" into "Replace everything with th…" at large
          text sizes — a destructive button whose label you cannot read (UX-11).
        */}
        <Text style={[size === 'gym' ? styles.labelGym : styles.label, { color: fg }]} numberOfLines={2}>
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
    paddingVertical: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: { paddingHorizontal: space.sm },
  // A hairline, not a frame: enough to read as tappable, not enough to compete.
  neutral: { borderWidth: 1, borderColor: color.border },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, flexShrink: 1 },
  // 16px, not 15: an action label has to survive being read at arm's length.
  label: { ...font.body, fontWeight: '600' },
  labelGym: { ...font.heading },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
});
