/**
 * Cancelling a workout, from wherever the user asks for it.
 *
 * Both entry points — the Resume card on Today and the session screen's menu —
 * used to compute "is there anything to lose?" themselves, and both counted only
 * working sets. A workout where the warm-up was logged and nothing else therefore
 * took the silent path and was deleted without a word, even though the repository
 * (`cancelSession` -> `loggedSetCount`) has always counted every row. `saved` here
 * is that same count: every persisted set, warm-ups included.
 */
import { confirm } from '@/components/confirm';
import { toast } from '@/components/Toast';
import { cancelSession } from '@/db/repositories/sessions';
import { cancelRest } from '@/services/restTimer';

/**
 * @param saved every persisted set for the session, warm-ups included.
 * @param after runs once the session is closed — navigation, usually.
 *
 * It always asks. With nothing logged it used to cancel on the first tap, on the
 * grounds that there was no data to lose — but "Cancel workout" sits next to
 * "Finish workout" in a sheet, and on a phone held one-handed in a gym the cost
 * of a mis-tap was the whole session gone with no dialog and no undo. The second
 * tap is cheap; a workout you have to start again is not.
 *
 * Three answers when there are sets, two when there are none, and the first
 * button is always the way back out.
 */
export function cancelWorkout(sessionId: string, saved: number, after?: () => void): void {
  const leave = (keep: boolean) => {
    void cancelRest();
    // Cancelled, never completed: the day does not count and the cycle does not advance.
    cancelSession(sessionId, keep);
    toast(keep ? 'Workout cancelled — logged sets kept' : 'Workout discarded');
    after?.();
  };
  if (saved === 0) {
    confirm({
      title: 'Cancel this workout?',
      message: 'Nothing is logged yet, so nothing will be lost. The day will not count as trained.',
      keepLabel: 'Keep workout',
      confirmLabel: 'Confirm cancellation',
      destructive: true,
      onConfirm: () => leave(false),
    });
    return;
  }
  confirm({
    title: 'Cancel this workout?',
    message: `You logged ${saved} ${saved === 1 ? 'set' : 'sets'}, warm-ups included. Keep them in history (the day won't count as done), or delete everything. This cannot be undone.`,
    keepLabel: 'Keep workout',
    confirmLabel: 'Delete all',
    destructive: true,
    onConfirm: () => leave(false),
    alternative: { label: 'Keep sets', onPress: () => leave(true) },
  });
}
