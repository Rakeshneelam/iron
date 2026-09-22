import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, font, hit, space } from '@/theme/tokens';

export interface SectionHeaderProps {
  title: string;
  /** One line of context, so the explanation stops being tacked onto the content. */
  hint?: string;
  /** A text link at the right edge: "See all", "Custom food". */
  action?: { label: string; onPress: () => void; accessibilityLabel?: string };
  right?: ReactNode;
}

/**
 * The small tracked label that opens a group — "This week", "Recent workouts".
 *
 * It is a signpost, not a heading: the card under it carries the content, and a
 * card's own title stays full-strength. Use one only when the group is not already
 * self-evident. The optional action is the group's one way further in.
 */
export function SectionHeader({ title, hint, action, right }: SectionHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {action ? (
          <Pressable
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel ?? action.label}
            // The link is text-sized; the target is not.
            hitSlop={{ top: space.sm, bottom: space.sm, left: space.md, right: space.md }}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.action}>{action.label}</Text>
          </Pressable>
        ) : null}
        {right}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.lg, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, minHeight: hit.default - space.lg },
  title: { ...font.eyebrow, color: color.textFaint, flexShrink: 1 },
  action: { ...font.caption, fontWeight: '600', color: color.accent },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  pressed: { opacity: 0.6 },
});
