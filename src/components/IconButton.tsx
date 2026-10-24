import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, font, hit, radius, space } from '@/theme/tokens';

import { Icon, type IconName } from './Icon';
import { Press } from './Press';

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

/** Round buttons, always: a dark disc, a raised disc, a volt disc, or a red one. */
const BG: Record<IconButtonTone, string> = {
  plain: color.surface,
  neutral: color.surfaceHigh,
  accent: color.accent,
  danger: color.dangerFill,
};

export function IconButton({ icon, onPress, accessibilityLabel, label, tone = 'plain', size = 'default', disabled, style }: IconButtonProps) {
  const box = size === 'gym' ? hit.gym : 46;
  const fg = tone === 'accent' ? color.onAccent : tone === 'danger' ? color.onDanger : color.text;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={space.xs}
      touchStyle={style}
      style={[styles.wrap, disabled && styles.disabled]}
    >
      <View style={[styles.box, { width: box, height: box, backgroundColor: BG[tone] }]}>
        <Icon name={icon} size={size === 'gym' ? 24 : 20} color={fg} strokeWidth={2.2} />
      </View>
      {label ? (
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </Press>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.xs },
  box: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  label: { ...font.caption, fontWeight: '600', color: color.textMuted },
  disabled: { opacity: 0.35 },
});
