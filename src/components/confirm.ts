import { Alert } from 'react-native';

/**
 * A native confirm, reserved for actions that destroy data with no undo (deleting a
 * plan, discarding logged sets). Everything reversible uses toast() + Undo instead.
 */
export function confirm(opts: {
  title: string;
  message?: string;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
  /** An optional third choice, e.g. "Keep sets". */
  alternative?: { label: string; onPress: () => void };
}): void {
  Alert.alert(opts.title, opts.message, [
    { text: 'Back', style: 'cancel' },
    ...(opts.alternative ? [{ text: opts.alternative.label, onPress: opts.alternative.onPress }] : []),
    { text: opts.confirmLabel, style: opts.destructive ? 'destructive' : 'default', onPress: opts.onConfirm },
  ]);
}
