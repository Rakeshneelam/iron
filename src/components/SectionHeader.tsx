import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, font, hit, space } from '@/theme/tokens';

import { Press } from './Press';

export interface SectionHeaderProps {
  title: string;
  /** One line of context, so the explanation stops being tacked onto the content. */
  hint?: string;
  /** A text link at the right edge: "See all", "Custom food". */
  action?: { label: string; onPress: () => void; accessibilityLabel?: string };
  right?: ReactNode;
}

/**
 * The small label that opens a group — "This week", "Recent workouts".
 *
 * It is a signpost, not a heading: the content under it carries the meaning, and a
 * card's own title stays full-strength. Use one only when the group is not already
 * self-evident. The optional action is the group's one way further in, and a
 * hairline leads from the label to it, the way a drawing leads a callout to what it
 * names — so "See all" reads as belonging to this group and not the next.
 */
export function SectionHeader({ title, hint, action, right }: SectionHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.leader} />
        {action ? (
          <Press
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel ?? action.label}
            // The link is text-sized; the target is not.
            hitSlop={{ top: space.sm, bottom: space.sm, left: space.md, right: space.md }}
          >
            <Text style={styles.action}>{action.label}</Text>
          </Press>
        ) : null}
        {right}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.lg, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hit.default - space.lg },
  title: { ...font.eyebrow, fontSize: 13, color: color.textMuted, flexShrink: 1 },
  leader: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: color.border },
  action: { ...font.caption, fontWeight: '600', color: color.text, textDecorationLine: 'underline' },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
});
