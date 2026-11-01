import { StyleSheet, Text, View } from 'react-native';

import { Stepper } from '@/components/Stepper';
import { WeekdayPicker } from '@/components/WeekdayPicker';
import { setSetting, useSettings } from '@/db/repositories/settings';
import { toggle } from '@/features/profile';
import { Field } from '@/features/settings/ProfileFields';
import { rescheduleAll } from '@/services/notifications';
import { color, font, space } from '@/theme/tokens';

/**
 * The one editor for which weekdays you train on and how long a session usually
 * takes. Plans → Training schedule and Settings → Training both render this, so
 * there is one implementation and editing either updates every summary (UX-10).
 *
 * It deliberately does not touch the rotation: a plan's workouts run in order
 * whatever the calendar says. These days set when reminders fire and what
 * "planned this week" counts against.
 */
export function ScheduleFields() {
  const s = useSettings();
  return (
    <View style={styles.stack}>
      <Field label="Training days">
        <WeekdayPicker
          values={s.trainingDays}
          onToggle={(d) => {
            setSetting('trainingDays', toggle(s.trainingDays, d));
            void rescheduleAll();
          }}
        />
      </Field>
      <Field label="Minutes per session">
        <Stepper accessibilityLabel="Minutes per session" suffix="min" value={s.trainingMinutes} step={5} min={15} max={180} onChange={(v) => setSetting('trainingMinutes', v)} />
      </Field>
      {s.trainingDays.length === 0 ? <Text style={styles.warn}>No days chosen, so no workout reminders.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md + 2 },
  warn: { ...font.caption, color: color.warning },
});
