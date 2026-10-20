import { Alert } from 'react-native';

/**
 * A native confirm, reserved for actions that destroy data with no undo (deleting a
 * plan, discarding logged sets). Everything reversible uses toast() + Undo instead.
 *
 * The first button is always the way out, and it is the one the OS treats as
 * `cancel` — tapping outside the dialog or pressing Back picks it. `keepLabel`
 * names it when "Back" is the wrong word: on a dialog titled "Cancel this
 * workout?", "Back" and "Cancel" both mean cancel and neither says which.
 */
export function confirm(opts: {
  title: string;
  message?: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** Overrides the dismissing button's label. Default 'Back'. */
  keepLabel?: string;
  destructive?: boolean;
  /** An optional third choice, e.g. "Keep sets". */
  alternative?: { label: string; onPress: () => void };
}): void {
  Alert.alert(opts.title, opts.message, [
    { text: opts.keepLabel ?? 'Back', style: 'cancel' },
    ...(opts.alternative ? [{ text: opts.alternative.label, onPress: opts.alternative.onPress }] : []),
    { text: opts.confirmLabel, style: opts.destructive ? 'destructive' : 'default', onPress: opts.onConfirm },
  ]);
}
