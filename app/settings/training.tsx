import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Card, ChipRow, Icon, IconButton, PrimaryButton, Screen, SectionHeader, ToggleChips } from '@/components';
import { CATALOG_BY_ID } from '@/data/catalog';
import { useLive } from '@/db/live';
import { getActiveRoutine, getDays } from '@/db/repositories/program';
import { setSetting, useSettings } from '@/db/repositories/settings';
import { LEVEL_OPTIONS, LIMITATION_OPTIONS, toggle } from '@/features/profile';
import { scheduleLabel } from '@/features/program/schedule';
import { Row } from '@/features/settings/Row';
import { MODE_OPTIONS } from '@/features/warmup/labels';
import { color, font, hit, space } from '@/theme/tokens';

const ON_OFF = [
  { label: 'On', value: 1 },
  { label: 'Off', value: 0 },
] as const;

/**
 * Training preferences: how a workout behaves, and what the app will and won't
 * suggest. The schedule itself is a link, not a copy — Plans owns it (UX-10).
 */
export default function TrainingSettings() {
  const s = useSettings();
  const rotation = useLive(() => {
    const r = getActiveRoutine();
    return r ? getDays(r.id).length : 0;
  }, ['routine', 'routine_day']);

  const bool = (key: 'hapticsEnabled' | 'restTimerAutoStart') => (
    <ChipRow options={ON_OFF} value={s[key] ? 1 : 0} onChange={(v) => setSetting(key, v === 1)} fill={false} />
  );

  return (
    <Screen
      title="Training preferences"
      right={<PrimaryButton label="Back" tone="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))} />}
    >
      <Card onPress={() => router.push('/plan/schedule')}>
        <View style={styles.linkRow}>
          <View style={styles.flex1}>
            <Text style={styles.body}>Training schedule</Text>
            <Text style={styles.hint}>{scheduleLabel({ rotation, scheduledDays: s.trainingDays.length })}</Text>
          </View>
          <Icon name="chevronRight" size={20} color={color.textMuted} />
        </View>
      </Card>

      <SectionHeader title="During a workout" />
      <Card>
        <Text style={styles.label}>Default warm-up</Text>
        <ChipRow options={MODE_OPTIONS} value={s.warmupMode} onChange={(v) => setSetting('warmupMode', v)} />
        <Row label="Auto-start rest timer">{bool('restTimerAutoStart')}</Row>
        <Row label="Haptics" hint="Buzz on every commit — logging a set, stepping a number, picking a chip.">
          {bool('hapticsEnabled')}
        </Row>
      </Card>

      <SectionHeader title="What Iron suggests" />
      <Card>
        <Text style={styles.label}>Experience</Text>
        <ChipRow options={LEVEL_OPTIONS} value={s.experience} onChange={(v) => setSetting('experience', v)} />
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  label: { ...font.caption, color: color.textMuted, marginTop: space.md, marginBottom: space.xs },
  body: { ...font.body, color: color.text },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  dislike: { flexDirection: 'row', alignItems: 'center', minHeight: hit.default },
});
