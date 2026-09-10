import type { BarTone } from '@/components/Bar';
import { VOLUME_LANDMARKS, volumeStatus } from '@/engine/progression';

export const STATUS_TONE: Record<ReturnType<typeof volumeStatus>, BarTone> = {
  under: 'muted',
  optimal: 'positive',
  high: 'warning',
  over: 'danger',
};

/** Planned weekly hard sets per muscle, against MEV / MAV / MRV. */
export function volumeRows(weekly: Record<string, number>) {
  return Object.entries(VOLUME_LANDMARKS).map(([muscle, l]) => {
    const sets = weekly[muscle] ?? 0;
    return { muscle, sets, status: volumeStatus(muscle, sets), ...l };
  });
}
