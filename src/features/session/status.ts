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
export const STATUS_TONE: Record<SessionStatus, PillTone> = {
  active: 'accent',
  completed: 'positive',
  partial: 'accent',
  skipped: 'muted',
  rest: 'muted',
  cancelled: 'warning',
};
