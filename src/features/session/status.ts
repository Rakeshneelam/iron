import type { PillTone } from '@/components/Pill';
import type { SessionStatus } from '@/db/repositories/sessions';

export const STATUS_LABEL: Record<SessionStatus, string> = {
  active: 'In progress',
  completed: 'Completed',
  partial: 'Partial',
  skipped: 'Missed',
  rest: 'Rest day',
  cancelled: 'Cancelled',
};

/** Neither a missed day nor a rest day is a failure, so neither gets a failure colour. */
/**
 * Finishing a workout is the normal case, so it is quiet; a history of green
 * "Completed" pills is a celebration of every ordinary Tuesday. Heat marks the one
 * workout still open. Cancelled is worth a look, never an alarm.
 */
export const STATUS_TONE: Record<SessionStatus, PillTone> = {
  active: 'accent',
  completed: 'muted',
  partial: 'muted',
  skipped: 'muted',
  rest: 'muted',
  cancelled: 'warning',
};
