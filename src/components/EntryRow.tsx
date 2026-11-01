import { StyleSheet, Text } from 'react-native';

import { color, font, hit, radius, space } from '@/theme/tokens';

import { Press } from './Press';

/**
 * One logged entry as its own rounded row — a time or a day at the left, the amount
 * at the right — that opens it for editing. `fresh` outlines the row just logged in
 * the tracker's colour.
 */
export function EntryRow({ label, value, onPress, accessibilityLabel, fresh }: { label: string; value: string; onPress: () => void; accessibilityLabel: string; fresh?: string }) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      feedback="highlight"
      style={[styles.row, fresh ? { borderColor: fresh } : null]}
      pressedStyle={styles.pressed}
    >
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.value}>{value}</Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    minHeight: hit.gym,
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
    borderRadius: radius.md + 4,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  pressed: { backgroundColor: color.surfaceHigh },
  label: { ...font.label, color: color.text, flexShrink: 1 },
  value: { ...font.label, color: color.text, fontVariant: ['tabular-nums'] },
});
