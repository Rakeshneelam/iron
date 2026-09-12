/**
 * Data, account and backup.
 *
 * Split out of Settings, which had grown to twelve sections in one scroll — six of
 * them about where data lives. They belong together and they belong away from the
 * things people change weekly, like training days.
 */
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, confirm, Icon, PrimaryButton, Screen, SectionHeader } from '@/components';
import { recoveryPhrase } from '@/db/client';
import { wipeAllData } from '@/db/repositories/admin';
import { Row } from '@/features/settings/Row';
import {
  deleteAccount,
  isAccountsConfigured,
  loadProfile,
  saveProfile,
  signOutAccount,
  watchAccount,
  type Profile,
} from '@/services/account';
import { autoBackupOn, backupNow, lastBackupAt, setAutoBackup } from '@/services/backup';
import { connect, currentAccount, disconnect, isConfigured } from '@/services/drive';
import { exportAll } from '@/services/export';
import { color, font, space } from '@/theme/tokens';

const ON_OFF = [
  { label: 'On', value: 1 },
  { label: 'Off', value: 0 },
] as const;

/** "2 hours ago" beats a timestamp for something you only want reassurance about. */
function fmtWhen(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export default function DataSettings() {
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [phrase] = useState(recoveryPhrase);

  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accountMsg, setAccountMsg] = useState<string | null>(null);

  const [account, setAccount] = useState<string | null>(null);
  const [driveMsg, setDriveMsg] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [auto, setAuto] = useState(autoBackupOn);
  const [lastAt, setLastAt] = useState(lastBackupAt);

  useEffect(() => {
    if (!isAccountsConfigured()) return;
    return watchAccount((u) => {
      setSignedIn(u?.email ?? null);
      if (u) void loadProfile().then(setProfile);
      else setProfile(null);
    });
  }, []);

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

  const removeAccount = () =>
    confirm({
      title: 'Delete your account?',
      message: 'Your name, email, occupation, age and sex are erased from the server. Your workouts and everything else on this phone are left alone.',
      confirmLabel: 'Continue',
      destructive: true,
      onConfirm: () =>
        confirm({
          title: 'Really delete the account?',
          confirmLabel: 'Delete account',
          destructive: true,
          onConfirm: () => {
            setAccountMsg(null);
            void deleteAccount().then(
              () => setAccountMsg('Account deleted.'),
              (e: unknown) => setAccountMsg(`Could not delete: ${e instanceof Error ? e.message : String(e)}. You may need to sign in again first.`),
            );
          },
        }),
    });

  return (
    <Screen title="Your data" right={<PrimaryButton label="Done" tone="ghost" onPress={() => router.back()} />}>
      {isAccountsConfigured() ? (
        <>
          <SectionHeader title="Account" />
          <Card>
            {signedIn ? (
              <>
                <Text style={styles.bodyStrong}>{signedIn}</Text>
                <Text style={styles.hint}>
                  Only your name, email, occupation, age and sex are stored on the server — never your workouts,
                  weights, food or measurements.
                </Text>
                <Row label="Email me about Iron" hint="Turn this off any time. It never affects your account.">
                  <ChipRow
                    options={ON_OFF}
                    value={profile?.marketingOptIn ? 1 : 0}
                    onChange={(v) => {
                      setProfile((p) => (p ? { ...p, marketingOptIn: v === 1 } : p));
                      void saveProfile({ marketingOptIn: v === 1 });
                    }}
                    fill={false}
                  />
                </Row>
                <PrimaryButton label="Sign out" tone="neutral" style={styles.gap} onPress={() => void signOutAccount()} />
                <PrimaryButton label="Delete account" tone="ghost" style={styles.gap} onPress={removeAccount} />
              </>
            ) : (
              <>
                <Text style={styles.hint}>
                  Optional. An account lets you sign in on another phone. Iron works fully without one, and your
                  training data stays on this phone either way.
                </Text>
                <PrimaryButton label="Create an account or sign in" tone="neutral" style={styles.gap} onPress={() => router.push('/account')} />
              </>
            )}
            {accountMsg ? <Text style={styles.hint}>{accountMsg}</Text> : null}
          </Card>
        </>
      ) : null}

      <SectionHeader title="Backup" hint="Google Drive, or a file you keep yourself." />
      <Card>
        {!isConfigured() ? (
          <Text style={styles.hint}>This build has no Google client ID, so Drive backup is unavailable.</Text>
        ) : account ? (
          <>
            <Text style={styles.bodyStrong}>{account}</Text>
            <Text style={styles.hint}>
              {lastAt ? `Last backed up ${fmtWhen(lastAt)}.` : 'Not backed up yet.'} Only Iron can read this folder, and
              the file is encrypted with your recovery phrase.
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
            <PrimaryButton label="Connect Google Drive" tone="neutral" style={styles.gap} onPress={() => {
              setDriveMsg(null);
              void connect().then(
                (email) => { if (email) { setAccount(email); setAutoBackup(true); setAuto(true); } },
                (e: unknown) => setDriveMsg(`Could not connect: ${e instanceof Error ? e.message : String(e)}`),
              );
            }} />
          </>
        )}
        {driveMsg ? <Text style={styles.hint}>{driveMsg}</Text> : null}
      </Card>

      <Card onPress={() => router.push('/settings/restore')}>
        <LinkRow title="Restore from backup" hint="Replaces everything on this phone with a backup file." />
      </Card>

      <SectionHeader title="Recovery phrase" hint="Needed to read a backup on a new phone." />
      <Card>
        <Text style={styles.hint}>Write it down somewhere you will still have it if this phone is lost.</Text>
        {phrase ? (
          <Text selectable style={styles.phrase} accessibilityLabel={`Recovery phrase: ${phrase.split('').join(' ')}`}>
            {phrase}
          </Text>
        ) : (
          <Text style={styles.hint}>Unavailable — this device has no keystore, so the database is not encrypted.</Text>
        )}
      </Card>

      <SectionHeader title="Export" />
      <Card>
        <Text style={styles.hint}>
          A JSON file for a coach or an AI assistant, CSVs for spreadsheets, and a full backup. Not encrypted —
          anything that can read the folder can read them.
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
      </Card>

      <Card onPress={() => router.push('/settings/privacy')}>
        <LinkRow title="Privacy" hint="What Iron stores, what it sends, and how to delete it." />
      </Card>

      <Card>
        <PrimaryButton label="Delete all my data" tone="ghost" icon={<Icon name="trash" size={16} color={color.danger} />} onPress={deleteAll} />
      </Card>

      <Text style={styles.footer}>
        Iron {Constants.expoConfig?.version ?? ''} ·{' '}
        {isAccountsConfigured()
          ? 'Your workouts, body, food and water stay on this phone.'
          : 'No account, no server. Everything stays on this phone.'}
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
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  body: { ...font.body, color: color.text },
  bodyStrong: { ...font.body, color: color.text, fontWeight: '600' },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  gap: { marginTop: space.md },
  phrase: { ...font.body, ...font.numeric, color: color.accent, marginTop: space.md, fontWeight: '700', letterSpacing: 0.5 },
  footer: { ...font.caption, color: color.textFaint, textAlign: 'center', marginTop: space.lg, marginBottom: space.xl },
});
