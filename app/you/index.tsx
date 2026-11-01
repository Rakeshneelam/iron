import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Icon, ListCard, ListRow, Screen, SectionHeader, ToggleRow } from '@/components';
import { setSetting, useSettings } from '@/db/repositories/settings';
import { badgeStates } from '@/engine/level';
import { BadgeGrid, LevelCard, XpSheet } from '@/features/level/LevelParts';
import { useLevel } from '@/features/level/level';
import { ProfileFields } from '@/features/settings/ProfileFields';
import { openBatteryOptimisationSettings } from '@/services/notifications';
import { color, font, space } from '@/theme/tokens';

/**
 * You: your level and badges, the facts about you the maths needs, and the app's
 * own settings — reminders, backup, haptics. Behind the avatar on Today. Everything
 * about the body and the training lives in Settings, behind the sliders.
 */
export default function YouScreen() {
  const s = useSettings();
  const now = useLevel();
  const [explaining, setExplaining] = useState(false);
  const badges = badgeStates(now.stats);
  // Earned first: what you have is the encouraging part; what is left sits after it.
  const ordered = [...badges.filter((b) => b.earned), ...badges.filter((b) => !b.earned)];
  const earned = badges.length - badges.filter((b) => !b.earned).length;

  return (
    <Screen title="You" back>
      <LevelCard level={now.level} onExplain={() => setExplaining(true)} />

      <SectionHeader title="Badges" right={<Text style={styles.count}>{`${earned} of ${badges.length}`}</Text>} />
      <BadgeGrid states={ordered} />

      <SectionHeader title="Profile" />
      <ProfileFields />

      <SectionHeader title="App" />
      <ListCard>
        <ListRow left={<Icon name="bell" size={20} color={color.accent} />} title="Reminders" onPress={() => router.push('/you/reminders')} />
        <ListRow divider left={<Icon name="shield" size={20} color={color.accent} />} title="Backup & data" onPress={() => router.push('/you/backup')} />
        <ToggleRow divider title="Haptics" value={s.hapticsEnabled} onChange={(v) => setSetting('hapticsEnabled', v)} />
        <ListRow
          divider
          left={<Icon name="timer" size={20} color={color.accent} />}
          title="Battery optimisation"
          sub="Lets the rest timer run with the screen off"
          onPress={() => void openBatteryOptimisationSettings()}
        />
        <ListRow divider left={<Icon name="eyeOff" size={20} color={color.accent} />} title="Privacy" onPress={() => router.push('/settings/privacy')} />
      </ListCard>
      <Text style={styles.version}>Iron {Constants.expoConfig?.version ?? ''}</Text>

      <XpSheet visible={explaining} parts={now.parts} onClose={() => setExplaining(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  count: { ...font.label, fontSize: 13, color: color.textMuted, fontVariant: ['tabular-nums'] },
  version: { ...font.caption, fontSize: 12, color: color.textFaint, textAlign: 'center', marginTop: space.lg },
});
