import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipRow, Icon, PrimaryButton, Screen, Stepper, toast, ToggleChips } from '@/components';
import { CATALOG_BY_ID, type Level, type Stress } from '@/data/catalog';
import { PLAN_TEMPLATES, type EquipmentPreset, type Goal } from '@/data/templates';
import { getLatestWeight, upsertWeighIn } from '@/db/repositories/body';
import { createPlan } from '@/db/repositories/program';
import { getSettings, setSetting } from '@/db/repositories/settings';
import type { Phase, Sex } from '@/engine/metabolic';
import { adaptTemplate, PRESET_TOOLS, recommendTemplates, type TrainingProfile } from '@/engine/planner';
import { GOAL_OPTIONS, LEVEL_OPTIONS, LIMITATION_OPTIONS, PRESET_OPTIONS, toggle, WEEKDAYS } from '@/features/profile';
import { GOALS } from '@/features/settings/goals';
import { todayISO } from '@/lib/date';
import { accountErrorMessage, currentUser, isAccountsConfigured, loadProfile, saveProfile, signInWithGoogle, watchAccount } from '@/services/account';
import { rescheduleAll } from '@/services/notifications';
import { color, font, hit, layout, radius, space } from '@/theme/tokens';

const OWN = 'own';
const MINUTES = [20, 30, 45, 60, 75].map((m) => ({ label: `${m}`, value: m }));

/** Welcome, then you, then training, then a plan. One decision per screen. */
const STEPS = ['welcome', 'you', 'training', 'plan'] as const;
const LAST = STEPS.length - 1;
const TITLES = ['', 'About you', 'Your training', 'Your plan'];
const SUBS = ['', 'Used for calorie and water targets.', 'Only what changes the plan we suggest.', 'Fully editable, and you can switch any time.'];

/**
 * First run on a fresh install.
 *
 * Staged rather than one long form: a single screen asking fourteen questions is
 * where people put the phone down. The welcome is skippable, because the app must be
 * fully usable by someone who never signs in.
 */
export default function Setup() {
  const insets = useSafeAreaInsets();
  const [initial] = useState(getSettings);
  const [name, setName] = useState(initial.name);
  const [sex, setSex] = useState<Sex>(initial.sex);
  const [age, setAge] = useState(initial.age);
  const [height, setHeight] = useState(initial.heightCm);
  const [weight, setWeight] = useState(() => getLatestWeight() ?? 70);
  const [phase, setPhase] = useState<Phase>(initial.phase);
  const [goal, setGoal] = useState<Goal>(initial.goalFocus);
  const [level, setLevel] = useState<Level>('beginner');
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [minutes, setMinutes] = useState(45);
  const [preset, setPreset] = useState<EquipmentPreset>('gym');
  const [limits, setLimits] = useState<Stress[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [step, setStep] = useState(0);
  // Screen reserves layout.actionBarHeight at the bottom, but this bar is taller than
  // that — more so once the gate line appears. Measured, so it stays right.
  const [barHeight, setBarHeight] = useState(0);

  const profile: TrainingProfile = useMemo(
    () => ({ goal, level, daysPerWeek: days.length || 3, minutes, tools: new Set(PRESET_TOOLS[preset]), disliked: new Set(), limitations: new Set(limits) }),
    [goal, level, days.length, minutes, preset, limits],
  );
  const ranked = useMemo(() => recommendTemplates(profile, PLAN_TEMPLATES, CATALOG_BY_ID), [profile]);

  // Signed in (Google here, or email on the account screen): take what the account
  // already knows rather than asking the same questions twice, and move on.
  useEffect(() => {
    if (!isAccountsConfigured()) return;
    return watchAccount((u) => {
      if (!u) return;
      void loadProfile().then((pr) => {
        if (pr?.name) setName(pr.name);
        if (pr?.age) setAge(pr.age);
        if (pr?.sex) setSex(pr.sex);
      });
      setStep((current) => (current === 0 ? 1 : current));
    });
  }, []);

  if (step === 0) {
    return (
      <Welcome
        onContinue={(googleName) => {
          if (googleName) setName(googleName);
          setStep(1);
        }}
      />
    );
  }

  const choice = picked ?? ranked[0]?.template.id ?? OWN;
  const shown = showAll ? ranked : ranked.slice(0, 3);
  const signedIn = isAccountsConfigured() && currentUser() !== null;

  /** Why the button is off, or null when it is on. Never a dead control. */
  const blocker =
    step === 1 && !name.trim() ? 'Enter your name to continue.'
    : step === 2 && days.length === 0 ? 'Pick the days you can train.'
    : null;
  const clearance = Math.max(0, barHeight - layout.actionBarHeight);

  const finish = () => {
    setSetting('name', name.trim());
    setSetting('sex', sex);
    setSetting('age', age);
    setSetting('heightCm', height);
    setSetting('phase', phase);
    setSetting('goalFocus', goal);
    setSetting('experience', level);
    setSetting('trainingDays', days);
    setSetting('trainingMinutes', minutes);
    setSetting('equipmentPreset', preset);
    setSetting('tools', []);
    setSetting('limitations', limits);
    setSetting('warmupMode', minutes <= 30 ? 'quick' : 'standard');
    upsertWeighIn(todayISO(), weight);
    // The account is only asked for name, email and password; age and sex are
    // answered here, once, and passed on. Never awaited: setup must not wait on a network.
    if (signedIn) void saveProfile({ name: name.trim(), age, sex }).catch(() => undefined);
    const t = PLAN_TEMPLATES.find((x) => x.id === choice);
    if (t) {
      const adapted = adaptTemplate(t, profile, CATALOG_BY_ID);
      createPlan({ name: t.name, daysPerWeek: days.length || t.daysPerWeek, days: adapted.days }, { activate: true });
      if (adapted.swaps.length) toast(`Plan ready — ${adapted.swaps.length} ${adapted.swaps.length === 1 ? 'exercise' : 'exercises'} swapped for your equipment`);
    }
    setSetting('setupDone', true);
    void rescheduleAll();
    router.replace(t ? '/' : '/program');
  };

  return (
    <View style={styles.flex}>
      <Screen title={TITLES[step]} subtitle={`Step ${step} of ${LAST} · ${SUBS[step]}`}>
        {step === 1 ? (
          <>
            <Text style={styles.label}>Your name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={color.textFaint}
              style={styles.input}
              autoCapitalize="words"
              accessibilityLabel="Your name, required"
            />
            {signedIn ? <Text style={styles.hint}>Taken from your account. Change it if you like.</Text> : null}
            <Text style={styles.label}>Sex</Text>
            <ChipRow
              options={[
                { label: 'Male', value: 'male' },
                { label: 'Female', value: 'female' },
              ]}
              value={sex}
              onChange={setSex}
            />
            <View style={styles.pair}>
              <Stepper label="Age" value={age} step={1} min={14} max={99} onChange={setAge} />
              <Stepper label="Height" suffix="cm" value={height} step={1} min={120} max={230} onChange={setHeight} />
            </View>
            <View style={styles.pair}>
              <Stepper label="Weight" suffix="kg" value={weight} step={0.5} min={30} max={250} onChange={setWeight} />
            </View>
            <Text style={styles.label}>Body-weight goal</Text>
            <ChipRow options={GOALS} value={phase} onChange={setPhase} fill={false} />
            <Text style={styles.hint}>Height and weight stay on this phone. Long-press a number to type it.</Text>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.label}>Main goal</Text>
            <ChipRow options={GOAL_OPTIONS} value={goal} onChange={setGoal} fill={false} />
            <Text style={styles.label}>Lifting experience</Text>
            <ChipRow options={LEVEL_OPTIONS} value={level} onChange={setLevel} fill={false} />
            <Text style={styles.label}>Which days can you train?</Text>
            <ToggleChips options={WEEKDAYS} values={days} onToggle={(d) => setDays(toggle(days, d))} />
            <Text style={styles.hint}>Your plan runs in order whatever the day — these only set reminders.</Text>
            <Text style={styles.label}>Minutes per session</Text>
            <ChipRow options={MINUTES} value={minutes} onChange={setMinutes} fill={false} />
            <Text style={styles.label}>Where do you train?</Text>
            <ChipRow options={PRESET_OPTIONS} value={preset} onChange={setPreset} fill={false} />
            <Text style={styles.label}>Anything to go easy on? (optional)</Text>
            <ToggleChips options={LIMITATION_OPTIONS} values={limits} onToggle={(v) => setLimits(toggle(limits, v))} />
            <Text style={styles.hint}>Only used to avoid exercises that load these areas, and it never leaves this phone. Not medical advice.</Text>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={styles.lead}>Start from a plan we suggest, or build your own from scratch.</Text>
            <Choice title="Build my own" subtitle="Start empty and add your own days and exercises" selected={choice === OWN} onPress={() => setPicked(OWN)} />
            <Text style={styles.orLabel}>Or pick a ready-made plan</Text>
            {shown.map((m, i) => (
              <Choice
                key={m.template.id}
                title={m.template.name}
                subtitle={`${m.template.daysPerWeek} days, about ${m.template.minutes} min. ${m.reasons.slice(0, 2).join(', ')}`}
                badge={i === 0 && !showAll ? 'Best match' : undefined}
                selected={choice === m.template.id}
                onPress={() => setPicked(m.template.id)}
              />
            ))}
            {!showAll ? <PrimaryButton label="See all plans" tone="ghost" onPress={() => setShowAll(true)} /> : null}
            <Text style={styles.hint}>Every plan is fully editable, and you can keep several and switch any time.</Text>
          </>
        ) : null}

        <View style={{ height: clearance }} />
      </Screen>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + space.md }]} onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}>
        {blocker ? <Text style={styles.gate}>{blocker}</Text> : null}
        <View style={styles.barRow}>
          <PrimaryButton label="Back" tone="ghost" onPress={() => setStep(step - 1)} />
          <PrimaryButton
            label={step === LAST ? "Let's go" : 'Next'}
            size="gym"
            style={styles.flex1}
            disabled={blocker !== null}
            onPress={() => (step === LAST ? finish() : setStep(step + 1))}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * The first screen, laid out the way Instagram's is: the mark in the middle, the
 * choices at the bottom where a thumb is, and "restore" below a hairline.
 *
 * Google signs in right here. It used to open a second screen with the same button
 * on it, which was a whole screen whose only job was to be tapped through. Email
 * genuinely needs a form, so only email goes anywhere.
 */
function Welcome({ onContinue }: { onContinue: (googleName?: string) => void }) {
  const insets = useSafeAreaInsets();
  const accounts = isAccountsConfigured();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const google = () => {
    setBusy(true);
    setProblem(null);
    signInWithGoogle()
      .then((res) => {
        if (res) onContinue(res.name);
      })
      .catch((e: unknown) => setProblem(accountErrorMessage(e)))
      .finally(() => setBusy(false));
  };

  return (
    <View style={[styles.welcome, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.hero}>
        <Image source={require('../assets/icon.png')} style={styles.logo} accessibilityLabel="Iron" />
        <Text style={styles.wordmark}>Iron</Text>
        <Text style={styles.tagline}>Train, track your body and eat to your goal. Everything stays on this phone.</Text>
      </View>

      <View style={styles.actions}>
        {accounts ? (
          <>
            <PrimaryButton label={busy ? 'Opening Google…' : 'Continue with Google'} size="gym" disabled={busy} onPress={google} />
            <PrimaryButton label="Continue with email" tone="neutral" size="gym" disabled={busy} onPress={() => router.push('/account')} />
            {problem ? <Text style={styles.problem}>{problem}</Text> : null}
            <PrimaryButton label="Use Iron without an account" tone="ghost" disabled={busy} onPress={() => onContinue()} />
          </>
        ) : (
          <PrimaryButton label="Get started" size="gym" onPress={() => onContinue()} />
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>New phone?</Text>
        <PrimaryButton label="Restore a backup" tone="ghost" onPress={() => router.push('/settings/restore')} />
      </View>
    </View>
  );
}

function Choice({ title, subtitle, selected, badge, onPress }: { title: string; subtitle: string; selected: boolean; badge?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} style={({ pressed }) => [styles.choice, selected && styles.choiceOn, pressed && styles.pressed]}>
      <View style={styles.flex1}>
        <View style={styles.titleRow}>
          <Text style={styles.choiceTitle}>{title}</Text>
          {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        </View>
        <Text style={styles.hint}>{subtitle}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <Icon name="check" size={16} color={color.onAccent} /> : null}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  welcome: { flex: 1, backgroundColor: color.bg, paddingHorizontal: space.xl },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 120, height: 120, borderRadius: radius.xl },
  wordmark: { ...font.display, color: color.text, marginTop: space.lg },
  tagline: { ...font.body, color: color.textMuted, textAlign: 'center', marginTop: space.md, maxWidth: 300 },
  actions: { gap: space.sm },
  problem: { ...font.caption, color: color.danger, textAlign: 'center', marginVertical: space.xs },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: space.xl,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  footerText: { ...font.label, color: color.textMuted },
  gate: { ...font.caption, color: color.textMuted, textAlign: 'center', marginBottom: space.xs },
  lead: { ...font.body, color: color.text },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  orLabel: { ...font.label, color: color.textMuted, marginTop: space.xl, marginBottom: space.sm },
  flex: { flex: 1, backgroundColor: color.bg },
  flex1: { flex: 1 },
  input: { ...font.body, color: color.text, backgroundColor: color.surfaceHigh, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: hit.gym },
  label: { ...font.label, color: color.text, fontWeight: '600', marginTop: space.lg, marginBottom: space.sm },
  pair: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, marginBottom: space.sm },
  choiceOn: { borderColor: color.accent },
  pressed: { backgroundColor: color.surfaceHigh },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  choiceTitle: { ...font.body, color: color.text, fontWeight: '600' },
  badge: { ...font.caption, color: color.accent, fontWeight: '700' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: color.accent, borderColor: color.accent },
  actionBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: layout.screenPadding, paddingTop: space.md, backgroundColor: color.bg, borderTopWidth: 1, borderTopColor: color.border },
});
