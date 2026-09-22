import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChipRow, PrimaryButton, Screen, SectionHeader, SegmentTabs, Stepper, TextField, toast, ToggleChips } from '@/components';
import { CATALOG_BY_ID, type Level, type Stress } from '@/data/catalog';
import { PLAN_TEMPLATES, type EquipmentPreset, type Goal } from '@/data/templates';
import { getLatestWeight, upsertWeighIn } from '@/db/repositories/body';
import { createPlan } from '@/db/repositories/program';
import { getSettings, setSetting } from '@/db/repositories/settings';
import type { Phase, Sex } from '@/engine/metabolic';
import { adaptTemplate, PRESET_TOOLS, recommendTemplates, type TrainingProfile } from '@/engine/planner';
import { GOAL_OPTIONS, LEVEL_OPTIONS, LIMITATION_OPTIONS, PRESET_OPTIONS, toggle, WEEKDAYS } from '@/features/profile';
import { GOALS } from '@/features/settings/goals';
import { Field } from '@/features/settings/ProfileFields';
import { todayISO } from '@/lib/date';
import { kg } from '@/lib/format';
import { rescheduleAll } from '@/services/notifications';
import { color, font, hit, radius, space } from '@/theme/tokens';

const OWN = 'own';
const MINUTES = [20, 30, 45, 60, 75].map((m) => ({ label: `${m}`, value: m }));
const TABS = [
  { label: 'You', value: 'you' as const },
  { label: 'Training', value: 'training' as const },
  { label: 'Plan', value: 'plan' as const },
];
type Tab = (typeof TABS)[number]['value'];
/** Only used to place the stepper somewhere sensible — never recorded on its own. */
const WEIGHT_ANCHOR_KG = 75;

/**
 * First run on a fresh install. One screen, no account, no network.
 *
 * It used to be four stages with a welcome screen wired to Firebase sign-in, which
 * contradicted the two hard rules this app is built on: no backend, and ONE setup
 * screen (AGENTS.md §1.1, §1.2). A single page of fourteen questions is where
 * people put the phone down, so the screen is split into You · Training · Plan
 * tabs — sections of one screen, not steps. Finish is in the dock on every tab,
 * and only the name is required; everything else has a default.
 *
 * Google is not here at all. Drive authorisation is a backup permission, asked for
 * in Backup by someone who wants a backup; it was never an Iron account.
 */
export default function Setup() {
  const [tab, setTab] = useState<Tab>('you');
  const [initial] = useState(getSettings);
  const [name, setName] = useState(initial.name);
  const [sex, setSex] = useState<Sex>(initial.sex);
  const [age, setAge] = useState(initial.age);
  const [height, setHeight] = useState(initial.heightCm);
  const [weight, setWeight] = useState(() => getLatestWeight() ?? WEIGHT_ANCHOR_KG);
  /**
   * Whether the number above is a reading or just where the stepper happens to sit.
   * Setup used to default to 70 kg and write a weigh-in unconditionally, so every
   * install began its weight history with a measurement nobody took, and the trend
   * line started from a fiction (UX-12).
   */
  const [weightGiven, setWeightGiven] = useState(false);
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

  /** What still needs an answer, and which tab it is on. Never a dead control. */
  const blocker: { text: string; tab: Tab } | null = !name.trim()
    ? { text: 'Enter your name to finish.', tab: 'you' }
    : days.length === 0
      ? { text: 'Pick the days you can train.', tab: 'training' }
      : null;

  const finish = () => {
    if (blocker) {
      setTab(blocker.tab);
      toast(blocker.text);
      return;
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
    // Only an explicitly confirmed number becomes a weigh-in. Skipped, the targets
    // fall back to a calculation — which is never dressed up as a measurement.
    if (weightGiven) upsertWeighIn(todayISO(), weight);
    const t = PLAN_TEMPLATES.find((x) => x.id === choice);
    if (t) {
      const adapted = adaptTemplate(t, profile, CATALOG_BY_ID);
      createPlan({ name: t.name, daysPerWeek: days.length || t.daysPerWeek, days: adapted.days }, { activate: true });
      if (adapted.swaps.length) toast(`Plan ready — ${adapted.swaps.length} ${adapted.swaps.length === 1 ? 'exercise' : 'exercises'} swapped for your equipment`);
    }
    setSetting('setupDone', true);
    // Reminders are off until asked for; this only lays down the channels.
    void rescheduleAll();
    router.replace(t ? '/' : '/program');
  };

  return (
    <Screen
      title="Set up Iron"
      subtitle="One screen. Stays on this phone."
      right={<Image source={require('../assets/icon.png')} style={styles.logo} accessibilityLabel="Iron" />}
      strip={<SegmentTabs options={TABS} value={tab} onChange={setTab} />}
      dock={
        <>
          <Text style={[styles.gate, blocker && styles.gateOn]}>{blocker ? blocker.text : 'Only your name is required. Everything else has a sensible default.'}</Text>
          <PrimaryButton label="Finish setup" size="gym" onPress={finish} />
        </>
      }
    >
      {tab === 'you' ? (
        <View style={styles.stack}>
          <Text style={styles.lead}>Used only to work out your calorie and water targets, and nothing leaves this phone. No account, no sign-in.</Text>
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
          <Field
            label={weightGiven ? 'Weight today' : 'Weight today · optional'}
            hint={weightGiven ? "Saved as today's weigh-in when you finish." : 'Skip it and no weigh-in is created. Targets use a calculation until you weigh in.'}
          >
            <View style={styles.weight}>
              <View style={styles.flex1}>
                <Stepper
                  accessibilityLabel="Weight today"
                  size="gym"
                  suffix="kg"
                  value={weight}
                  step={0.5}
                  min={30}
                  max={250}
                  onChange={(v) => {
                    setWeight(v);
                    setWeightGiven(true);
                  }}
                />
              </View>
              {/* Explicit, because the number happening to equal the default is not an answer. */}
              {weightGiven ? (
                <PrimaryButton label="Don’t record" tone="neutral" size="gym" onPress={() => setWeightGiven(false)} />
              ) : (
                <PrimaryButton label={`Use ${kg(weight)}`} tone="neutral" size="gym" onPress={() => setWeightGiven(true)} />
              )}
            </View>
          </Field>
          <Field label="Body-weight goal" hint="Sets your calorie and water targets.">
            <ChipRow options={GOALS} value={phase} onChange={setPhase} columns={4} />
          </Field>
        </View>
      ) : null}

      {tab === 'training' ? (
        <View style={styles.stack}>
          <Field label="Main goal">
            <ChipRow options={GOAL_OPTIONS} value={goal} onChange={setGoal} columns={3} />
          </Field>
          <Field label="Lifting experience">
            <ChipRow options={LEVEL_OPTIONS} value={level} onChange={setLevel} columns={3} />
          </Field>
          <Field label="Days you can train" hint="Your plan runs in order whatever the day. These only set reminders.">
            <ToggleChips options={WEEKDAYS} values={days} onToggle={(d) => setDays(toggle(days, d))} columns={7} />
          </Field>
          <Field label="Minutes per session">
            <ChipRow options={MINUTES} value={minutes} onChange={setMinutes} columns={5} />
          </Field>
          <Field label="Where do you train?">
            <ChipRow options={PRESET_OPTIONS} value={preset} onChange={setPreset} columns={3} />
          </Field>
        </View>
      ) : null}

      {tab === 'plan' ? (
        <View style={styles.stack}>
          <Field label="Go easy on" hint="Optional. Used only to skip exercises that load these areas, and it never leaves this phone.">
            <ToggleChips options={LIMITATION_OPTIONS} values={limits} onToggle={(v) => setLimits(toggle(limits, v))} columns={3} />
          </Field>
          <View>
            <SectionHeader title="Your plan" action={!showAll && ranked.length > 3 ? { label: `See all ${ranked.length}`, onPress: () => setShowAll(true) } : undefined} />
            {shown.map((m, i) => (
              <Choice
                key={m.template.id}
                title={m.template.name}
                subtitle={`${m.template.daysPerWeek} days · about ${m.template.minutes} min · ${m.reasons.slice(0, 2).join(', ')}`}
                badge={i === 0 ? 'Best match' : undefined}
                selected={choice === m.template.id}
                onPress={() => setPicked(m.template.id)}
              />
            ))}
            <Choice title="Build my own" subtitle="Start empty and add your own days and exercises" selected={choice === OWN} onPress={() => setPicked(OWN)} />
            <Text style={styles.hint}>Fully editable, and you can switch plans any time.</Text>
          </View>
        </View>
      ) : null}

      {/* Secondary, and clearly not part of setting up: this is for a new phone. */}
      <PrimaryButton label="Restore a backup from another phone" tone="neutral" style={styles.restore} onPress={() => router.push('/settings/restore')} />
    </Screen>
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
        <Text style={styles.choiceSub}>{subtitle}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  logo: { width: 36, height: 36, borderRadius: radius.md, marginTop: space.xs },
  stack: { gap: space.md + 2 },
  flex1: { flex: 1 },
  lead: { ...font.caption, color: color.textMuted },
  input: { minHeight: hit.gym, borderWidth: 1, borderColor: color.border },
  pair: { flexDirection: 'row', gap: space.md - 2 },
  weight: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  gate: { ...font.caption, fontSize: 12, color: color.textFaint, textAlign: 'center' },
  gateOn: { color: color.warning },
  hint: { ...font.caption, fontSize: 12, color: color.textFaint, marginTop: space.xs },
  restore: { marginTop: space.xxl },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 68, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, marginBottom: space.sm },
  choiceOn: { borderColor: color.accent },
  pressed: { backgroundColor: color.surfaceHigh },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' },
  choiceTitle: { ...font.label, color: color.text, fontWeight: '600' },
  choiceSub: { ...font.caption, fontSize: 12, color: color.textFaint, marginTop: 2 },
  badge: { ...font.caption, fontSize: 12, color: color.accent, fontWeight: '700' },
  radio: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 2, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: color.accent },
  radioDot: { width: 12, height: 12, borderRadius: radius.pill, backgroundColor: color.accent },
});
