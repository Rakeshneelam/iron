import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { impact } from '@/lib/haptics';
import type { AnimatedViewStyle } from '@/theme/curves';
import { color, family, hit, material, radius, space } from '@/theme/tokens';

import { Press } from './Press';

/**
 * Every button is a pill.
 *
 *   accent        — the one thing to do here. Volt, near-black ink.
 *   neutral       — a real alternative. A raised dark pill.
 *   ghost         — dismiss, go back, show more. Text only.
 *   danger        — the final, irreversible step. Filled red.
 *   dangerOutline — the way to that step: a red outline.
 *
 * A big accent button carries its icon in a dark circle at the right end — the
 * "go" the whole pill points at.
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
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const BG: Record<ButtonTone, string> = {
  accent: color.accentFill,
  neutral: color.surfaceHigh,
  danger: color.dangerFill,
  dangerOutline: 'transparent',
  ghost: 'transparent',
};

const FG: Record<ButtonTone, string> = {
  accent: color.onAccent,
  neutral: color.text,
  danger: color.onDanger,
  dangerOutline: color.danger,
  ghost: color.textMuted,
};

const HELD: Record<ButtonTone, AnimatedViewStyle> = {
  accent: { backgroundColor: color.accentFillPressed },
  danger: { backgroundColor: color.dangerPressed },
  neutral: { backgroundColor: color.border },
  dangerOutline: { backgroundColor: color.surfaceHigh },
  ghost: { backgroundColor: color.surface },
};

export function PrimaryButton({ label, onPress, onLongPress, tone = 'accent', size = 'default', disabled = false, icon, haptic = false, style, accessibilityLabel }: PrimaryButtonProps) {
  const fg = FG[tone];
  const big = size === 'gym';
  // The big accent pill: label at the left, the icon in a dark "go" circle at the right.
  const go = big && tone === 'accent' && icon !== undefined;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        if (haptic) impact();
        onPress();
      }}
      onLongPress={onLongPress}
      touchStyle={style}
      style={[
        styles.base,
        { minHeight: big ? hit.gym + 8 : hit.default, backgroundColor: BG[tone] },
        go && styles.goBase,
        tone === 'dangerOutline' && styles.dangerOutline,
        tone === 'ghost' && styles.ghost,
        tone === 'accent' && !disabled && styles.hot,
        disabled && styles.disabled,
      ]}
      pressedStyle={HELD[tone]}
    >
      {go ? (
        <>
          <Text style={[styles.label, styles.labelGym, { color: fg }]} numberOfLines={2}>
            {label}
          </Text>
          {/* Callers draw the icon for a volt ground; on the dark circle it has to be volt itself. */}
          <View style={styles.goCircle}>{isValidElement(icon) ? cloneElement(icon as ReactElement<{ color?: string }>, { color: color.accent }) : icon}</View>
        </>
      ) : (
        <View style={styles.row}>
          {icon}
          <Text style={[styles.label, big && styles.labelGym, { color: fg }]} numberOfLines={2}>
            {label}
          </Text>
        </View>
      )}
    </Press>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.button, paddingHorizontal: space.xl, paddingVertical: space.xs, alignItems: 'center', justifyContent: 'center' },
  goBase: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: space.xl + 2, paddingRight: 6 },
  goCircle: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: color.onAccent, alignItems: 'center', justifyContent: 'center' },
  ghost: { paddingHorizontal: space.md },
  dangerOutline: { borderWidth: 1.5, borderColor: color.danger },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, flexShrink: 1 },
  label: { fontFamily: family.text, fontSize: 15, lineHeight: 20, fontWeight: '800', letterSpacing: -0.1 },
  labelGym: { fontSize: 17, lineHeight: 22, flexShrink: 1 },
  hot: { boxShadow: material.heat },
  disabled: { opacity: 0.4 },
});
