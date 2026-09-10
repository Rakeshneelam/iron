import { StyleSheet, Text, View } from 'react-native';

import { color, font, space } from '@/theme/tokens';

import { PrimaryButton } from './PrimaryButton';

export interface EmptyStateProps {
  /** One sentence saying what to do. Never an illustration, never guilt. */
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? <PrimaryButton label={actionLabel} onPress={onAction} tone="neutral" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: space.xl, gap: space.lg },
  message: { ...font.body, color: color.textMuted },
});
