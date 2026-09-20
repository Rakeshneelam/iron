import { router } from 'expo-router';
import { useMemo, useState } from 'react';
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
import { kg } from '@/lib/format';
import { rescheduleAll } from '@/services/notifications';
import { color, font, hit, layout, radius, space } from '@/theme/tokens';

const OWN = 'own';
const MINUTES = [20, 30, 45, 60, 75].map((m) => ({ label: `${m}`, value: m }));
/** Only used to place the stepper somewhere sensible — never recorded on its own. */
const WEIGHT_ANCHOR_KG = 75;

/**
 * First run on a fresh install. One screen, no account, no network.
 *
 * It used to be four stages with a welcome screen wired to Firebase sign-in, which
 * contradicted the two hard rules this app is built on: no backend, and ONE setup
 * screen (AGENTS.md §1.1, §1.2). The staging was defensible on its own terms — a
 * single screen asking fourteen questions is where people put the phone down — so
 * the questions that change nothing for most people are folded behind "More
 * training detail" instead of behind a Next button.
 *
 * Google is not here at all. Drive authorisation is a backup permission, asked for
 * in Backup by someone who wants a backup; it was never an Iron account.
 */
export default function Setup() {
  const insets = useSafeAreaInsets();
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
  const [moreTraining, setMoreTraining] = useState(false);
  // Screen reserves a fixed allowance at the bottom; this bar is taller than that,
  // more so once the gate line appears. Measured, so it stays right.
  const [barHeight, setBarHeight] = useState(0);

  const profile: TrainingProfile = useMemo(
    () => ({ goal, level, daysPerWeek: days.length || 3, minutes, tools: new Set(PRESET_TOOLS[preset]), disliked: new Set(), limitations: new Set(limits) }),
    [goal, level, days.length, minutes, preset, limits],
  );
  const ranked = useMemo(() => recommendTemplates(profile, PLAN_TEMPLATES, CATALOG_BY_ID), [profile]);

  const choice = picked ?? ranked[0]?.template.id ?? OWN;
  const shown = showAll ? ranked : ranked.slice(0, 3);

  /** Why the button is off, or null when it is on. Never a dead control. */
  const blocker = !name.trim() ? 'Enter your name to finish.' : days.length === 0 ? 'Pick the days you can train.' : null;
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
    <View style={styles.flex}>
      <Screen title="Set up Iron" subtitle="Everything stays on this phone. No account, no sign-in.">
        <View style={styles.brand}>
          <Image source={require('../assets/icon.png')} style={styles.logo} accessibilityLabel="Iron" />
        </View>

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

        <Text style={styles.label}>Weight today (optional)</Text>
        <Stepper
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
        {weightGiven ? (
          <View style={styles.row}>
            <Text style={[styles.hint, styles.flex1]}>Saved as today&apos;s weigh-in when you finish.</Text>
            <PrimaryButton label="Don't record" tone="ghost" onPress={() => setWeightGiven(false)} />
          </View>
        ) : (
          <View style={styles.row}>
            <Text style={[styles.hint, styles.flex1]}>Skip it and no weigh-in is created. Targets use a calculation until you weigh in.</Text>
            {/* Explicit, because the number happening to equal the default is not an answer. */}
            <PrimaryButton label={`Use ${kg(weight)}`} tone="neutral" onPress={() => setWeightGiven(true)} />
          </View>
        )}

        <Text style={styles.label}>Body-weight goal</Text>
        <ChipRow options={GOALS} value={phase} onChange={setPhase} fill={false} />

        <Text style={styles.label}>Which days can you train?</Text>
        <ToggleChips options={WEEKDAYS} values={days} onToggle={(d) => setDays(toggle(days, d))} />
        <Text style={styles.hint}>Your plan runs in order whatever the day — these only set reminders.</Text>

        <Pressable
          onPress={() => setMoreTraining(!moreTraining)}
          accessibilityRole="button"
          accessibilityState={{ expanded: moreTraining }}
          style={styles.disclosure}
        >
          <Text style={styles.disclosureText}>More training detail</Text>
          <Icon name={moreTraining ? 'chevronUp' : 'chevronDown'} size={18} color={color.textMuted} />
        </Pressable>

        {moreTraining ? (
          <>
            <Text style={styles.label}>Main goal</Text>
            <ChipRow options={GOAL_OPTIONS} value={goal} onChange={setGoal} fill={false} />
            <Text style={styles.label}>Lifting experience</Text>
            <ChipRow options={LEVEL_OPTIONS} value={level} onChange={setLevel} fill={false} />
            <Text style={styles.label}>Minutes per session</Text>
            <ChipRow options={MINUTES} value={minutes} onChange={setMinutes} fill={false} />
            <Text style={styles.label}>Where do you train?</Text>
            <ChipRow options={PRESET_OPTIONS} value={preset} onChange={setPreset} fill={false} />
            <Text style={styles.label}>Anything to go easy on? (optional)</Text>
            <ToggleChips options={LIMITATION_OPTIONS} values={limits} onToggle={(v) => setLimits(toggle(limits, v))} />
            <Text style={styles.hint}>Only used to avoid exercises that load these areas, and it never leaves this phone. Not medical advice.</Text>
          </>
        ) : (
          <Text style={styles.hint}>Goal, experience, session length, equipment and anything to go easy on. All editable later.</Text>
        )}

        <Text style={styles.sectionLabel}>Your plan</Text>
        <Text style={styles.hint}>Fully editable, and you can switch any time.</Text>
        <View style={styles.planGap}>
          <Choice title="Build my own" subtitle="Start empty and add your own days and exercises" selected={choice === OWN} onPress={() => setPicked(OWN)} />
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
        </View>

        {/* Secondary, and clearly not part of setting up: this is for a new phone. */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Coming from another phone?</Text>
          <PrimaryButton label="Restore a backup" tone="ghost" onPress={() => router.push('/settings/restore')} />
        </View>

        <View style={{ height: clearance }} />
      </Screen>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + space.md }]} onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}>
        {blocker ? <Text style={styles.gate}>{blocker}</Text> : null}
        <PrimaryButton label="Finish setup" size="gym" disabled={blocker !== null} onPress={finish} />
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
  brand: { alignItems: 'center', marginBottom: space.lg },
  logo: { width: 72, height: 72, borderRadius: radius.lg },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xxl,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  footerText: { ...font.label, color: color.textMuted },
  gate: { ...font.caption, color: color.textMuted, textAlign: 'center', marginBottom: space.xs },
  flex: { flex: 1, backgroundColor: color.bg },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  input: { ...font.body, color: color.text, backgroundColor: color.surfaceHigh, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: hit.gym },
  label: { ...font.label, color: color.text, fontWeight: '600', marginTop: space.lg, marginBottom: space.sm },
  sectionLabel: { ...font.heading, color: color.text, marginTop: space.xxl },
  planGap: { marginTop: space.md },
  pair: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: hit.default, marginTop: space.lg },
  disclosureText: { ...font.label, color: color.text, fontWeight: '600' },
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
