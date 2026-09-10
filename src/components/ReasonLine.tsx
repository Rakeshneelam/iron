import { StyleSheet, Text, View } from 'react-native';

import { color, font, radius, space } from '@/theme/tokens';

export interface ReasonLineProps {
  /** The engine's plain-English reason. Every prescription shows one (AGENTS.md §1.5). */
  text: string;
}

export function ReasonLine({ text }: ReasonLineProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rule} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  rule: { width: 3, borderRadius: radius.sm, backgroundColor: color.accent },
  text: { ...font.label, color: color.textMuted, flex: 1 },
});
