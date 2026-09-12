/**
 * Account: who you are.
 *
 * Kept apart from backup on purpose. Signing in is about identity — an email, a
 * password, whether we may write to you. Backup is about where your training data
 * lives. Filing them together made a tidy menu and a confusing one.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Card, ChipRow, confirm, PrimaryButton, Screen, SectionHeader } from '@/components';
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
import { color, font, space } from '@/theme/tokens';

const ON_OFF = [
  { label: 'On', value: 1 },
  { label: 'Off', value: 0 },
] as const;

export default function AccountSettings() {
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isAccountsConfigured()) return;
    return watchAccount((u) => {
      setSignedIn(u?.email ?? null);
      if (u) void loadProfile().then(setProfile);
      else setProfile(null);
    });
  }, []);

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
            setMessage(null);
            void deleteAccount().then(
              () => setMessage('Account deleted.'),
              (e: unknown) => setMessage(`Could not delete: ${e instanceof Error ? e.message : String(e)}. You may need to sign in again first.`),
            );
          },
        }),
    });

  return (
    <Screen
      title="Account"
      subtitle="Optional. Iron works fully without one."
      right={<PrimaryButton label="Done" tone="ghost" onPress={() => router.back()} />}
    >
      {!isAccountsConfigured() ? (
        <Card>
          <Text style={styles.hint}>This build has no account service configured.</Text>
        </Card>
      ) : signedIn ? (
        <>
          <Card>
            <Text style={styles.bodyStrong}>{signedIn}</Text>
            <Text style={styles.hint}>
              Only your name, email, occupation, age and sex are stored on the server — never your workouts, weights,
              food or measurements.
            </Text>
          </Card>

          <SectionHeader title="Email" />
          <Card>
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
          </Card>

          <SectionHeader title="Leaving" />
          <Card>
            <Text style={styles.hint}>
              Signing out keeps everything on this phone. Deleting the account erases those five fields from the server.
            </Text>
            <PrimaryButton label="Sign out" tone="neutral" style={styles.gap} onPress={() => void signOutAccount()} />
            <PrimaryButton label="Delete account" tone="ghost" style={styles.gap} onPress={removeAccount} />
          </Card>
        </>
      ) : (
        <Card>
          <Text style={styles.hint}>
            An account lets you sign in on another phone. Your training data stays on this phone either way.
          </Text>
          <PrimaryButton label="Create an account or sign in" tone="neutral" style={styles.gap} onPress={() => router.push('/account')} />
        </Card>
      )}

      {message ? <Text style={styles.hint}>{message}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bodyStrong: { ...font.body, color: color.text, fontWeight: '600' },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  gap: { marginTop: space.md },
});
