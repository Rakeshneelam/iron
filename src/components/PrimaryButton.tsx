import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { impact } from '@/lib/haptics';
import { color, font, hit, radius, space } from '@/theme/tokens';

/**
 * Three weights, and they have to look like three weights.
 *
 *   accent  — the one thing to do here. Filled.
 *   neutral — a real alternative. An outline in full-strength text.
 *   ghost   — dismiss, go back, show more. Muted text, no frame.
 *
 * `danger` fills for the final, irreversible step; `dangerOutline` is the way to
 * that step ("Delete day"), which should read as serious without shouting.
 */
export type ButtonTone = 'accent' | 'neutral' | 'danger' | 'dangerOutline' | 'ghost';

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
  neutral: 'transparent',
  danger: color.danger,
  dangerOutline: 'transparent',
  ghost: 'transparent',
};

const FG: Record<ButtonTone, string> = {
  accent: color.onAccent,
  neutral: color.text,
  danger: color.onAccent,
  dangerOutline: color.danger,
  ghost: color.textMuted,
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
  const fg = FG[tone];
  const filled = tone === 'accent' || tone === 'danger';
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
        tone === 'dangerOutline' && styles.dangerOutline,
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
        <Text style={[size === 'gym' ? styles.labelGym : styles.label, filled && styles.bold, { color: fg }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.button,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: { paddingHorizontal: space.sm },
  // A hairline, not a frame: enough to read as tappable, not enough to compete.
  neutral: { borderWidth: 1, borderColor: color.border },
  dangerOutline: { borderWidth: 1, borderColor: color.danger },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, flexShrink: 1 },
  // 16px, not 15: an action label has to survive being read at arm's length.
  label: { ...font.body, fontWeight: '600' },
  labelGym: { ...font.heading },
  bold: { fontWeight: '700' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
});
