import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, font, hit, radius, space } from '@/theme/tokens';

import { Icon, type IconName } from './Icon';

export type IconButtonTone = 'plain' | 'neutral' | 'accent' | 'danger';

export interface IconButtonProps {
  icon: IconName;
  onPress: () => void;
  /** Required: an icon alone says nothing to a screen reader. */
  accessibilityLabel: string;
  /** Optional caption under the icon — for actions whose icon isn't self-evident. */
  label?: string;
  tone?: IconButtonTone;
  size?: 'gym' | 'default';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const BG: Record<IconButtonTone, string> = {
  plain: 'transparent',
  neutral: color.surfaceHigh,
  accent: color.accent,
  danger: color.danger,
};

export function IconButton({ icon, onPress, accessibilityLabel, label, tone = 'plain', size = 'default', disabled, style }: IconButtonProps) {
  const box = hit[size];
  const fg = tone === 'accent' || tone === 'danger' ? color.onAccent : color.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={space.xs}
      style={({ pressed }) => [styles.wrap, disabled && styles.disabled, pressed && styles.pressed, style]}
    >
      <View style={[styles.box, { width: box, height: box, backgroundColor: BG[tone] }]}>
        <Icon name={icon} size={size === 'gym' ? 26 : 22} color={fg} />
      </View>
      {label ? (
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.xs },
  box: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  label: { ...font.caption, color: color.textMuted },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.35 },
});
