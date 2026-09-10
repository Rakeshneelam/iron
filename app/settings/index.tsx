import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, PrimaryButton, Screen, SectionHeader, Stepper } from '@/components';
import { PHASES, setSetting, useSettings } from '@/db/repositories/settings';
import { Row, TimeAdjuster } from '@/features/settings/Row';
import { exportAll } from '@/services/export';
import { openBatteryOptimisationSettings, rescheduleAll } from '@/services/notifications';
import { color, font, space } from '@/theme/tokens';

const ON_OFF = [
  { label: 'On', value: 1 },
  { label: 'Off', value: 0 },
] as const;

export default function SettingsScreen() {
  const s = useSettings();
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const bool = (key: 'calorieCycling' | 'hapticsEnabled' | 'restTimerAutoStart') => (
    <ChipRow options={ON_OFF} value={s[key] ? 1 : 0} onChange={(v) => setSetting(key, v === 1)} fill={false} />
  );

  return (
    <Screen title="Settings" right={<PrimaryButton label="Done" tone="ghost" onPress={() => router.back()} />}>
      <SectionHeader title="Phase" />
      <ChipRow
        options={PHASES.map((p) => ({ label: p[0]?.toUpperCase() + p.slice(1), value: p }))}
        value={s.phase}
        onChange={(v) => setSetting('phase', v)}
      />

      <SectionHeader title="You" />
      <Card>
        <View style={styles.pair}>
          <Stepper label="Height" suffix="cm" value={s.heightCm} step={1} min={120} max={230} onChange={(v) => setSetting('heightCm', v)} />
          <Stepper label="Age" value={s.age} step={1} min={14} max={99} onChange={(v) => setSetting('age', v)} />
        </View>
        <Row label="Sex" hint="Only used for the first two weeks' formula estimate.">
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
      </Card>

      <SectionHeader title="Day" />
      <Card>
        <Row label="Wake" hint="No reminder ever fires before this.">
          <TimeAdjuster value={s.wakeMinutes} max={s.sleepMinutes - 60} onChange={(v) => { setSetting('wakeMinutes', v); void rescheduleAll(); }} />
        </Row>
        <Row label="Sleep" hint="…or after this.">
          <TimeAdjuster value={s.sleepMinutes} min={s.wakeMinutes + 60} onChange={(v) => { setSetting('sleepMinutes', v); void rescheduleAll(); }} />
        </Row>
      </Card>

      <SectionHeader title="Training & water" />
      <Card>
        <Stepper label="Session length" suffix="min" value={s.trainingMinutes} step={15} min={15} max={180} onChange={(v) => setSetting('trainingMinutes', v)} />
        <Row label="Heat" hint="Adds 400 ml above 30°C, 300 ml more above 38°C." />
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
        <Row label="Fixed water target" hint="Overrides the calculated one." />
        <ChipRow
          options={[
            { label: 'Auto', value: 0 },
            { label: '3 L', value: 3000 },
            { label: '3.5 L', value: 3500 },
            { label: '4 L', value: 4000 },
          ]}
          value={s.hydrationOverrideMl ?? 0}
          onChange={(v) => { setSetting('hydrationOverrideMl', v === 0 ? null : v); void rescheduleAll(); }}
        />
        <Row label="Calorie cycling" hint="+8% on training days, −8% on rest days.">{bool('calorieCycling')}</Row>
        <Row label="Auto-start rest timer">{bool('restTimerAutoStart')}</Row>
        <Row label="Haptics">{bool('hapticsEnabled')}</Row>
      </Card>

      <SectionHeader title="Gym" />
      <Card onPress={() => router.push('/settings/equipment')}>
        <Text style={styles.link}>Gym inventory ›</Text>
        <Text style={styles.hint}>Plates, dumbbells, bars, machine stacks. Load suggestions only use what's here.</Text>
      </Card>
      <Card onPress={() => void openBatteryOptimisationSettings()}>
        <Text style={styles.link}>Battery optimisation ›</Text>
        <Text style={styles.hint}>Let the rest timer run unrestricted with the screen off.</Text>
      </Card>

      <SectionHeader title="Your data" />
      <Card>
        <Text style={styles.hint}>Everything, as one JSON file plus a CSV per table, into a folder you pick. No account, no network.</Text>
        <PrimaryButton
          label="Export all data"
          tone="neutral"
          style={styles.gap}
          onPress={() => {
            setExportMsg(null);
            exportAll().then(
              (n) => setExportMsg(n === null ? null : `Wrote ${n} files.`),
              (e: unknown) => setExportMsg(`Export failed: ${e instanceof Error ? e.message : String(e)}`),
            );
          }}
        />
        {exportMsg ? <Text style={styles.hint}>{exportMsg}</Text> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: space.md, marginBottom: space.sm },
  link: { ...font.body, color: color.text },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  gap: { marginTop: space.md },
});
