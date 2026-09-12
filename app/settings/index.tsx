import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, confirm, Icon, IconButton, PrimaryButton, Screen, SectionHeader, Stepper, TextField, ToggleChips } from '@/components';
import { CATALOG_BY_ID } from '@/data/catalog';
import { recoveryPhrase } from '@/db/client';
import { autoBackupOn, backupNow, lastBackupAt, setAutoBackup } from '@/services/backup';
import { connect, currentAccount, disconnect, isConfigured } from '@/services/drive';
import { wipeAllData } from '@/db/repositories/admin';
import { PHASES, setSetting, useSettings } from '@/db/repositories/settings';
import { GOAL_OPTIONS, LEVEL_OPTIONS, LIMITATION_OPTIONS, PRESET_OPTIONS, toggle, toolsOf, TOOL_OPTIONS, WEEKDAYS } from '@/features/profile';
import { GOALS } from '@/features/settings/goals';
import { Row, TimeAdjuster } from '@/features/settings/Row';
import { MODE_OPTIONS } from '@/features/warmup/labels';
import { exportAll } from '@/services/export';
import { openBatteryOptimisationSettings, rescheduleAll } from '@/services/notifications';
import { color, font, hit, radius, space } from '@/theme/tokens';

/** "2 hours ago" beats a timestamp for something the user only wants reassurance about. */
function fmtWhen(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

const ON_OFF = [
  { label: 'On', value: 1 },
  { label: 'Off', value: 0 },
] as const;

export default function SettingsScreen() {
  const s = useSettings();
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const tools = toolsOf(s);

  const bool = (key: 'calorieCycling' | 'hapticsEnabled' | 'restTimerAutoStart') => (
    <ChipRow options={ON_OFF} value={s[key] ? 1 : 0} onChange={(v) => setSetting(key, v === 1)} fill={false} />
  );

  // Read once per mount: it never changes, and it must be here to be written down
  // while the phone still works, not revealed once at a moment nobody remembers.
  const [phrase] = useState(recoveryPhrase);

  const [account, setAccount] = useState<string | null>(null);
  const [driveMsg, setDriveMsg] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [auto, setAuto] = useState(autoBackupOn);
  const [lastAt, setLastAt] = useState(lastBackupAt);
  useEffect(() => {
    void currentAccount().then(setAccount);
  }, []);

  const deleteAll = () =>
    confirm({
      title: 'Delete all your data?',
      message: 'Workouts, plans, body measurements, water, food and settings are removed from this phone. Export first if you want a copy. This cannot be undone.',
      confirmLabel: 'Continue',
      destructive: true,
      onConfirm: () =>
        confirm({
          title: 'Really delete everything?',
          confirmLabel: 'Delete everything',
          destructive: true,
          onConfirm: () => {
            wipeAllData();
            router.replace('/setup');
          },
        }),
    });

  return (
    <Screen title="Settings" right={<PrimaryButton label="Done" tone="ghost" onPress={() => router.back()} />}>
      <SectionHeader title="Profile" />
      <Card>
        <TextField
          value={s.name}
          onCommit={(v) => setSetting('name', v)}
          placeholder="Your name"
          style={styles.input}
          autoCapitalize="words"
          accessibilityLabel="Your name"
        />
        <View style={styles.pair}>
          <Stepper label="Height" suffix="cm" value={s.heightCm} step={1} min={120} max={230} onChange={(v) => setSetting('heightCm', v)} />
          <Stepper label="Age" value={s.age} step={1} min={14} max={99} onChange={(v) => setSetting('age', v)} />
        </View>
        <Row label="Sex" hint="Calorie estimate and body diagrams.">
          <ChipRow
            options={[
              { label: 'Male', value: 'male' },
              { label: 'Female', value: 'female' },
            ]}
            value={s.sex}
            onChange={(v) => setSetting('sex', v)}
            fill={false}
          />
        </Row>
        <Text style={styles.label}>Body-weight goal</Text>
        <ChipRow options={GOALS.filter((g) => PHASES.includes(g.value))} value={s.phase} onChange={(v) => setSetting('phase', v)} />
      </Card>

      <SectionHeader title="Training" />
      <Card>
        <Text style={styles.label}>Main goal</Text>
        <ChipRow options={GOAL_OPTIONS} value={s.goalFocus} onChange={(v) => setSetting('goalFocus', v)} />
        <Text style={styles.label}>Experience</Text>
        <ChipRow options={LEVEL_OPTIONS} value={s.experience} onChange={(v) => setSetting('experience', v)} />
        <Text style={styles.label}>Training days</Text>
        <ToggleChips options={WEEKDAYS} values={s.trainingDays} onToggle={(d) => { setSetting('trainingDays', toggle(s.trainingDays, d)); void rescheduleAll(); }} />
        <Text style={styles.hint}>Your plan runs in order whatever the day — these only set reminders and "planned this week".</Text>
        <View style={styles.gap}>
          <Stepper label="Typical session length" suffix="min" value={s.trainingMinutes} step={5} min={15} max={180} onChange={(v) => setSetting('trainingMinutes', v)} />
        </View>
        <Text style={styles.label}>Default warm-up</Text>
        <ChipRow options={MODE_OPTIONS} value={s.warmupMode} onChange={(v) => setSetting('warmupMode', v)} />
        <Row label="Auto-start rest timer">{bool('restTimerAutoStart')}</Row>
        <Row label="Haptics">{bool('hapticsEnabled')}</Row>
      </Card>

      <SectionHeader title="Equipment" />
      <Card>
        <ChipRow options={PRESET_OPTIONS} value={s.tools.length ? null : s.equipmentPreset} onChange={(v) => { setSetting('equipmentPreset', v); setSetting('tools', []); }} fill={false} />
        <Text style={styles.label}>What you have{s.tools.length ? ' (custom)' : ''}</Text>
        <ToggleChips options={TOOL_OPTIONS} values={[...tools]} onToggle={(t) => setSetting('tools', toggle([...tools], t))} />
        <Text style={styles.hint}>Swaps, new plans and the exercise picker only suggest what you can do here.</Text>
      </Card>
      <Card onPress={() => router.push('/settings/equipment')}>
        <LinkRow title="Plates and dumbbells" hint="Weights you can actually load — suggestions snap to these." />
      </Card>

      <SectionHeader title="Preferences" />
      <Card>
        <Text style={styles.label}>Go easy on (optional)</Text>
        <ToggleChips options={LIMITATION_OPTIONS} values={s.limitations} onToggle={(v) => setSetting('limitations', toggle(s.limitations, v))} />
        <Text style={styles.hint}>Exercises that load these areas are avoided in swaps and new plans. Not medical advice.</Text>
        <Text style={styles.label}>Exercises you’d rather not do</Text>
        {s.disliked.length === 0 ? <Text style={styles.hint}>None. Mark one from its guide in the exercise library.</Text> : null}
        {s.disliked.map((id) => (
          <View key={id} style={styles.dislike}>
            <Text style={[styles.body, styles.flex1]}>{CATALOG_BY_ID.get(id)?.name ?? id}</Text>
            <IconButton icon="close" accessibilityLabel="Allow again" onPress={() => setSetting('disliked', s.disliked.filter((x) => x !== id))} />
          </View>
        ))}
      </Card>

      <SectionHeader title="Reminders" />
      <Card onPress={() => router.push('/settings/reminders')}>
        <LinkRow title="Reminders" hint="Water, workouts, weigh-ins, measurements, weekly summary — each on or off." />
      </Card>
      <Card>
        <Row label="Wake">
          <TimeAdjuster value={s.wakeMinutes} max={s.sleepMinutes - 60} onChange={(v) => { setSetting('wakeMinutes', v); void rescheduleAll(); }} />
        </Row>
        <Row label="Sleep" hint="Quiet hours: nothing between sleep and wake.">
          <TimeAdjuster value={s.sleepMinutes} min={s.wakeMinutes + 60} onChange={(v) => { setSetting('sleepMinutes', v); void rescheduleAll(); }} />
        </Row>
      </Card>
      <Card onPress={() => void openBatteryOptimisationSettings()}>
        <LinkRow title="Battery optimisation" hint="Lets the rest timer and reminders run with the screen off." />
      </Card>

      <SectionHeader title="Water & food" />
      <Card>
        <Text style={styles.label}>Water target</Text>
        <ChipRow
          options={[
            { label: 'Auto', value: 0 },
            { label: '2.5 L', value: 2500 },
            { label: '3 L', value: 3000 },
            { label: '3.5 L', value: 3500 },
            { label: '4 L', value: 4000 },
          ]}
          value={s.hydrationOverrideMl ?? 0}
          onChange={(v) => { setSetting('hydrationOverrideMl', v === 0 ? null : v); void rescheduleAll(); }}
          fill={false}
        />
        <Text style={styles.hint}>Auto = 33 ml per kg, plus training and heat.</Text>
        <Text style={styles.label}>Hot weather</Text>
        <ChipRow
          options={[
            { label: 'Off', value: 0 },
            { label: '32°', value: 32 },
            { label: '36°', value: 36 },
            { label: '40°', value: 40 },
          ]}
          value={s.ambientTempC ?? 0}
          onChange={(v) => { setSetting('ambientTempC', v === 0 ? null : v); void rescheduleAll(); }}
        />
        <Row label="Calorie cycling" hint="+8% on training days, −8% on rest days.">{bool('calorieCycling')}</Row>
      </Card>

      <SectionHeader title="Your data" />
      <Card>
        <Text style={styles.bodyStrong}>Export everything</Text>
        <Text style={styles.hint}>
          A structured JSON file for a coach or an AI assistant (profile, plans, every workout with planned vs done, records, body, water, weekly summaries), CSVs for
          spreadsheets, and a full backup.
        </Text>
        <PrimaryButton
          label={exporting ? 'Exporting…' : 'Export to a folder'}
          tone="neutral"
          disabled={exporting}
          icon={<Icon name="export" size={18} />}
          style={styles.gap}
          onPress={() => {
            setExportMsg(null);
            setExporting(true);
            exportAll()
              .then(
                (n) => setExportMsg(n === null ? null : `Saved ${n} files.`),
                (e: unknown) => setExportMsg(`Export failed: ${e instanceof Error ? e.message : String(e)}`),
              )
              .finally(() => setExporting(false));
          }}
        />
        {exportMsg ? <Text style={styles.hint}>{exportMsg}</Text> : null}
        <Text style={styles.hint}>These files are not encrypted — anything that can read the folder can read them.</Text>
        <PrimaryButton label="Delete all my data" tone="ghost" icon={<Icon name="trash" size={16} color={color.danger} />} style={styles.gap} onPress={deleteAll} />
      </Card>

      <SectionHeader title="Google Drive backup" />
      <Card>
        {!isConfigured() ? (
          <Text style={styles.hint}>
            This build has no Google client ID, so Drive backup is unavailable. See scripts/setup-google-drive.sh.
          </Text>
        ) : account ? (
          <>
            <Text style={styles.bodyStrong}>{account}</Text>
            <Text style={styles.hint}>
              {lastAt ? `Last backed up ${fmtWhen(lastAt)}.` : 'Not backed up yet.'} Only Iron can read this folder, and the
              file is encrypted with your recovery phrase.
            </Text>
            <Row label="Back up daily" hint="On Wi-Fi, in the background. Never interrupts a workout.">
              <ChipRow options={ON_OFF} value={auto ? 1 : 0} onChange={(v) => { setAutoBackup(v === 1); setAuto(v === 1); }} fill={false} />
            </Row>
            <PrimaryButton
              label={backingUp ? 'Backing up…' : 'Back up now'}
              tone="neutral"
              disabled={backingUp}
              style={styles.gap}
              onPress={() => {
                setDriveMsg(null);
                setBackingUp(true);
                backupNow()
                  .then(
                    () => { setLastAt(lastBackupAt()); setDriveMsg('Backed up.'); },
                    (e: unknown) => setDriveMsg(`Backup failed: ${e instanceof Error ? e.message : String(e)}`),
                  )
                  .finally(() => setBackingUp(false));
              }}
            />
            <PrimaryButton
              label="Disconnect"
              tone="ghost"
              style={styles.gap}
              onPress={() =>
                confirm({
                  title: 'Disconnect Google Drive?',
                  message: 'Iron stops backing up. Backups already in Drive are left alone.',
                  confirmLabel: 'Disconnect',
                  onConfirm: () => void disconnect().then(() => { setAccount(null); setAutoBackup(false); setAuto(false); }),
                })
              }
            />
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              Backs up to a private folder only Iron can see. You need your recovery phrase to read it on a new phone.
            </Text>
            <PrimaryButton
              label="Connect Google Drive"
              tone="neutral"
              style={styles.gap}
              onPress={() => {
                setDriveMsg(null);
                void connect().then(
                  (email) => { if (email) { setAccount(email); setAutoBackup(true); setAuto(true); } },
                  (e: unknown) => setDriveMsg(`Could not connect: ${e instanceof Error ? e.message : String(e)}`),
                );
              }}
            />
          </>
        )}
        {driveMsg ? <Text style={styles.hint}>{driveMsg}</Text> : null}
      </Card>

      <Card onPress={() => router.push('/settings/restore')}>
        <LinkRow title="Restore from backup" hint="Replaces everything on this phone with a backup file." />
      </Card>

      <Card>
        <Text style={styles.bodyStrong}>Recovery phrase</Text>
        <Text style={styles.hint}>Needed to read a backup on a new phone. Write it down somewhere you will still have it if this phone is lost.</Text>
        {phrase ? (
          <Text selectable style={styles.phrase} accessibilityLabel={`Recovery phrase: ${phrase.split('').join(' ')}`}>
            {phrase}
          </Text>
        ) : (
          <Text style={styles.hint}>Unavailable — this device has no keystore, so the database is not encrypted.</Text>
        )}
      </Card>
      <Card onPress={() => router.push('/settings/privacy')}>
        <LinkRow title="Privacy" hint="What Iron stores, what it sends, and how to delete it." />
      </Card>

      <Text style={styles.footer}>
        Iron {Constants.expoConfig?.version ?? ''} · no account, no server. Everything stays on this phone, and nothing is sent anywhere unless you export it.
      </Text>
    </Screen>
  );
}

function LinkRow({ title, hint }: { title: string; hint: string }) {
  return (
    <View style={styles.linkRow}>
      <View style={styles.flex1}>
        <Text style={styles.body}>{title}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Icon name="chevronRight" size={20} color={color.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  input: { ...font.body, color: color.text, backgroundColor: color.surfaceHigh, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: hit.default },
  pair: { flexDirection: 'row', gap: space.md, marginVertical: space.md },
  label: { ...font.caption, color: color.textMuted, marginTop: space.md, marginBottom: space.xs },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  body: { ...font.body, color: color.text },
  bodyStrong: { ...font.body, color: color.text, fontWeight: '600' },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  gap: { marginTop: space.md },
  dislike: { flexDirection: 'row', alignItems: 'center', minHeight: hit.default },
  phrase: { ...font.title, ...font.numeric, color: color.accent, marginTop: space.md, letterSpacing: 1 },
  footer: { ...font.caption, color: color.textFaint, textAlign: 'center', marginTop: space.lg },
});
