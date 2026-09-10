import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { setSetting, useSettings } from '@/db/repositories/settings';
import { openBatteryOptimisationSettings } from '@/services/notifications';
import { color, font, space } from '@/theme/tokens';

/**
 * docs/06 Rule 3: ask once, then stop. Rendered after the first workout; whichever
 * button he taps, it never appears again — the option lives on in Settings.
 */
export function BatteryCard() {
  const settings = useSettings();
  if (settings.batteryPromptShown) return null;
  return (
    <Card tone="warning">
      <Text style={styles.title}>Keep the rest timer alive</Text>
      <Text style={styles.body}>
        Android may stop the rest timer when the screen is off. Allow Iron to run unrestricted?
      </Text>
      <View style={styles.row}>
        <PrimaryButton
          label="Open battery settings"
          onPress={() => {
            setSetting('batteryPromptShown', true);
            void openBatteryOptimisationSettings();
          }}
          style={styles.flex}
        />
        <PrimaryButton label="Not now" tone="neutral" onPress={() => setSetting('batteryPromptShown', true)} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { ...font.heading, color: color.text },
  body: { ...font.body, color: color.textMuted, marginVertical: space.md },
  row: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
});
