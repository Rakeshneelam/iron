import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Icon, PrimaryButton, Screen } from '@/components';
import { useLive } from '@/db/live';
import { getActiveRoutine, getDays } from '@/db/repositories/program';
import { useSettings } from '@/db/repositories/settings';
import { scheduleLabel } from '@/features/program/schedule';
import { openBatteryOptimisationSettings } from '@/services/notifications';
import { color, font, hit, space } from '@/theme/tokens';

/**
 * Settings: six destinations, grouped by the task you came to do.
 *
 * It was one page of twelve sections — training, equipment, preferences, quiet
 * hours, account, backup, data — so the training days someone edits weekly sat
 * below six sections they touch once a year, and the page had to be read to be
 * navigated. Each row below owns its detail now, and nothing owns it twice
 * (UX-10).
 */
export default function SettingsScreen() {
  const s = useSettings();
  const rotation = useLive(() => {
    const r = getActiveRoutine();
    return r ? getDays(r.id).length : 0;
  }, ['routine', 'routine_day']);

  const reminders = Object.values(s.reminders).filter((r) => (r as { on: boolean }).on).length;

  return (
    <Screen
      title="Settings"
      right={<PrimaryButton label="Done" tone="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />}
    >
      <LinkRow title="Profile & goals" hint={`${s.name || 'Your details'} · ${s.age}, ${s.heightCm} cm`} onPress={() => router.push('/settings/profile')} />
      <LinkRow
        title="Training preferences"
        hint={scheduleLabel({ rotation, scheduledDays: s.trainingDays.length })}
        onPress={() => router.push('/settings/training')}
      />
      <LinkRow
        title="Equipment"
        hint={s.tools.length ? `${s.tools.length} chosen, plus your plates and dumbbells` : 'Where you train, and what you can load'}
        onPress={() => router.push('/settings/equipment')}
      />
      <LinkRow title="Reminders" hint={`${reminders} on · quiet hours and what Iron may send`} onPress={() => router.push('/settings/reminders')} />
      <LinkRow title="Backup & restore" hint="Google Drive, your recovery phrase, and putting a backup back." onPress={() => router.push('/settings/backup')} />
      <LinkRow title="Your data" hint="Export for a coach or a spreadsheet, privacy, delete everything." onPress={() => router.push('/settings/data')} />

      {/* Not a section of its own — one line, because it is one tap into Android. */}
      <Text style={styles.footnote}>The rest timer and reminders need Iron exempt from battery optimisation to fire with the screen off.</Text>
      <PrimaryButton label="Open battery settings" tone="ghost" onPress={() => void openBatteryOptimisationSettings()} />
    </Screen>
  );
}

function LinkRow({ title, hint, onPress }: { title: string; hint: string; onPress: () => void }) {
  return (
    <Card onPress={onPress}>
      <View style={styles.row}>
        <View style={styles.flex1}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint} numberOfLines={2}>
            {hint}
          </Text>
        </View>
        <Icon name="chevronRight" size={20} color={color.textMuted} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hit.default },
  title: { ...font.body, color: color.text, fontWeight: '600' },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  footnote: { ...font.caption, color: color.textMuted, marginTop: space.xl },
});
