import { Screen } from '@/components';
import { useLive } from '@/db/live';
import { getActiveRoutine, getDays } from '@/db/repositories/program';
import { useSettings } from '@/db/repositories/settings';
import { scheduleLabel } from '@/features/program/schedule';
import { ScheduleFields } from '@/features/program/ScheduleFields';

/**
 * Training schedule, from Plans. The editor itself is ScheduleFields, which
 * Settings → Training renders too — one implementation, two ways in (UX-10).
 */
export default function ScheduleScreen() {
  const s = useSettings();
  const rotation = useLive(() => {
    const r = getActiveRoutine();
    return r ? getDays(r.id).length : 0;
  }, ['routine', 'routine_day']);

  return (
    <Screen title="Training schedule" subtitle={scheduleLabel({ rotation, scheduledDays: s.trainingDays.length })} back>
      <ScheduleFields />
    </Screen>
  );
}
