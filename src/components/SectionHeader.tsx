import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, font, gap, space } from '@/theme/tokens';

export interface SectionHeaderProps {
  title: string;
  /** One line of context, so the explanation stops being tacked onto the content. */
  hint?: string;
  right?: ReactNode;
}

/**
 * A heading for a group of content.
 *
 * It used to upper-case every title and set it in 12px muted grey with tracked
 * letters. Settings carried twenty of them, so WEIGHT TREND, BREAKFAST and YOUR DATA
 * all arrived at identical weight — which is the same as having no hierarchy, and
 * shouted while saying it.
 *
 * Sentence case at body size in full-strength text reads as what it is: a heading.
 * Use one only when the content below it is not already self-evident — "Breakfast"
 * above a button that says "Add to breakfast" was telling the user nothing twice.
 */
export function SectionHeader({ title, hint, right }: SectionHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.title}>{title}</Text>
        {right}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: gap.section, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  title: { ...font.heading, color: color.text, flexShrink: 1 },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
});
