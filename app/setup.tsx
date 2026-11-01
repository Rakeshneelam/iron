import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipRow, Icon, Press, PrimaryButton, Screen, SectionHeader, SegmentTabs, Stepper, TextField, toast, ToggleChips, WeekdayPicker, type IconName } from '@/components';
import { CATALOG_BY_ID, type Level, type Stress } from '@/data/catalog';
import { PLAN_TEMPLATES, type EquipmentPreset, type Goal } from '@/data/templates';
import { getLatestWeight, upsertWeighIn } from '@/db/repositories/body';
import { createPlan } from '@/db/repositories/program';
import { getSettings, setSetting } from '@/db/repositories/settings';
import type { Phase, Sex } from '@/engine/metabolic';
import { adaptTemplate, PRESET_TOOLS, recommendTemplates, type TrainingProfile } from '@/engine/planner';
import { WeightField, type WeightDraft } from '@/features/body/WeightField';
import { GOAL_OPTIONS, LEVEL_OPTIONS, LIMITATION_OPTIONS, PRESET_OPTIONS, toggle } from '@/features/profile';
import { GOALS } from '@/features/settings/goals';
import { Field } from '@/features/settings/ProfileFields';
import { todayISO } from '@/lib/date';
import { rescheduleAll } from '@/services/notifications';
import { color, font, hit, radius, space } from '@/theme/tokens';

const OWN = 'own';
const MINUTES = [20, 30, 45, 60, 75].map((m) => ({ label: `${m}`, value: m }));
const STEPS = [
  { label: 'You', value: 'you' as const },
  { label: 'Training', value: 'training' as const },
  { label: 'Plan', value: 'plan' as const },
];
type Step = (typeof STEPS)[number]['value'];
/** Only where the weight stepper starts once asked for — never recorded on its own. */
const WEIGHT_ANCHOR_KG = 75;

/**
 * First run on a fresh install. No account, no network.
 *
 * Before it, once, the welcome: what Iron is and the way in from another phone. It
 * is this route's first state, not a route of its own, so it only ever appears on
 * a fresh install.
 *
 * Then one screen in three steps — You, Training, Plan — walked with Next and
 * closed with Finish, so nobody skips two-thirds of it by tapping Finish on the
 * first page. The steps stay tappable for going back. Only the name is required.
 */
export default function Setup() {
  const insets = useSafeAreaInsets();
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState<Step>('you');
  const [initial] = useState(getSettings);
  const [name, setName] = useState(initial.name);
  const [sex, setSex] = useState<Sex>(initial.sex);
  const [age, setAge] = useState(initial.age);
  const [height, setHeight] = useState(initial.heightCm);
  const [weight, setWeight] = useState<WeightDraft>(() => ({ kg: getLatestWeight() ?? WEIGHT_ANCHOR_KG, given: false, existing: false }));
  const [phase, setPhase] = useState<Phase>(initial.phase);
  const [goal, setGoal] = useState<Goal>(initial.goalFocus);
  const [level, setLevel] = useState<Level>('beginner');
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [minutes, setMinutes] = useState(45);
  const [preset, setPreset] = useState<EquipmentPreset>('gym');
  const [limits, setLimits] = useState<Stress[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const profile: TrainingProfile = useMemo(
    () => ({ goal, level, daysPerWeek: days.length || 3, minutes, tools: new Set(PRESET_TOOLS[preset]), disliked: new Set(), limitations: new Set(limits) }),
    [goal, level, days.length, minutes, preset, limits],
  );
  const ranked = useMemo(() => recommendTemplates(profile, PLAN_TEMPLATES, CATALOG_BY_ID), [profile]);

  const choice = picked ?? ranked[0]?.template.id ?? OWN;
  const shown = showAll ? ranked : ranked.slice(0, 3);

  if (!started) {
    return (
      <View style={[styles.welcome, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.brandRow}>
          <Image source={require('../assets/icon.png')} style={styles.brandLogo} accessibilityLabel="Iron" />
          <Text style={styles.wordmark}>IRON</Text>
        </View>
        <WelcomeArt />
        <Text style={styles.hello} accessibilityRole="header">
          Log the set.{'\n'}
          <Text style={styles.helloVolt}>Skip the noise.</Text>
        </Text>
        <Text style={styles.pitch}>Training, food, water and body in one place.</Text>
        <View style={styles.welcomeActions}>
          <PrimaryButton label="Get started" size="gym" icon={<Icon name="chevronRight" size={22} color={color.onAccent} />} onPress={() => setStarted(true)} />
          {/* For a new phone, not part of starting: a quiet line, not a second pill. */}
          <Press onPress={() => router.push('/settings/restore')} accessibilityRole="button" accessibilityLabel="Restore a backup from another phone" hitSlop={10} style={styles.restore}>
            <Text style={styles.restoreText}>
              Have a backup? <Text style={styles.restoreLink}>Restore it</Text>
            </Text>
          </Press>
        </View>
      </View>
    );
  }

  const index = STEPS.findIndex((s) => s.value === step);
  const last = index === STEPS.length - 1;

  /** What still needs an answer before moving on. Never a dead button. */
  const blocker = (s: Step): string | null => (s === 'you' && !name.trim() ? 'Enter your name first.' : s === 'training' && days.length === 0 ? 'Pick at least one day.' : null);

  const next = () => {
    const why = blocker(step);
    if (why) {
      toast(why);
      return;
    }
    const to = STEPS[index + 1];
    if (to) setStep(to.value);
  };

  const finish = () => {
    for (const s of STEPS) {
      const why = blocker(s.value);
      if (why) {
        setStep(s.value);
        toast(why);
        return;
      }
    }
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
    // Only a weight actually given becomes a weigh-in; skipped, the targets use a calculation.
    if (weight.given) upsertWeighIn(todayISO(), weight.kg);
    const t = PLAN_TEMPLATES.find((x) => x.id === choice);
    if (t) {
      const adapted = adaptTemplate(t, profile, CATALOG_BY_ID);
      createPlan({ name: t.name, daysPerWeek: days.length || t.daysPerWeek, days: adapted.days }, { activate: true });
      if (adapted.swaps.length) toast(`Plan ready — ${adapted.swaps.length} ${adapted.swaps.length === 1 ? 'exercise' : 'exercises'} swapped for your equipment`);
    }
    setSetting('setupDone', true);
    // Reminders are off until asked for; this only lays down the channels.
    void rescheduleAll();
    // Always Today, plan or not (AGENTS §1.2): Today logs a workout with no plan at all.
    router.replace('/');
  };

  return (
    <Screen
      // Keyed by step, so each step opens at its top rather than where the last one was scrolled.
      key={step}
      title="Set up"
      subtitle={`Step ${index + 1} of ${STEPS.length}`}
      back={() => (index > 0 ? setStep(STEPS[index - 1]?.value ?? 'you') : setStarted(false))}
      strip={<SegmentTabs options={STEPS} value={step} onChange={setStep} />}
      dock={
        last ? (
          <PrimaryButton label="Finish setup" size="gym" icon={<Icon name="check" size={22} color={color.onAccent} />} onPress={finish} />
        ) : (
          <PrimaryButton label="Next" size="gym" icon={<Icon name="chevronRight" size={22} color={color.onAccent} />} onPress={next} />
        )
      }
    >
      {step === 'you' ? (
        <View style={styles.stack}>
          <Field label="Your name">
            <TextField value={name} onCommit={setName} onType={setName} placeholder="Your name" autoCapitalize="words" accessibilityLabel="Your name, required" style={styles.input} />
          </Field>
          <Field label="Sex">
            <ChipRow
              options={[
                { label: 'Male', value: 'male' },
                { label: 'Female', value: 'female' },
              ]}
              value={sex}
              onChange={setSex}
              columns={2}
            />
          </Field>
          <View style={styles.pair}>
            <View style={styles.flex1}>
              <Field label="Age">
                <Stepper accessibilityLabel="Age" size="gym" value={age} step={1} min={14} max={99} onChange={setAge} />
              </Field>
            </View>
            <View style={styles.flex1}>
              <Field label="Height">
                <Stepper accessibilityLabel="Height" size="gym" suffix="cm" value={height} step={1} min={120} max={230} onChange={setHeight} />
              </Field>
            </View>
          </View>
          <Field label="Weight today (optional)">
            <WeightField draft={weight} onChange={setWeight} size="gym" addLabel="Add today's weight" />
          </Field>
          <Field label="Body-weight goal">
            <ChipRow options={GOALS} value={phase} onChange={setPhase} columns={4} />
          </Field>
        </View>
      ) : null}

      {step === 'training' ? (
        <View style={styles.stack}>
          <Field label="Main goal">
            <ChipRow options={GOAL_OPTIONS} value={goal} onChange={setGoal} columns={3} />
          </Field>
          <Field label="Lifting experience">
            <ChipRow options={LEVEL_OPTIONS} value={level} onChange={setLevel} columns={3} />
          </Field>
          <Field label="Training days">
            <WeekdayPicker values={days} onToggle={(d) => setDays(toggle(days, d))} />
          </Field>
          <Field label="Minutes per session">
            <ChipRow options={MINUTES} value={minutes} onChange={setMinutes} columns={5} />
          </Field>
          <Field label="Where do you train?">
            <ChipRow options={PRESET_OPTIONS} value={preset} onChange={setPreset} columns={3} />
          </Field>
        </View>
      ) : null}

      {step === 'plan' ? (
        <View style={styles.stack}>
          <View>
            <SectionHeader title="Your plan" action={!showAll && ranked.length > 3 ? { label: `See all ${ranked.length}`, onPress: () => setShowAll(true) } : undefined} />
            {shown.map((m, i) => (
              <Choice
                key={m.template.id}
                title={m.template.name}
                subtitle={`${m.template.daysPerWeek} days, about ${m.template.minutes} min`}
                badge={i === 0 ? 'Best match' : undefined}
                selected={choice === m.template.id}
                onPress={() => setPicked(m.template.id)}
              />
            ))}
            <Choice title="Build my own" subtitle="Start empty" selected={choice === OWN} onPress={() => setPicked(OWN)} />
          </View>
          <Field label="Go easy on (optional)">
            <ToggleChips options={LIMITATION_OPTIONS} values={limits} onToggle={(v) => setLimits(toggle(limits, v))} columns={3} />
          </Field>
        </View>
      ) : null}
    </Screen>
  );
}

const ART: readonly { icon: IconName; tint: string; size: number; x: number; y: number; turn: string }[] = [
  { icon: 'dumbbell', tint: color.accent, size: 132, x: 4, y: 18, turn: '-8deg' },
  { icon: 'water', tint: color.cold, size: 96, x: 150, y: 0, turn: '9deg' },
  { icon: 'food', tint: color.peach, size: 88, x: 132, y: 116, turn: '-5deg' },
  { icon: 'body', tint: color.lav, size: 78, x: 236, y: 92, turn: '12deg' },
];

/** The four things Iron tracks, as tiles in their own colours. Decoration only. */
function WelcomeArt() {
  return (
    <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.artInner}>
        {ART.map((a) => (
          <View key={a.icon} style={[styles.artTile, { width: a.size, height: a.size, left: a.x, top: a.y, backgroundColor: a.tint, transform: [{ rotate: a.turn }] }]}>
            <Icon name={a.icon} size={a.size * 0.38} color={color.onTile} strokeWidth={2.2} />
          </View>
        ))}
      </View>
    </View>
  );
}

function Choice({ title, subtitle, selected, badge, onPress }: { title: string; subtitle: string; selected: boolean; badge?: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} feedback="highlight" style={[styles.choice, selected && styles.choiceOn]} pressedStyle={styles.pressed}>
      <View style={styles.flex1}>
        <View style={styles.titleRow}>
          <Text style={styles.choiceTitle}>{title}</Text>
          {badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.choiceSub}>{subtitle}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
    </Press>
  );
}

const styles = StyleSheet.create({
  welcome: { flex: 1, backgroundColor: color.bg, paddingHorizontal: space.xl },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  brandLogo: { width: 40, height: 40, borderRadius: radius.md },
  wordmark: { ...font.heading, fontWeight: '800', letterSpacing: 2, color: color.text },
  art: { flex: 1, minHeight: 230, marginVertical: space.lg, alignItems: 'center', justifyContent: 'center' },
  artInner: { width: 314, height: 216 },
  artTile: { position: 'absolute', borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  hello: { ...font.title, fontSize: 52, lineHeight: 54, letterSpacing: -1, color: color.text, paddingRight: space.xs },
  helloVolt: { color: color.accent },
  pitch: { ...font.body, color: color.textMuted, marginTop: space.md },
  welcomeActions: { gap: space.lg, marginTop: space.xl },
  restore: { alignSelf: 'center', paddingVertical: space.xs },
  restoreText: { ...font.label, fontWeight: '600', color: color.textMuted },
  restoreLink: { color: color.accent, fontWeight: '800' },
  stack: { gap: space.lg },
  flex1: { flex: 1 },
  input: { minHeight: hit.gym },
  pair: { flexDirection: 'row', gap: space.md - 2 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 72, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.lg, borderWidth: 1.5, borderColor: 'transparent', backgroundColor: color.surface, marginBottom: space.sm },
  choiceOn: { borderColor: color.accent },
  pressed: { backgroundColor: color.surfaceHigh },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  choiceTitle: { ...font.label, color: color.text },
  choiceSub: { ...font.caption, fontSize: 12, color: color.textFaint, marginTop: 2 },
  badge: { height: 22, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: color.accentWash, justifyContent: 'center' },
  badgeText: { ...font.caption, fontSize: 11, lineHeight: 14, fontWeight: '800', color: color.accent },
  radio: { width: 26, height: 26, borderRadius: radius.pill, borderWidth: 2, borderColor: color.rule, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: color.accent, backgroundColor: color.accent },
  radioDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: color.onAccent },
});
