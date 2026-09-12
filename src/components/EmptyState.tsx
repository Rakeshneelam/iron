import { StyleSheet, Text, View } from 'react-native';

import { color, font, space } from '@/theme/tokens';

import { PrimaryButton } from './PrimaryButton';

export interface EmptyStateProps {
  /** What to do next. Never an illustration, never guilt. */
  message: string;
  /** Why it is worth doing, if that is not obvious from the message. */
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * An empty section is an invitation, so the invitation is the content.
 *
 * The message used to be muted grey — de-emphasising the only thing on the screen,
 * which is backwards when a new install is nothing but empty states. It reads at
 * full strength now, with the reasoning underneath it rather than crammed into the
 * same sentence behind a dash.
 */
export function EmptyState({ message, hint, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.text}>
        <Text style={styles.message}>{message}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {actionLabel && onAction ? <PrimaryButton label={actionLabel} onPress={onAction} tone="neutral" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: space.lg, gap: space.lg },
  text: { gap: space.xs },
  message: { ...font.body, color: color.text },
  hint: { ...font.caption, color: color.textMuted },
});
