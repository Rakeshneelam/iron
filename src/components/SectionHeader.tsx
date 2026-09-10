import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, font, space } from '@/theme/tokens';

export interface SectionHeaderProps {
  title: string;
  right?: ReactNode;
}

export function SectionHeader({ title, right }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title.toUpperCase()}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  title: { ...font.caption, color: color.textMuted, letterSpacing: 1 },
});
