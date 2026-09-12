/**
 * Sign up / sign in.
 *
 * Two design rules here, both load-bearing:
 *
 * 1. The marketing opt-in is a separate, unticked, skippable control. Consent to
 *    run an account does not cover marketing under GDPR or DPDP, and a pre-ticked
 *    or bundled box is not consent at all. It must never gate the button.
 * 2. The screen says plainly what leaves the phone and what does not. People are
 *    handing over a name and an email to a workout app; telling them their
 *    training stays local is both the honest thing and the reason they will agree.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, Icon, PrimaryButton, Screen, SectionHeader, Stepper, TextField, toast } from '@/components';
import { getSettings } from '@/db/repositories/settings';
import {
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  saveProfile,
  type Sex,
} from '@/services/account';
import { color, font, space } from '@/theme/tokens';

const SEX_OPTIONS = [
  { label: 'Male', value: 'male' as Sex },
  { label: 'Female', value: 'female' as Sex },
];

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
        <Text style={styles.hint}>Optional, and never required to have an account. You can turn it off any time in Settings.</Text>
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
  const [occupation, setOccupation] = useState('');
  const [age, setAge] = useState(local.age);
  const [sex, setSex] = useState<Sex>(local.sex);
  const [optIn, setOptIn] = useState(false);

  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const signingUp = mode === 'up';
  const ready = signingUp
    ? name.trim().length > 0 && email.includes('@') && password.length >= 8
    : email.includes('@') && password.length > 0;

  const run = (work: () => Promise<unknown>) => {
    setBusy(true);
    setProblem(null);
    void work()
      .then(() => {
        toast(signingUp ? 'Account created.' : 'Signed in.');
        router.back();
      })
      .catch((e: unknown) => setProblem(message(e)))
      .finally(() => setBusy(false));
  };

  const google = () => {
    setBusy(true);
    setProblem(null);
    void signInWithGoogle()
      .then(async (res) => {
        if (!res) return; // backed out of the picker
        // A first Google sign-in has no profile yet; seed it from what Google and
        // the local setup already know, so nobody retypes their own name.
        if (res.isNew) {
          await saveProfile({
            name: res.name || name.trim() || local.name,
            email: res.email,
            occupation: occupation.trim(),
            age,
            sex,
            marketingOptIn: optIn,
          });
        }
        toast('Signed in.');
        router.back();
      })
      .catch((e: unknown) => setProblem(message(e)))
      .finally(() => setBusy(false));
  };

  return (
    <Screen
      title={signingUp ? 'Create an account' : 'Sign in'}
      subtitle="Optional. Iron works fully without one."
      right={<PrimaryButton label="Back" tone="ghost" onPress={() => router.back()} />}
    >
      <Card>
        <Text style={styles.body}>
          An account lets you sign in on another phone. Your workouts, weights, food and measurements stay on this phone
          either way — an account never sends them anywhere.
        </Text>
      </Card>

      <SectionHeader title={signingUp ? 'Your details' : 'Sign in'} />
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
          placeholder={signingUp ? 'Password — at least 8 characters' : 'Password'}
          style={styles.input}
          secureTextEntry
          autoCapitalize="none"
          accessibilityLabel="Password"
        />

        {signingUp ? (
          <>
            <TextField
              value={occupation}
              onCommit={setOccupation}
              onType={setOccupation}
              placeholder="Occupation (optional)"
              style={styles.input}
              autoCapitalize="words"
              accessibilityLabel="Occupation, optional"
            />
            <View style={styles.pair}>
              <Stepper label="Age" value={age} step={1} min={13} max={99} onChange={setAge} />
            </View>
            <Text style={styles.label}>Sex</Text>
            <ChipRow options={SEX_OPTIONS} value={sex} onChange={setSex} fill={false} />
            <Text style={styles.hint}>Used to understand who uses Iron. Height, weight and anything you flagged to go easy on stay on this phone.</Text>
          </>
        ) : null}
      </Card>

      {signingUp ? (
        <Card>
          <OptIn value={optIn} onChange={setOptIn} />
        </Card>
      ) : null}

      <PrimaryButton
        label={busy ? 'Please wait…' : signingUp ? 'Create account' : 'Sign in'}
        size="gym"
        disabled={busy || !ready}
        style={styles.gap}
        onPress={() => run(() => (signingUp ? signUpWithEmail({ name, email, password, occupation, age, sex, marketingOptIn: optIn }) : signInWithEmail(email, password)))}
      />
      <PrimaryButton label="Continue with Google" tone="neutral" disabled={busy} style={styles.gap} onPress={google} />

      <PrimaryButton
        label={signingUp ? 'I already have an account' : 'Create an account instead'}
        tone="ghost"
        style={styles.gap}
        onPress={() => { setMode(signingUp ? 'in' : 'up'); setProblem(null); }}
      />
      {!signingUp ? (
        <PrimaryButton
          label="Forgot password"
          tone="ghost"
          disabled={busy || !email.includes('@')}
          onPress={() => {
            setProblem(null);
            void resetPassword(email).then(
              () => toast('Reset email sent.'),
              (e: unknown) => setProblem(message(e)),
            );
          }}
        />
      ) : null}

      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
    </Screen>
  );
}

/** Firebase error codes are not sentences. Turn the common ones into advice. */
function message(e: unknown): string {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  if (code.includes('email-already-in-use')) return 'That email already has an account. Sign in instead.';
  if (code.includes('invalid-email')) return "That email address doesn't look right.";
  if (code.includes('weak-password')) return 'Use at least 8 characters.';
  if (code.includes('invalid-credential') || code.includes('wrong-password')) return 'That email and password do not match.';
  if (code.includes('user-not-found')) return 'No account with that email.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a few minutes.';
  if (code.includes('network')) return 'No connection. Nothing was changed.';
  return e instanceof Error ? e.message : 'Something went wrong. Nothing was changed.';
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  body: { ...font.body, color: color.text },
  label: { ...font.caption, color: color.textMuted, marginTop: space.md, marginBottom: space.xs },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  input: { marginBottom: space.sm },
  pair: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  gap: { marginTop: space.md },
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
