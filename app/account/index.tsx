/**
 * Sign up or log in with email. Google never comes here: it signs in where its button
 * is, so this screen exists only for the one method that needs a form.
 *
 * Two rules, both load-bearing:
 *
 * 1. The marketing opt-in is a separate, unticked, skippable control. Consent to run
 *    an account does not cover marketing under GDPR or DPDP, and a pre-ticked or
 *    bundled box is not consent at all. It must never gate the button.
 * 2. Only what an account needs is asked: name, email, password. Age and sex are
 *    answered once, in setup, not here and then again on the next screen.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Icon, PrimaryButton, Screen, TextField, toast } from '@/components';
import { getSettings } from '@/db/repositories/settings';
import { accountErrorMessage, resetPassword, signInWithEmail, signUpWithEmail } from '@/services/account';
import { color, font, space } from '@/theme/tokens';

/** An unticked box that says what it is for. Never defaulted on. */
function OptIn({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel="Email me occasionally about Iron. Optional."
      style={styles.optIn}
    >
      <View style={[styles.box, value && styles.boxOn]}>{value ? <Icon name="check" size={16} color={color.onAccent} /> : null}</View>
      <View style={styles.flex1}>
        <Text style={styles.body}>Email me occasionally about Iron</Text>
        <Text style={styles.hint}>Optional, and never required. You can turn it off any time in Settings.</Text>
      </View>
    </Pressable>
  );
}

export default function AccountScreen() {
  const [local] = useState(getSettings);
  const [mode, setMode] = useState<'up' | 'in'>('up');
  const [name, setName] = useState(local.name);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const signingUp = mode === 'up';
  const ready = signingUp
    ? name.trim().length > 0 && email.includes('@') && password.length >= 8
    : email.includes('@') && password.length > 0;

  const submit = () => {
    setBusy(true);
    setProblem(null);
    const work = signingUp ? signUpWithEmail({ name, email, password, marketingOptIn: optIn }) : signInWithEmail(email, password);
    void work
      .then(() => {
        toast(signingUp ? 'Account created.' : 'Logged in.');
        router.back();
      })
      .catch((e: unknown) => setProblem(accountErrorMessage(e)))
      .finally(() => setBusy(false));
  };

  return (
    <Screen
      title={signingUp ? 'Sign up with email' : 'Log in'}
      subtitle="Your training data stays on this phone either way."
      right={<PrimaryButton label="Back" tone="ghost" onPress={() => router.back()} />}
    >
      <Card>
        {signingUp ? (
          <TextField value={name} onCommit={setName} onType={setName} placeholder="Name" style={styles.input} autoCapitalize="words" accessibilityLabel="Name" />
        ) : null}
        <TextField
          value={email}
          onCommit={setEmail}
          onType={setEmail}
          placeholder="Email"
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          accessibilityLabel="Email"
        />
        <TextField
          value={password}
          onCommit={setPassword}
          onType={setPassword}
          trim={false}
          placeholder={signingUp ? 'Password, at least 8 characters' : 'Password'}
          secureTextEntry
          autoCapitalize="none"
          accessibilityLabel="Password"
        />
      </Card>

      {signingUp ? (
        <Card>
          <OptIn value={optIn} onChange={setOptIn} />
        </Card>
      ) : null}

      <PrimaryButton label={busy ? 'Please wait…' : signingUp ? 'Create account' : 'Log in'} size="gym" disabled={busy || !ready} onPress={submit} />
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}

      {!signingUp ? (
        <PrimaryButton
          label="Forgot password?"
          tone="ghost"
          style={styles.gap}
          disabled={busy || !email.includes('@')}
          onPress={() => {
            setProblem(null);
            void resetPassword(email).then(
              () => toast('Reset email sent.'),
              (e: unknown) => setProblem(accountErrorMessage(e)),
            );
          }}
        />
      ) : null}

      <View style={styles.switch}>
        <Text style={styles.hintInline}>{signingUp ? 'Already have an account?' : 'New to Iron?'}</Text>
        <PrimaryButton
          label={signingUp ? 'Log in' : 'Sign up'}
          tone="ghost"
          onPress={() => {
            setMode(signingUp ? 'in' : 'up');
            setProblem(null);
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  body: { ...font.body, color: color.text },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  hintInline: { ...font.label, color: color.textMuted },
  input: { marginBottom: space.sm },
  gap: { marginTop: space.md },
  switch: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: space.xl },
  optIn: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  boxOn: { backgroundColor: color.accent, borderColor: color.accent },
  problem: { ...font.body, color: color.danger, marginTop: space.md },
});
