import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { selection } from '@/lib/haptics';
import { color, font, hit, radius, space } from '@/theme/tokens';

import { Icon } from './Icon';

/**
 * A card of rows with hairlines between them — the list every screen is built of.
 * Rows own their dividers, so a card never ends or starts on a rule.
 */
export function ListCard({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export interface ListRowProps {
  title: string;
  /** One line under the title, in faint text. */
  sub?: string;
  /** Before the text: an icon, a number, a status ring. */
  left?: ReactNode;
  /** After the text: a value, a pill, a control. */
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Adds the chevron that says "this opens something". Default: when pressable. */
  chevron?: boolean;
  /** Not the first row: draws the hairline above it. */
  divider?: boolean;
  /** Quieter title (an exercise still to come, a link row). */
  tone?: 'default' | 'muted' | 'accent';
  accessibilityLabel?: string;
}

export function ListRow({ title, sub, left, right, onPress, onLongPress, chevron, divider = false, tone = 'default', accessibilityLabel }: ListRowProps) {
  const content = (
    <>
      {left}
      <View style={styles.text}>
        <Text style={[styles.title, tone === 'muted' && styles.muted, tone === 'accent' && styles.accent]} numberOfLines={2}>
          {title}
        </Text>
        {sub ? (
          <Text style={styles.sub} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right}
      {(chevron ?? onPress !== undefined) ? <Icon name="chevronRight" size={18} color={tone === 'accent' ? color.accent : color.textFaint} /> : null}
    </>
  );
  const style = [styles.row, divider && styles.divider];
  if (!onPress && !onLongPress) return <View style={style}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (sub ? `${title}, ${sub}` : title)}
      style={({ pressed }) => [style, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

/** A setting that is on or off, operated where it is read. The platform switch. */
export function ToggleRow({ title, sub, value, onChange, divider }: { title: string; sub?: string; value: boolean; onChange: (v: boolean) => void; divider?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onChange(!value);
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={title}
      accessibilityHint={sub}
      style={[styles.row, divider && styles.divider]}
    >
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          selection();
          onChange(v);
        }}
        trackColor={{ false: color.border, true: color.accent }}
        thumbColor={value ? color.onAccent : color.textMuted}
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hit.gym, paddingVertical: space.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  pressed: { opacity: 0.6 },
  text: { flex: 1, minWidth: 0 },
  title: { ...font.label, fontWeight: '600', color: color.text },
  muted: { color: color.textMuted },
  accent: { color: color.accent },
  sub: { ...font.caption, color: color.textFaint, marginTop: 2 },
});
