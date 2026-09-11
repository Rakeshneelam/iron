import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, ChipRow, Icon, PrimaryButton, Screen, SectionHeader, Stepper } from '@/components';
import { PHASES, setSetting, useSettings } from '@/db/repositories/settings';
import { GOALS } from '@/features/settings/goals';
import { Row, TimeAdjuster } from '@/features/settings/Row';
import { exportAll } from '@/services/export';
import { openBatteryOptimisationSettings, rescheduleAll } from '@/services/notifications';
import { color, font, hit, radius, space } from '@/theme/tokens';


const ON_OFF = [
  { label: 'On', value: 1 },
  { label: 'Off', value: 0 },
] as const;

export default function SettingsScreen() {
  const s = useSettings();
  const [name, setName] = useState(s.name);
  useEffect(() => setName(s.name), [s.name]);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const bool = (key: 'calorieCycling' | 'hapticsEnabled' | 'restTimerAutoStart') => (
    <ChipRow options={ON_OFF} value={s[key] ? 1 : 0} onChange={(v) => setSetting(key, v === 1)} fill={false} />
  );

  return (
    <Screen title="Settings" right={<PrimaryButton label="Done" tone="ghost" onPress={() => router.back()} />}>
      <SectionHeader title="Profile" />
      <Card>
        <TextInput
          value={name}
          onChangeText={setName}
          onEndEditing={() => setSetting('name', name.trim())}
          placeholder="Your name"
          placeholderTextColor={color.textFaint}
          style={styles.input}
          accessibilityLabel="Your name"
        />
        <View style={styles.pair}>
          <Stepper label="Height" suffix="cm" value={s.heightCm} step={1} min={120} max={230} onChange={(v) => setSetting('heightCm', v)} />
          <Stepper label="Age" value={s.age} step={1} min={14} max={99} onChange={(v) => setSetting('age', v)} />
        </View>
        <Row label="Sex" hint="Used for the first calorie estimate only.">
          <ChipRow
            options={[
              { label: 'Male', value: 'male' },
              { label: 'Female', value: 'female' },
            ]}
            value={s.sex}
            onChange={(v) => setSetting('sex', v)}
            fill={false}
          />
        </Row>
        <Text style={styles.label}>Goal</Text>
        <ChipRow options={GOALS.filter((g) => PHASES.includes(g.value))} value={s.phase} onChange={(v) => setSetting('phase', v)} />
      </Card>

      <SectionHeader title="Workout" />
      <Card>
        <Row label="Auto-start rest timer">{bool('restTimerAutoStart')}</Row>
        <Row label="Haptics">{bool('hapticsEnabled')}</Row>
        <Stepper label="Typical session length" suffix="min" value={s.trainingMinutes} step={15} min={15} max={180} onChange={(v) => setSetting('trainingMinutes', v)} />
      </Card>
      <Card onPress={() => router.push('/settings/equipment')}>
        <View style={styles.linkRow}>
          <View style={styles.flex1}>
            <Text style={styles.link}>Gym equipment</Text>
            <Text style={styles.hint}>Plates, dumbbells, bars — suggestions only use weights you can load.</Text>
          </View>
          <Icon name="chevronRight" size={20} color={color.textMuted} />
        </View>
      </Card>
      <Card onPress={() => void openBatteryOptimisationSettings()}>
        <View style={styles.linkRow}>
          <View style={styles.flex1}>
            <Text style={styles.link}>Battery optimisation</Text>
            <Text style={styles.hint}>Lets the rest timer run with the screen off.</Text>
          </View>
          <Icon name="chevronRight" size={20} color={color.textMuted} />
        </View>
      </Card>

      <SectionHeader title="Day & reminders" />
      <Card>
        <Row label="Wake">
          <TimeAdjuster value={s.wakeMinutes} max={s.sleepMinutes - 60} onChange={(v) => { setSetting('wakeMinutes', v); void rescheduleAll(); }} />
        </Row>
        <Row label="Sleep" hint="No reminder outside these hours.">
          <TimeAdjuster value={s.sleepMinutes} min={s.wakeMinutes + 60} onChange={(v) => { setSetting('sleepMinutes', v); void rescheduleAll(); }} />
        </Row>
      </Card>

      <SectionHeader title="Water & food" />
      <Card>
        <Text style={styles.label}>Water target</Text>
        <ChipRow
          options={[
            { label: 'Auto', value: 0 },
            { label: '2.5 L', value: 2500 },
            { label: '3 L', value: 3000 },
            { label: '3.5 L', value: 3500 },
            { label: '4 L', value: 4000 },
          ]}
          value={s.hydrationOverrideMl ?? 0}
          onChange={(v) => { setSetting('hydrationOverrideMl', v === 0 ? null : v); void rescheduleAll(); }}
          fill={false}
        />
        <Text style={styles.hint}>Auto = 33 ml per kg, plus training and heat.</Text>
        <Text style={styles.label}>Hot weather</Text>
        <ChipRow
          options={[
            { label: 'Off', value: 0 },
            { label: '32°', value: 32 },
            { label: '36°', value: 36 },
            { label: '40°', value: 40 },
          ]}
          value={s.ambientTempC ?? 0}
          onChange={(v) => { setSetting('ambientTempC', v === 0 ? null : v); void rescheduleAll(); }}
        />
        <Row label="Calorie cycling" hint="+8% on training days, −8% on rest days.">{bool('calorieCycling')}</Row>
      </Card>

      <SectionHeader title="Your data" />
      <Card>
        <Text style={styles.body}>Export everything</Text>
        <Text style={styles.hint}>
          A structured JSON file you can hand to a coach or an AI assistant (plans, every workout with planned vs done, body, water, weekly
          summaries), CSV files for spreadsheets, and a full backup.
        </Text>
        <PrimaryButton
          label={exporting ? 'Exporting…' : 'Export to a folder'}
          tone="neutral"
          disabled={exporting}
          icon={<Icon name="export" size={18} />}
          style={styles.gap}
          onPress={() => {
            setExportMsg(null);
            setExporting(true);
            exportAll()
              .then(
                (n) => setExportMsg(n === null ? null : `Saved ${n} files.`),
                (e: unknown) => setExportMsg(`Export failed: ${e instanceof Error ? e.message : String(e)}`),
              )
              .finally(() => setExporting(false));
          }}
        />
        {exportMsg ? <Text style={styles.hint}>{exportMsg}</Text> : null}
      </Card>
      <Text style={styles.footer}>
        Iron {Constants.expoConfig?.version ?? ''} · all data stays on this phone. Each phone has its own profile, plans and history.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  input: {
    ...font.body,
    color: color.text,
    backgroundColor: color.surfaceHigh,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: hit.default,
  },
  pair: { flexDirection: 'row', gap: space.md, marginVertical: space.md },
  label: { ...font.caption, color: color.textMuted, marginTop: space.md, marginBottom: space.xs },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  link: { ...font.body, color: color.text },
  body: { ...font.body, color: color.text, fontWeight: '600' },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  gap: { marginTop: space.md },
  footer: { ...font.caption, color: color.textFaint, textAlign: 'center', marginTop: space.lg },
});
