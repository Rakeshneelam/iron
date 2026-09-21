/**
 * Backup and restore: one loop.
 *
 * Where the copy goes, how to get it back, and the phrase that opens it. These three
 * belong together because none of them is any use without the other two — a backup
 * you cannot restore is a file, and a restore without the phrase is a locked file.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, confirm, Icon, PrimaryButton, Screen, SectionHeader } from '@/components';
import { recoveryPhrase } from '@/db/client';
import { backupNow, lastBackupAt } from '@/services/backup';
import { connect, currentAccount, disconnect, isConfigured } from '@/services/drive';
import { color, font, space } from '@/theme/tokens';

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

export default function BackupSettings() {
  const [phrase] = useState(recoveryPhrase);
  const [account, setAccount] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [lastAt, setLastAt] = useState(lastBackupAt);

  useEffect(() => {
    void currentAccount().then(setAccount);
  }, []);

  return (
    <Screen
      title="Backup"
      subtitle="Getting your training off this phone, and back onto another."
      right={<PrimaryButton label="Done" tone="ghost" onPress={() => router.back()} />}
    >
      <SectionHeader title="Google Drive" />
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
            <Text style={styles.hint}>Backups happen when you tap Back up now. Nothing is uploaded on its own.</Text>
            <PrimaryButton
              label={backingUp ? 'Backing up…' : 'Back up now'}
              tone="neutral"
              disabled={backingUp}
              style={styles.gap}
              onPress={() => {
                setMessage(null);
                setBackingUp(true);
                backupNow()
                  .then(
                    () => { setLastAt(lastBackupAt()); setMessage('Backed up.'); },
                    (e: unknown) => setMessage(`Backup failed: ${e instanceof Error ? e.message : String(e)}`),
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
                  message: 'Iron can no longer reach Drive. Backups already there are left alone.',
                  confirmLabel: 'Disconnect',
                  onConfirm: () => void disconnect().then(() => setAccount(null)),
                })
              }
            />
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              Authorises Iron to use a private folder only it can see — this is a Drive permission, not an Iron account.
              Backups only happen when you ask for one, and you need your recovery phrase to read one on a new phone.
            </Text>
            <PrimaryButton
              label="Connect Google Drive"
              tone="neutral"
              style={styles.gap}
              onPress={() => {
                setMessage(null);
                // Authorisation only. Connecting does not start uploading anything.
                void connect().then(
                  (email) => { if (email) setAccount(email); },
                  (e: unknown) => setMessage(`Could not connect: ${e instanceof Error ? e.message : String(e)}`),
                );
              }}
            />
          </>
        )}
        {message ? <Text style={styles.hint}>{message}</Text> : null}
      </Card>

      <SectionHeader title="Recovery phrase" hint="The only thing that can open a backup on another phone." />
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

      <SectionHeader title="Restore" />
      <Card onPress={() => router.push('/settings/restore')}>
        <View style={styles.linkRow}>
          <View style={styles.flex1}>
            <Text style={styles.body}>Restore from a backup</Text>
            <Text style={styles.hint}>Replaces everything on this phone. From Drive, or from a file.</Text>
          </View>
          <Icon name="chevronRight" size={20} color={color.textMuted} />
        </View>
      </Card>
    </Screen>
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
});
