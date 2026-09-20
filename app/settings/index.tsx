import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, Icon, IconButton, PrimaryButton, Screen, SectionHeader, Stepper, ToggleChips } from '@/components';
import { CATALOG_BY_ID } from '@/data/catalog';
import { setSetting, useSettings } from '@/db/repositories/settings';
import { LEVEL_OPTIONS, LIMITATION_OPTIONS, PRESET_OPTIONS, toggle, toolsOf, TOOL_OPTIONS, WEEKDAYS } from '@/features/profile';
import { Row, TimeAdjuster } from '@/features/settings/Row';
import { MODE_OPTIONS } from '@/features/warmup/labels';
import { openBatteryOptimisationSettings, rescheduleAll } from '@/services/notifications';
import { color, font, hit, radius, space } from '@/theme/tokens';

const ON_OFF = [
  { label: 'On', value: 1 },
  { label: 'Off', value: 0 },
] as const;

/**
 * Settings: the things people change.
 *
 * Everything about where data lives — account, backup, export, recovery phrase,
 * privacy, deletion — moved to settings/data. Twelve sections in one scroll meant
 * the training days someone edits weekly sat below six sections they touch once.
 */
export default function SettingsScreen() {
  const s = useSettings();
  const tools = toolsOf(s);

  const bool = (key: 'calorieCycling' | 'hapticsEnabled' | 'restTimerAutoStart') => (
    <ChipRow options={ON_OFF} value={s[key] ? 1 : 0} onChange={(v) => setSetting(key, v === 1)} fill={false} />
  );

  return (
    <Screen title="Settings" right={<PrimaryButton label="Done" tone="ghost" onPress={() => router.back()} />}>
      <SectionHeader title="You" />
      <Card onPress={() => router.push('/settings/profile')}>
        <LinkRow title="Profile & goals" hint="Name, sex, age, height, training goal and body-weight goal." />
      </Card>

      <SectionHeader title="Training" />
      <Card>
        <Text style={styles.label}>Experience</Text>
        <ChipRow options={LEVEL_OPTIONS} value={s.experience} onChange={(v) => setSetting('experience', v)} />
        <Text style={styles.label}>Training days</Text>
        <ToggleChips options={WEEKDAYS} values={s.trainingDays} onToggle={(d) => { setSetting('trainingDays', toggle(s.trainingDays, d)); void rescheduleAll(); }} />
        <Text style={styles.hint}>Your plan runs in order whatever the day — these only set reminders and “planned this week”.</Text>
        <View style={styles.gap}>
          <Stepper label="Typical session length" suffix="min" value={s.trainingMinutes} step={5} min={15} max={180} onChange={(v) => setSetting('trainingMinutes', v)} />
        </View>
        <Text style={styles.label}>Default warm-up</Text>
        <ChipRow options={MODE_OPTIONS} value={s.warmupMode} onChange={(v) => setSetting('warmupMode', v)} />
        <Row label="Auto-start rest timer">{bool('restTimerAutoStart')}</Row>
        <Row label="Haptics">{bool('hapticsEnabled')}</Row>
      </Card>

      <SectionHeader title="Equipment" />
      <Card>
        <ChipRow options={PRESET_OPTIONS} value={s.tools.length ? null : s.equipmentPreset} onChange={(v) => { setSetting('equipmentPreset', v); setSetting('tools', []); }} fill={false} />
        <Text style={styles.label}>What you have{s.tools.length ? ' (custom)' : ''}</Text>
        <ToggleChips options={TOOL_OPTIONS} values={[...tools]} onToggle={(t) => setSetting('tools', toggle([...tools], t))} />
        <Text style={styles.hint}>Swaps, new plans and the exercise picker only suggest what you can do here.</Text>
      </Card>
      <Card onPress={() => router.push('/settings/equipment')}>
        <LinkRow title="Plates and dumbbells" hint="Weights you can actually load — suggestions snap to these." />
      </Card>

      <SectionHeader title="Preferences" />
      <Card>
        <Text style={styles.label}>Go easy on (optional)</Text>
        <ToggleChips options={LIMITATION_OPTIONS} values={s.limitations} onToggle={(v) => setSetting('limitations', toggle(s.limitations, v))} />
        <Text style={styles.hint}>Exercises that load these areas are avoided in swaps and new plans. Not medical advice.</Text>
        <Text style={styles.label}>Exercises you’d rather not do</Text>
        {s.disliked.length === 0 ? <Text style={styles.hint}>None. Mark one from its guide in the exercise library.</Text> : null}
        {s.disliked.map((id) => (
          <View key={id} style={styles.dislike}>
            <Text style={[styles.body, styles.flex1]}>{CATALOG_BY_ID.get(id)?.name ?? id}</Text>
            <IconButton icon="close" accessibilityLabel="Allow again" onPress={() => setSetting('disliked', s.disliked.filter((x) => x !== id))} />
          </View>
        ))}
      </Card>

      <SectionHeader title="Reminders" />
      <Card onPress={() => router.push('/settings/reminders')}>
        <LinkRow title="Reminders" hint="Water, workouts, weigh-ins, measurements, weekly summary — each on or off." />
      </Card>
      <Card>
        <Row label="Wake">
          <TimeAdjuster value={s.wakeMinutes} max={s.sleepMinutes - 60} onChange={(v) => { setSetting('wakeMinutes', v); void rescheduleAll(); }} />
        </Row>
        <Row label="Sleep" hint="Quiet hours: nothing between sleep and wake.">
          <TimeAdjuster value={s.sleepMinutes} min={s.wakeMinutes + 60} onChange={(v) => { setSetting('sleepMinutes', v); void rescheduleAll(); }} />
        </Row>
      </Card>
      <Card onPress={() => void openBatteryOptimisationSettings()}>
        <LinkRow title="Battery optimisation" hint="Lets the rest timer and reminders run with the screen off." />
      </Card>

      <SectionHeader title="Your data" />
      <Card onPress={() => router.push('/settings/backup')}>
        <LinkRow title="Backup and restore" hint="Google Drive, your recovery phrase, and putting a backup back." />
      </Card>
      <Card onPress={() => router.push('/settings/data')}>
        <LinkRow title="Your data" hint="Export for a coach or a spreadsheet, privacy, delete everything." />
      </Card>

    </Screen>
  );
}

function LinkRow({ title, hint }: { title: string; hint: string }) {
  return (
    <View style={styles.linkRow}>
      <View style={styles.flex1}>
        <Text style={styles.body}>{title}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Icon name="chevronRight" size={20} color={color.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  input: { ...font.body, color: color.text, backgroundColor: color.surfaceHigh, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: hit.default },
  pair: { flexDirection: 'row', gap: space.md, marginVertical: space.md },
  label: { ...font.caption, color: color.textMuted, marginTop: space.md, marginBottom: space.xs },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  body: { ...font.body, color: color.text },
  bodyStrong: { ...font.body, color: color.text, fontWeight: '600' },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  gap: { marginTop: space.md },
  footerRoom: { marginBottom: space.xl },
  dislike: { flexDirection: 'row', alignItems: 'center', minHeight: hit.default },
  phrase: { ...font.body, ...font.numeric, color: color.accent, marginTop: space.md, fontWeight: '700' },
  footer: { ...font.caption, color: color.textFaint, textAlign: 'center', marginTop: space.lg },
});
