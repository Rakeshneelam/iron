/**
 * The five parts of Settings: Profile · Training · Workout · Alerts · Data.
 *
 * They used to be five pages behind a menu of six rows; they are tabs of one
 * screen now, so the part you came for is one tap away and the others stay in
 * view. Every control here writes straight to settings — there is no Save.
 * Only settings that exist are drawn: a switch that changes nothing is a lie.
 */
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, IconButton, ListCard, ListRow, PrimaryButton, SectionHeader, Sheet, ToggleChips, ToggleRow } from '@/components';
import { CATALOG_BY_ID } from '@/data/catalog';
import { recoveryPhrase } from '@/db/client';
import { useLive } from '@/db/live';
import { wipeAllData } from '@/db/repositories/admin';
import { getActiveRoutine } from '@/db/repositories/program';
import { countFinishedWorkouts } from '@/db/repositories/progress';
import { setSetting, useSettings } from '@/db/repositories/settings';
import type { ReminderPrefs } from '@/engine/reminders';
import { FoodTargetSheet } from '@/features/food/TargetSheet';
import { computeTargets } from '@/features/food/targets';
import { GOAL_OPTIONS, LEVEL_OPTIONS, LIMITATION_OPTIONS, PRESET_OPTIONS, toggle, WEEKDAYS } from '@/features/profile';
import { ScheduleFields } from '@/features/program/ScheduleFields';
import { MODE_OPTIONS } from '@/features/warmup/labels';
import { WaterTargetSheet } from '@/features/water/TargetSheet';
import { todayISO } from '@/lib/date';
import { kcal, ml } from '@/lib/format';
import { backupNow, lastBackupAt } from '@/services/backup';
import { connect, currentAccount, disconnect, isConfigured } from '@/services/drive';
import { exportAll } from '@/services/export';
import { hydrationTarget } from '@/services/hydration';
import { notificationsAllowed, openBatteryOptimisationSettings, requestPermissions, rescheduleAll } from '@/services/notifications';
import { color, font, radius, space } from '@/theme/tokens';

import { Field, ProfileFields } from './ProfileFields';
import { TimeAdjuster } from './Row';
import { fmtClockOfDay } from './time';

/* ================================ Profile ================================= */

export function ProfileTab() {
  const t = useLive(() => computeTargets(todayISO()), ['meal_log', 'food', 'recipe', 'recipe_item', 'weigh_in', 'setting', 'session']);
  const water = useLive(() => hydrationTarget(), ['setting', 'weigh_in', 'session']);
  const s = useSettings();
  const [sheet, setSheet] = useState<'food' | 'water' | null>(null);

  return (
    <>
      <ProfileFields />
      <SectionHeader title="Daily targets" hint="Automatic targets show their working. Tap one to set your own." />
      <ListCard>
        <ListRow title="Calories" sub={s.manualKcal !== null ? 'Your own number' : t.auto.note} right={<Text style={styles.value}>{kcal(t.kcal)}</Text>} onPress={() => setSheet('food')} />
        <ListRow divider title="Protein" sub={s.manualProteinG !== null ? 'Your own number' : 'Worked out from your body weight and goal'} right={<Text style={styles.value}>{t.proteinG} g</Text>} onPress={() => setSheet('food')} />
        <ListRow divider title="Water" sub={s.hydrationOverrideMl !== null ? 'Your own number' : water.breakdown} right={<Text style={styles.value}>{ml(water.ml)}</Text>} onPress={() => setSheet('water')} />
      </ListCard>
      <FoodTargetSheet visible={sheet === 'food'} onClose={() => setSheet(null)} />
      <WaterTargetSheet visible={sheet === 'water'} onClose={() => setSheet(null)} />
    </>
  );
}

/* ================================ Training ================================ */

export function TrainingTab() {
  const s = useSettings();
  const plan = useLive(() => getActiveRoutine()?.name ?? null, ['routine']);
  return (
    <View style={styles.stack}>
      <ListCard style={styles.flush}>
        <ListRow
          title="Current plan"
          sub={plan ? `${plan} · edit days and exercises in Plans` : 'None yet — pick one in Plans'}
          chevron={false}
          right={<Text style={styles.link}>Change</Text>}
          onPress={() => router.push('/program')}
        />
      </ListCard>
      <Field label="Main goal" hint="What new plans and exercise swaps are built for.">
        <ChipRow options={GOAL_OPTIONS} value={s.goalFocus} onChange={(v) => setSetting('goalFocus', v)} columns={3} />
      </Field>
      <Field label="Lifting experience">
        <ChipRow options={LEVEL_OPTIONS} value={s.experience} onChange={(v) => setSetting('experience', v)} columns={3} />
      </Field>
      <ScheduleFields />
      <Field label="Where do you train?">
        <ChipRow options={PRESET_OPTIONS} value={s.equipmentPreset} onChange={(v) => setSetting('equipmentPreset', v)} columns={3} />
      </Field>
      <ListCard style={styles.flush}>
        <ListRow
          title="Equipment"
          sub={s.tools.length ? `${s.tools.length} chosen, plus your plates and dumbbells` : 'What you can load, down to the plates'}
          onPress={() => router.push('/settings/equipment')}
        />
      </ListCard>
      <Field label="Go easy on" hint="Skips exercises that load these areas in swaps and new plans. Not medical advice.">
        <ToggleChips options={LIMITATION_OPTIONS} values={s.limitations} onToggle={(v) => setSetting('limitations', toggle(s.limitations, v))} columns={3} />
      </Field>
      <Field label="Exercises you’d rather not do">
        {s.disliked.length === 0 ? (
          <Text style={styles.hint}>None. Mark one from its guide in the exercise library.</Text>
        ) : (
          <ListCard style={styles.flush}>
            {s.disliked.map((id, i) => (
              <ListRow
                key={id}
                divider={i > 0}
                title={CATALOG_BY_ID.get(id)?.name ?? id}
                right={<IconButton icon="close" accessibilityLabel={`Allow ${CATALOG_BY_ID.get(id)?.name ?? id} again`} onPress={() => setSetting('disliked', s.disliked.filter((x) => x !== id))} />}
              />
            ))}
          </ListCard>
        )}
      </Field>
    </View>
  );
}

/* ================================ Workout ================================= */

export function WorkoutTab() {
  const s = useSettings();
  return (
    <>
      <SectionHeader title="Rest timer" />
      <ListCard>
        <ToggleRow title="Start rest after each set" sub="Runs in the row above Log set. It also has its own switch there." value={s.restTimerAutoStart} onChange={(v) => setSetting('restTimerAutoStart', v)} />
        <ToggleRow divider title="Haptics" sub="A buzz when a set logs, a number steps or rest ends." value={s.hapticsEnabled} onChange={(v) => setSetting('hapticsEnabled', v)} />
      </ListCard>
      <SectionHeader title="Warm-up" hint="What a workout offers before the first set. You can change it there too." />
      <ChipRow options={MODE_OPTIONS} value={s.warmupMode} onChange={(v) => setSetting('warmupMode', v)} />
      <SectionHeader title="Screen" />
      <ListCard>
        {/* Not a switch: the screen always stays on in a workout (AGENTS §7). */}
        <ListRow title="Screen stays on while lifting" sub="Always, during a workout — and only then." chevron={false} />
        <ListRow
          divider
          title="Battery optimisation"
          sub="The rest timer and reminders need Iron exempt to fire with the screen off."
          onPress={() => void openBatteryOptimisationSettings()}
        />
      </ListCard>
    </>
  );
}

/* ================================= Alerts ================================= */

const GAPS = [60, 90, 120, 180].map((m) => ({ label: m < 120 ? `${m} min` : `${m / 60} h`, value: m }));
const WEIGH = [
  { label: 'Daily', value: 'daily' as const },
  { label: 'Training days', value: 'training' as const },
  { label: 'Weekly', value: 'weekly' as const },
];
const EVERY = [1, 2, 4].map((w) => ({ label: w === 1 ? 'Every week' : `Every ${w} weeks`, value: w }));

/**
 * Every reminder type on its own switch. None fires in quiet hours, none fires when
 * there is nothing to do, and at most three a day — spam is how reminders get muted.
 */
export function AlertsTab() {
  const s = useSettings();
  const r = s.reminders;
  // Reminders default to on, so the permission is checked here rather than
  // assumed: without it every switch below is a promise nothing can keep.
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
    // Asked with the switch the user just moved to explain it, not on first
    // launch (UX-12). Switching something ON is the only moment it means anything.
    if ((patch as { on?: boolean }).on === true && denied) ask();
    void rescheduleAll();
  };
  const on = <K extends keyof ReminderPrefs>(key: K) => (v: boolean) => update(key, { on: v } as Partial<ReminderPrefs[K]>);
  const days = WEEKDAYS.filter((d) => s.trainingDays.includes(d.value)).map((d) => d.label).join(', ') || 'none chosen';

  return (
    <>
      <Text style={styles.lead}>Reminders are scheduled on this phone. Nothing is sent from a server, none fires in quiet hours, and at most three a day.</Text>
      {denied ? (
        <Card tone="warning">
          <Text style={styles.warn}>Iron cannot post notifications yet, so these switches have nothing to send.</Text>
          <Text style={styles.hint}>If no prompt appears, Android has already been answered for Iron — turn notifications on for Iron in your phone&apos;s settings.</Text>
          <PrimaryButton label={asking ? 'Asking…' : 'Allow notifications'} tone="neutral" disabled={asking} style={styles.gapTop} onPress={ask} />
        </Card>
      ) : null}

      <ListCard>
        <ToggleRow title="Workout days" sub={`On your training days (${days}), unless you've already trained.`} value={r.workout.on} onChange={on('workout')} />
        {r.workout.on ? (
          <View style={[styles.sub, styles.divider]}>
            <Text style={styles.subLabel}>Time</Text>
            <TimeAdjuster value={r.workout.minutes} min={s.wakeMinutes} max={s.sleepMinutes - 30} onChange={(v) => update('workout', { minutes: v })} />
          </View>
        ) : null}
        <ToggleRow divider title="Missed workout" sub="The day after a missed training day. Never asks you to double up." value={r.missedWorkout.on} onChange={on('missedWorkout')} />
      </ListCard>

      <ListCard>
        <ToggleRow title="Morning weigh-in" sub="Shortly after you wake, only if you haven't logged it." value={r.weight.on} onChange={on('weight')} />
        {r.weight.on ? (
          <View style={[styles.sub, styles.divider]}>
            <ChipRow options={WEIGH} value={r.weight.frequency} onChange={(v) => update('weight', { frequency: v })} />
          </View>
        ) : null}
      </ListCard>

      <ListCard>
        <ToggleRow title="Water" sub="Only when you're behind pace; silent when you're ahead." value={r.water.on} onChange={on('water')} />
        {r.water.on ? (
          <View style={[styles.sub, styles.divider]}>
            <Text style={styles.subLabel}>At most every</Text>
            <ChipRow options={GAPS} value={r.water.minGapMinutes} onChange={(v) => update('water', { minGapMinutes: v })} />
          </View>
        ) : null}
      </ListCard>

      <ListCard>
        <ToggleRow title="Measurements" sub="Only when a check-in is due." value={r.measurements.on} onChange={on('measurements')} />
        {r.measurements.on ? (
          <View style={[styles.sub, styles.divider]}>
            <ChipRow options={WEEKDAYS} value={r.measurements.weekday} onChange={(v) => update('measurements', { weekday: v })} columns={7} />
            <ChipRow options={EVERY} value={r.measurements.everyWeeks} onChange={(v) => update('measurements', { everyWeeks: v })} />
          </View>
        ) : null}
      </ListCard>

      <ListCard>
        <ToggleRow title="Weekly summary" sub="Sunday evening: what improved and what slipped." value={r.weeklySummary.on} onChange={on('weeklySummary')} />
        <ToggleRow divider title="Evening check-in" sub="Only if something useful is missing today." value={r.eveningCheckIn.on} onChange={on('eveningCheckIn')} />
        {r.eveningCheckIn.on ? (
          <View style={styles.sub}>
            <Text style={styles.subLabel}>Time</Text>
            <TimeAdjuster value={r.eveningCheckIn.minutes} min={s.wakeMinutes} max={s.sleepMinutes - 15} onChange={(v) => update('eveningCheckIn', { minutes: v })} />
          </View>
        ) : null}
        <ToggleRow divider title="Rest-day mobility" sub="A gentle 8-minute routine on non-training days." value={r.recovery.on} onChange={on('recovery')} />
      </ListCard>

      {/* Quiet hours belong with the switches they silence (UX-10). */}
      <SectionHeader title="Quiet hours" hint={`Nothing fires between ${fmtClockOfDay(s.sleepMinutes)} and ${fmtClockOfDay(s.wakeMinutes)}.`} />
      <ListCard>
        <View style={styles.sub}>
          <Text style={[styles.rowTitle, styles.flex1]}>From</Text>
          <TimeAdjuster
            value={s.sleepMinutes}
            min={s.wakeMinutes + 60}
            onChange={(v) => {
              setSetting('sleepMinutes', v);
              void rescheduleAll();
            }}
          />
        </View>
        <View style={[styles.sub, styles.divider]}>
          <Text style={[styles.rowTitle, styles.flex1]}>Until</Text>
          <TimeAdjuster
            value={s.wakeMinutes}
            max={s.sleepMinutes - 60}
            onChange={(v) => {
              setSetting('wakeMinutes', v);
              void rescheduleAll();
            }}
          />
        </View>
      </ListCard>
    </>
  );
}

/* ================================== Data ================================== */

/** "2 hours ago" beats a timestamp for something you only want reassurance about. */
function fmtWhen(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/**
 * Backup, restore and export: getting your training off this phone, and back.
 * A backup is for you, later, and is encrypted with the recovery phrase; an export
 * is for a coach or a spreadsheet, readable on purpose, and says so.
 */
export function DataTab() {
  const workouts = useLive(() => countFinishedWorkouts(), ['session']);
  const [phrase] = useState(recoveryPhrase);
  const [account, setAccount] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState(lastBackupAt);
  const [busy, setBusy] = useState<'backup' | 'export' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void currentAccount().then(setAccount);
  }, []);

  const backup = () => {
    if (!account) {
      setMessage(null);
      // Authorisation only. Connecting does not start uploading anything.
      void connect().then(
        (email) => email && setAccount(email),
        (e: unknown) => setMessage(`Could not connect: ${e instanceof Error ? e.message : String(e)}`),
      );
      return;
    }
    setMessage(null);
    setBusy('backup');
    backupNow()
      .then(
        () => {
          setLastAt(lastBackupAt());
          setMessage('Backed up.');
        },
        (e: unknown) => setMessage(`Backup failed: ${e instanceof Error ? e.message : String(e)}`),
      )
      .finally(() => setBusy(null));
  };

  return (
    <>
      <Card style={styles.backup}>
        <Text style={styles.eyebrow}>Last backup</Text>
        <Text style={styles.backupWhen}>{lastAt ? fmtWhen(lastAt) : 'Never'}</Text>
        <Text style={styles.hint}>
          {workouts} {workouts === 1 ? 'workout' : 'workouts'} ·{' '}
          {!isConfigured() ? 'Drive backup is not available in this build' : account ? `Google Drive, ${account}` : 'stored only on this phone'}
        </Text>
      </Card>
      {isConfigured() ? (
        <View style={styles.pair}>
          <PrimaryButton label={busy === 'backup' ? 'Backing up…' : account ? 'Back up now' : 'Connect Drive'} disabled={busy !== null} style={styles.flex1} onPress={backup} />
          <PrimaryButton label="Restore" tone="neutral" style={styles.flex1} onPress={() => router.push('/settings/restore')} />
        </View>
      ) : (
        <PrimaryButton label="Restore from a file" tone="neutral" onPress={() => router.push('/settings/restore')} />
      )}
      {message ? <Text style={styles.hint}>{message}</Text> : null}
      <Text style={styles.footnote}>Backups happen when you tap Back up now. Nothing is uploaded on its own, and only Iron can read the Drive folder.</Text>

      <SectionHeader title="Recovery phrase" hint="The only thing that can open a backup on another phone. Write it down." />
      <Card>
        {phrase ? (
          <Text selectable style={styles.phrase} accessibilityLabel={`Recovery phrase: ${phrase.split('').join(' ')}`}>
            {phrase}
          </Text>
        ) : (
          <Text style={styles.hint}>Unavailable — this device has no keystore, so the database is not encrypted.</Text>
        )}
      </Card>

      <ListCard>
        <ListRow
          title={busy === 'export' ? 'Exporting…' : 'Export for a spreadsheet or coach'}
          sub="JSON and CSVs of workouts, food and body. Readable on purpose, so not encrypted."
          onPress={() => {
            if (busy) return;
            setMessage(null);
            setBusy('export');
            exportAll()
              .then(
                (n) => setMessage(n === null ? null : `Saved ${n} files.`),
                (e: unknown) => setMessage(`Export failed: ${e instanceof Error ? e.message : String(e)}`),
              )
              .finally(() => setBusy(null));
          }}
        />
        <ListRow divider title="What Iron stores and sends" sub="And how to delete any of it." onPress={() => router.push('/settings/privacy')} />
        {account ? (
          <ListRow
            divider
            title="Disconnect Google Drive"
            sub="Backups already there are left alone."
            onPress={() => void disconnect().then(() => setAccount(null))}
          />
        ) : null}
      </ListCard>

      <SectionHeader title="Danger zone" />
      <PrimaryButton label="Delete all data" tone="dangerOutline" onPress={() => setDeleting(true)} />
      <Text style={styles.version}>Iron {Constants.expoConfig?.version ?? ''} · no account, no server</Text>

      <DeleteSheet visible={deleting} workouts={workouts} onBackUp={isConfigured() ? backup : undefined} onClose={() => setDeleting(false)} />
    </>
  );
}

/**
 * The one confirmation in Settings, because this is the one thing with no undo
 * (AGENTS §1.4): what goes, a way to keep a copy first, and a way out that is as
 * easy to hit as the way through.
 */
function DeleteSheet({ visible, workouts, onBackUp, onClose }: { visible: boolean; workouts: number; onBackUp?: () => void; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Delete everything?">
      <View style={styles.stack}>
        <Text style={styles.body}>This removes every workout, meal, weigh-in and setting from this phone. There is no undo, and nothing to recover from a server.</Text>
        <ListCard style={styles.flush}>
          <ListRow title={`${workouts} ${workouts === 1 ? 'workout' : 'workouts'}`} sub="And all their sets, notes and pain flags" />
          <ListRow divider title="Plans, food, water and body logs" sub="Every entry, on every day" />
        </ListCard>
        {onBackUp ? (
          <PrimaryButton
            label="Back up first"
            tone="neutral"
            onPress={() => {
              onClose();
              onBackUp();
            }}
          />
        ) : null}
        <PrimaryButton
          label="Delete all data"
          tone="danger"
          size="gym"
          onPress={() => {
            wipeAllData();
            router.replace('/setup');
          }}
        />
        <PrimaryButton label="Keep my data" tone="ghost" onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  stack: { gap: space.md + 2 },
  flush: { marginBottom: 0 },
  pair: { flexDirection: 'row', gap: space.md - 2, marginBottom: space.sm },
  gapTop: { marginTop: space.md },
  lead: { ...font.caption, color: color.textMuted, marginBottom: space.md },
  body: { ...font.caption, fontSize: 14, lineHeight: 20, color: color.textMuted },
  hint: { ...font.caption, fontSize: 12, color: color.textFaint },
  footnote: { ...font.caption, fontSize: 12, color: color.textFaint, marginBottom: space.sm },
  warn: { ...font.label, color: color.warning, marginBottom: space.xs },
  value: { ...font.label, fontSize: 16, fontWeight: '700', ...font.numeric, color: color.text },
  link: { ...font.caption, fontSize: 14, fontWeight: '600', color: color.accent },
  sub: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  subLabel: { ...font.caption, fontWeight: '600', color: color.textMuted, flex: 1 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  rowTitle: { ...font.label, fontWeight: '600', color: color.text },
  backup: { gap: 2 },
  eyebrow: { ...font.eyebrow, color: color.textFaint },
  backupWhen: { ...font.titleSm, color: color.text },
  phrase: { ...font.body, ...font.numeric, color: color.accent, fontWeight: '700', letterSpacing: 0.5 },
  version: { ...font.caption, fontSize: 12, color: color.textFaint, textAlign: 'center', marginTop: space.lg, borderRadius: radius.sm },
});
