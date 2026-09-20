import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, PrimaryButton, Screen } from '@/components';
import { setSetting, useSettings } from '@/db/repositories/settings';
import type { ReminderPrefs } from '@/engine/reminders';
import { WEEKDAYS } from '@/features/profile';
import { Row, TimeAdjuster } from '@/features/settings/Row';
import { fmtClockOfDay } from '@/features/settings/time';
import { notificationsAllowed, requestPermissions, rescheduleAll } from '@/services/notifications';
import { color, font, space } from '@/theme/tokens';

const ON_OFF = [
  { label: 'On', value: 1 },
  { label: 'Off', value: 0 },
] as const;

/**
 * Every reminder type on its own switch. None fires in quiet hours, none fires when
 * there is nothing to do, and at most three a day — spam is how reminders get muted.
 */
export default function RemindersScreen() {
  const s = useSettings();
  const r = s.reminders;
  // Reminders default to on, so the permission has to be checked here rather than
  // assumed: without it every switch on this screen is a promise nothing can keep.
  const [denied, setDenied] = useState(false);
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    void notificationsAllowed().then((ok) => setDenied(!ok));
  }, []);

  const ask = () => {
    setAsking(true);
    void requestPermissions()
      .then((granted) => setDenied(!granted))
      .finally(() => setAsking(false));
  };

  const update = <K extends keyof ReminderPrefs>(key: K, patch: Partial<ReminderPrefs[K]>) => {
    setSetting('reminders', { ...r, [key]: { ...r[key], ...patch } });
    // Asked here, with the switch the user just moved to explain it — not on first
    // launch before they have seen the app at all (UX-12). Switching something ON is
    // the only moment the permission means anything.
    if ((patch as { on?: boolean }).on === true && denied) ask();
    void rescheduleAll();
  };
  const onOff = <K extends keyof ReminderPrefs>(key: K) => (
    <ChipRow options={ON_OFF} value={r[key].on ? 1 : 0} onChange={(v) => update(key, { on: v === 1 } as Partial<ReminderPrefs[K]>)} fill={false} />
  );
  const days = WEEKDAYS.filter((d) => s.trainingDays.includes(d.value)).map((d) => d.label).join(', ') || 'none set';

  return (
    <Screen title="Reminders" right={<PrimaryButton label="Done" tone="ghost" onPress={() => router.back()} />}>
      <Text style={styles.quiet}>
        Quiet hours {fmtClockOfDay(s.sleepMinutes)}–{fmtClockOfDay(s.wakeMinutes)} · change them in Settings.
      </Text>
      {denied ? (
        <Card>
          <Text style={styles.denied}>Iron cannot post notifications yet, so these switches have nothing to send.</Text>
          <Text style={styles.hint}>
            If the prompt does not appear, Android has already been answered for Iron — turn notifications on in your
            phone&apos;s settings for Iron.
          </Text>
          <PrimaryButton label={asking ? 'Asking…' : 'Allow notifications'} tone="neutral" disabled={asking} style={styles.gapTop} onPress={ask} />
        </Card>
      ) : null}

      <Card>
        <Row label="Water" hint="Only when you're behind pace; silent when you're ahead. Log +250/+500 or snooze from the notification.">
          {onOff('water')}
        </Row>
        {r.water.on ? (
          <>
            <Text style={styles.label}>At most every</Text>
            <ChipRow
              options={[60, 90, 120, 180].map((m) => ({ label: m < 120 ? `${m} min` : `${m / 60} h`, value: m }))}
              value={r.water.minGapMinutes}
              onChange={(v) => update('water', { minGapMinutes: v })}
            />
          </>
        ) : null}
      </Card>

      <Card>
        <Row label="Workout" hint={`On your training days (${days}), unless you've already trained.`}>{onOff('workout')}</Row>
        {r.workout.on ? (
          <Row label="Time">
            <TimeAdjuster value={r.workout.minutes} min={s.wakeMinutes} max={s.sleepMinutes - 30} onChange={(v) => update('workout', { minutes: v })} />
          </Row>
        ) : null}
        <Row label="Missed workout" hint="The day after a missed training day. Never asks you to double up.">
          {onOff('missedWorkout')}
        </Row>
      </Card>

      <Card>
        <Row label="Morning weigh-in" hint="Shortly after you wake, only if you haven't logged it.">{onOff('weight')}</Row>
        {r.weight.on ? (
          <ChipRow
            options={[
              { label: 'Daily', value: 'daily' },
              { label: 'Training days', value: 'training' },
              { label: 'Weekly', value: 'weekly' },
            ]}
            value={r.weight.frequency}
            onChange={(v) => update('weight', { frequency: v })}
          />
        ) : null}
      </Card>

      <Card>
        <Row label="Measurements" hint="Only when a check-in is due.">{onOff('measurements')}</Row>
        {r.measurements.on ? (
          <>
            <Text style={styles.label}>Day</Text>
            <ChipRow options={WEEKDAYS} value={r.measurements.weekday} onChange={(v) => update('measurements', { weekday: v })} fill={false} />
            <Text style={styles.label}>Every</Text>
            <ChipRow
              options={[1, 2, 4].map((w) => ({ label: w === 1 ? 'week' : `${w} weeks`, value: w }))}
              value={r.measurements.everyWeeks}
              onChange={(v) => update('measurements', { everyWeeks: v })}
            />
          </>
        ) : null}
      </Card>

      <Card>
        <Row label="Weekly summary" hint="Sunday evening: what improved and what slipped.">{onOff('weeklySummary')}</Row>
        <Row label="Evening check-in" hint="Only if something useful is missing today — weight, water, food or a planned workout.">
          {onOff('eveningCheckIn')}
        </Row>
        {r.eveningCheckIn.on ? (
          <Row label="Time">
            <TimeAdjuster value={r.eveningCheckIn.minutes} min={s.wakeMinutes} max={s.sleepMinutes - 15} onChange={(v) => update('eveningCheckIn', { minutes: v })} />
          </Row>
        ) : null}
        <Row label="Rest-day mobility" hint="A gentle 8-minute routine suggestion on non-training days.">{onOff('recovery')}</Row>
      </Card>
      <View style={styles.gap} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  quiet: { ...font.label, color: color.textMuted, marginBottom: space.md },
  label: { ...font.caption, color: color.textMuted, marginTop: space.sm, marginBottom: space.xs },
  denied: { ...font.label, color: color.warning },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  gapTop: { marginTop: space.md },
  gap: { height: space.lg },
});
