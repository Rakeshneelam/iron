import type { PillTone } from '@/components/Pill';
import type { SessionStatus } from '@/db/repositories/sessions';

export const STATUS_LABEL: Record<SessionStatus, string> = {
  active: 'In progress',
  completed: 'Completed',
  partial: 'Partial',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
};

/** Skipped is neutral, never a failure colour. */
export const STATUS_TONE: Record<SessionStatus, PillTone> = {
  active: 'accent',
  completed: 'positive',
  partial: 'accent',
  skipped: 'muted',
  cancelled: 'warning',
};
