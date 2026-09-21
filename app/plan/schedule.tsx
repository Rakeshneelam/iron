import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { Card, PrimaryButton, Screen, SectionHeader, Stepper, ToggleChips } from '@/components';
import { useLive } from '@/db/live';
import { getActiveRoutine, getDays } from '@/db/repositories/program';
import { setSetting, useSettings } from '@/db/repositories/settings';
import { scheduleLabel } from '@/features/program/schedule';
import { toggle, WEEKDAYS } from '@/features/profile';
import { rescheduleAll } from '@/services/notifications';
import { color, font, space } from '@/theme/tokens';

/**
 * Training schedule — the one editor for which weekdays you train on and how long
 * a session usually takes.
 *
 * It lived in Settings under "Training", which is where you file it if you are
 * tidying a menu; it belongs with the plans it schedules. Settings links here
 * rather than keeping a second copy, so there is exactly one weekday editor and
 * editing it updates every summary at once (UX-10).
 *
 * What it deliberately does NOT touch is the rotation. The plan's workouts run in
 * order whatever the calendar says; picking Monday, Wednesday and Friday sets when
 * you intend to train and what reminders fire against, and never reorders or
 * truncates the plan.
 */
export default function ScheduleScreen() {
  const s = useSettings();
  const rotation = useLive(() => {
    const r = getActiveRoutine();
    return r ? getDays(r.id).length : 0;
  }, ['routine', 'routine_day']);

  return (
    <Screen
      title="Training schedule"
      subtitle="When you intend to train. Your plan's order is separate."
      right={<PrimaryButton label="Back" tone="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/program'))} />}
    >
      <SectionHeader title="Days you can train" />
      <Card>
        <ToggleChips
          options={WEEKDAYS}
          values={s.trainingDays}
          onToggle={(d) => {
            setSetting('trainingDays', toggle(s.trainingDays, d));
            void rescheduleAll();
          }}
        />
        <Text style={styles.hint}>
          Reminders fire on these days, and they are what &ldquo;planned this week&rdquo; counts against. Your plan still runs
          in its own order — a four-workout rotation on three days a week simply takes longer to come round.
        </Text>
        <Text style={styles.summary}>{scheduleLabel({ rotation, scheduledDays: s.trainingDays.length })}</Text>
      </Card>

      <SectionHeader title="Typical session" />
      <Card>
        <Stepper
          label="Minutes you usually have"
          suffix="min"
          value={s.trainingMinutes}
          step={5}
          min={15}
          max={180}
          onChange={(v) => setSetting('trainingMinutes', v)}
        />
        <Text style={styles.hint}>Used to size new plans and to work out the short-on-time options on Today.</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { ...font.caption, color: color.textMuted, marginTop: space.md },
  summary: { ...font.label, color: color.text, marginTop: space.md, fontWeight: '600' },
});
