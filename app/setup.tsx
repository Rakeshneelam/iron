import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipRow, Icon, PrimaryButton, Screen, SectionHeader, Stepper, toast, ToggleChips } from '@/components';
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
import { rescheduleAll } from '@/services/notifications';
import { color, font, hit, layout, radius, space } from '@/theme/tokens';

const OWN = 'own';
const MINUTES = [20, 30, 45, 60, 75].map((m) => ({ label: `${m}`, value: m }));

/**
 * First run on a fresh install: one screen, only questions that change what we
 * recommend. Each phone keeps its own data — nothing is shared between installs.
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

  const profile: TrainingProfile = useMemo(
    () => ({ goal, level, daysPerWeek: days.length || 3, minutes, tools: new Set(PRESET_TOOLS[preset]), disliked: new Set(), limitations: new Set(limits) }),
    [goal, level, days.length, minutes, preset, limits],
  );
  const ranked = useMemo(() => recommendTemplates(profile, PLAN_TEMPLATES, CATALOG_BY_ID), [profile]);
  const choice = picked ?? ranked[0]?.template.id ?? OWN;
  const shown = showAll ? ranked : ranked.slice(0, 3);

  const ready = name.trim().length > 0 && days.length > 0;

  // Screen reserves layout.actionBarHeight at the bottom, but this bar is taller than
  // that — more so once the gate line appears — which was hiding the last question
  // behind it. Measured, so it stays right whatever the bar ends up containing.
  const [barHeight, setBarHeight] = useState(0);
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
      <Screen title="Welcome to Iron" subtitle="Two minutes. Everything stays on this phone.">
        {/* At the top, not the bottom: someone reinstalling is being asked their height
            while the thing they want is their training history. */}
        <PrimaryButton
          label="Already using Iron? Restore a backup"
          tone="ghost"
          onPress={() => router.push('/settings/restore')}
        />

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={color.textFaint}
          style={styles.input}
          autoCapitalize="words"
          accessibilityLabel="Your name, required"
        />

        <SectionHeader title="Training" />
        <Text style={styles.label}>Main goal</Text>
        <ChipRow options={GOAL_OPTIONS} value={goal} onChange={setGoal} />
        <Text style={styles.label}>Lifting experience</Text>
        <ChipRow options={LEVEL_OPTIONS} value={level} onChange={setLevel} />
        <Text style={styles.label}>Which days can you train?</Text>
        <ToggleChips options={WEEKDAYS} values={days} onToggle={(d) => setDays(toggle(days, d))} />
        <Text style={styles.label}>Minutes per session</Text>
        <ChipRow options={MINUTES} value={minutes} onChange={setMinutes} />
        <Text style={styles.label}>Where do you train?</Text>
        <ChipRow options={PRESET_OPTIONS} value={preset} onChange={setPreset} fill={false} />
        <Text style={styles.label}>Anything to go easy on? (optional)</Text>
        <ToggleChips options={LIMITATION_OPTIONS} values={limits} onToggle={(v) => setLimits(toggle(limits, v))} />
        <Text style={styles.hint}>Only used to avoid exercises that load these areas. Not medical advice — check with a professional if something hurts.</Text>

        <SectionHeader title="About you" />
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
        <ChipRow options={GOALS} value={phase} onChange={setPhase} />
        <Text style={styles.hint}>Used for water and calorie targets. Long-press a number to type it.</Text>

        <SectionHeader title="Your plan" />
        {shown.map((m, i) => (
          <Choice
            key={m.template.id}
            title={m.template.name}
            subtitle={`${m.template.daysPerWeek} days · ~${m.template.minutes} min · ${m.reasons.slice(0, 2).join(' · ')}`}
            badge={i === 0 && !showAll ? 'Best match' : undefined}
            selected={choice === m.template.id}
            onPress={() => setPicked(m.template.id)}
          />
        ))}
        {!showAll ? <PrimaryButton label="See all plans" tone="ghost" onPress={() => setShowAll(true)} /> : null}
        <Choice title="Build my own" subtitle="Start empty and add days and exercises" selected={choice === OWN} onPress={() => setPicked(OWN)} />
        <Text style={styles.hint}>Every plan is fully editable, and you can keep several and switch any time.</Text>
        <View style={{ height: clearance }} />
      </Screen>
      <View
        style={[styles.actionBar, { paddingBottom: insets.bottom + space.md }]}
        onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
      >
        {/* Says which thing is missing rather than leaving a dead button. */}
        {!ready ? <Text style={styles.gate}>{name.trim() ? 'Pick the days you can train.' : 'Enter your name to continue.'}</Text> : null}
        <PrimaryButton label="Let's go" size="gym" disabled={!ready} onPress={finish} />
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
  gate: { ...font.caption, color: color.textMuted, textAlign: 'center', marginBottom: space.xs },
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
