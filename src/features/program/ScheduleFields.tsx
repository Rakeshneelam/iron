import { StyleSheet, Text, View } from 'react-native';

import { Stepper } from '@/components/Stepper';
import { ToggleChips } from '@/components/ToggleChips';
import { setSetting, useSettings } from '@/db/repositories/settings';
import { toggle, WEEKDAYS } from '@/features/profile';
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
      <Field label="Days you can train" hint="Your plan runs in order. Days only set reminders and what counts as planned.">
        <ToggleChips
          options={WEEKDAYS}
          values={s.trainingDays}
          columns={7}
          onToggle={(d) => {
            setSetting('trainingDays', toggle(s.trainingDays, d));
            void rescheduleAll();
          }}
        />
      </Field>
      <Field label="Minutes per session" hint="Sizes new plans and the short-on-time options on Today.">
        <Stepper accessibilityLabel="Minutes per session" suffix="min" value={s.trainingMinutes} step={5} min={15} max={180} onChange={(v) => setSetting('trainingMinutes', v)} />
      </Field>
      {s.trainingDays.length === 0 ? <Text style={styles.warn}>No days chosen — nothing counts as planned, and no workout reminders fire.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md + 2 },
  warn: { ...font.caption, color: color.warning },
});
