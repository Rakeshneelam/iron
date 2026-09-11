import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipRow, Icon, PrimaryButton, Screen, SectionHeader, Stepper } from '@/components';
import { getLatestWeight, upsertWeighIn } from '@/db/repositories/body';
import { createPlan } from '@/db/repositories/program';
import { getSettings, setSetting } from '@/db/repositories/settings';
import { PLAN_TEMPLATES } from '@/db/seed/templates';
import type { Phase, Sex } from '@/engine/metabolic';
import { GOALS } from '@/features/settings/goals';
import { todayISO } from '@/lib/date';
import { rescheduleAll } from '@/services/notifications';
import { color, font, hit, layout, radius, space } from '@/theme/tokens';

const OWN = 'own';

/**
 * First run on a fresh install: one screen, everything optional except a plan
 * choice. Each phone keeps its own data — nothing is shared between installs.
 */
export default function Setup() {
  const insets = useSafeAreaInsets();
  const [initial] = useState(getSettings);
  const [name, setName] = useState(initial.name);
  const [sex, setSex] = useState<Sex>(initial.sex);
  const [age, setAge] = useState(initial.age);
  const [height, setHeight] = useState(initial.heightCm);
  const [weight, setWeight] = useState(() => getLatestWeight() ?? 70);
  const [goal, setGoal] = useState<Phase>(initial.phase);
  const [plan, setPlan] = useState<string>(PLAN_TEMPLATES[0]?.id ?? OWN);

  const finish = () => {
    setSetting('name', name.trim());
    setSetting('sex', sex);
    setSetting('age', age);
    setSetting('heightCm', height);
    setSetting('phase', goal);
    upsertWeighIn(todayISO(), weight);
    const t = PLAN_TEMPLATES.find((x) => x.id === plan);
    if (t) createPlan({ name: t.name, daysPerWeek: t.daysPerWeek, days: t.days }, { activate: true });
    setSetting('setupDone', true);
    void rescheduleAll();
    router.replace(t ? '/' : '/program');
  };

  return (
    <View style={styles.flex}>
      <Screen title="Welcome to Iron" subtitle="A minute of setup. Everything stays on this phone.">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name (optional)"
          placeholderTextColor={color.textFaint}
          style={styles.input}
          autoCapitalize="words"
        />

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
        <Text style={styles.hint}>Used for water and calorie targets. Long-press a number to type it.</Text>

        <SectionHeader title="Goal" />
        <ChipRow options={GOALS} value={goal} onChange={setGoal} />

        <SectionHeader title="Pick a plan" />
        {PLAN_TEMPLATES.map((t) => (
          <Choice key={t.id} title={t.name} subtitle={t.summary} selected={plan === t.id} onPress={() => setPlan(t.id)} />
        ))}
        <Choice title="Build my own" subtitle="Start empty and add days and exercises" selected={plan === OWN} onPress={() => setPlan(OWN)} />
        <Text style={styles.hint}>Every plan is fully editable, and you can keep several and switch any time.</Text>
      </Screen>
      <View style={[styles.actionBar, { paddingBottom: insets.bottom + space.md }]}>
        <PrimaryButton label="Let's go" size="gym" onPress={finish} />
      </View>
    </View>
  );
}

function Choice({ title, subtitle, selected, onPress }: { title: string; subtitle: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.choice, selected && styles.choiceOn, pressed && styles.pressed]}
    >
      <View style={styles.flex1}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.hint}>{subtitle}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <Icon name="check" size={16} color={color.onAccent} /> : null}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  flex1: { flex: 1 },
  input: {
    ...font.body,
    color: color.text,
    backgroundColor: color.surfaceHigh,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: hit.gym,
  },
  pair: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    marginBottom: space.sm,
  },
  choiceOn: { borderColor: color.accent },
  pressed: { backgroundColor: color.surfaceHigh },
  choiceTitle: { ...font.body, color: color.text, fontWeight: '600' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: color.accent, borderColor: color.accent },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    backgroundColor: color.bg,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
});
