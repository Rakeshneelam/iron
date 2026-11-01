import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { confirm } from '@/components/confirm';
import { GoogleButton } from '@/components/GoogleButton';
import { Icon } from '@/components/Icon';
import { PrimaryButton } from '@/components/PrimaryButton';
import { toast } from '@/components/Toast';
import { useLive } from '@/db/live';
import { hasOwnData } from '@/db/repositories/restore';
import { fmtAgo, fmtDayLabel } from '@/lib/date';
import { lastBackupAt, type DriveFile } from '@/services/backup';
import { cloudAccount, cloudAvailable, cloudError, restoreLatest, signIn, signOut, syncNow } from '@/services/cloud';
import { color, font, radius, space } from '@/theme/tokens';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * The account, at the top of You: signed out, one line and Continue with Google;
 * signed in, when progress last reached the cloud, with Sync now and Sign out.
 */
export function CloudCard() {
  const state = useLive(() => ({ account: cloudAccount(), last: lastBackupAt(), error: cloudError() }), ['setting']);
  const [busy, setBusy] = useState<'in' | 'sync' | null>(null);
  if (!cloudAvailable()) return null;

  const sync = (note?: string) => {
    setBusy('sync');
    void syncNow().then((r) => {
      setBusy(null);
      toast(r.ok ? (note ?? 'Synced to your Google account') : r.reason);
    });
  };

  const restore = (backup: DriveFile) =>
    void restoreLatest(backup).then((r) => toast(r.ok ? `Restored ${plural(r.workouts, 'workout')}` : r.reason));

  /**
   * Signing in when a copy is already up there. An empty phone takes it without a
   * question; a phone with any data of its own — even only meals or water — asks,
   * because replacing it has no undo.
   */
  const choose = (backup: DriveFile) => {
    if (!hasOwnData()) {
      restore(backup);
      return;
    }
    confirm({
      title: 'Use your cloud copy?',
      message: `Your Google account has a copy from ${fmtDayLabel(backup.createdTime.slice(0, 10))}. Use it to replace what is on this phone, or keep this phone and upload it.`,
      confirmLabel: 'Use cloud copy',
      destructive: true,
      keepLabel: 'Decide later',
      alternative: { label: 'Keep this phone', onPress: () => sync() },
      onConfirm: () => restore(backup),
    });
  };

  const start = () => {
    setBusy('in');
    void signIn().then((r) => {
      setBusy(null);
      if (r.kind === 'failed') toast(r.reason);
      if (r.kind !== 'signed-in') return;
      if (r.backup?.phrase) choose(r.backup);
      // A copy from before sign-in existed carries no phrase, so it cannot come back
      // on its own — but it is never pruned, and this says where to find it.
      else sync(r.backup ? 'Synced. Your older backup stays in Drive: restore it from Backup & data.' : undefined);
    });
  };

  if (!state.account) {
    return (
      <Card style={styles.card}>
        <View style={styles.head}>
          <View style={styles.disc}>
            <Icon name="cloud" size={20} color={color.onAccent} strokeWidth={2.2} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.title}>Keep your progress safe</Text>
            <Text style={styles.sub}>Saved to your Google account, back on any new phone.</Text>
          </View>
        </View>
        <View style={styles.action}>
          <GoogleButton busy={busy === 'in'} onPress={start} />
        </View>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={styles.disc}>
          <Icon name="cloud" size={20} color={color.onAccent} strokeWidth={2.2} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.title}>{busy === 'sync' ? 'Syncing…' : state.last ? `Synced ${fmtAgo(state.last)}` : 'Not synced yet'}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {state.account.email}
          </Text>
        </View>
      </View>
      {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
      <View style={styles.row}>
        <PrimaryButton label="Sync now" tone="neutral" disabled={busy !== null} style={styles.flex1} onPress={() => sync()} />
        <PrimaryButton
          label="Sign out"
          tone="ghost"
          onPress={() =>
            void signOut().then(() => toast('Signed out. Everything stays on this phone.'))
          }
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  card: { borderRadius: radius.xl, marginBottom: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  disc: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  title: { ...font.label, fontSize: 16, color: color.text },
  sub: { ...font.caption, color: color.textMuted },
  action: { marginTop: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg },
  error: { ...font.caption, color: color.warning, marginTop: space.md },
});
