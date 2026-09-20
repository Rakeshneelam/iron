/**
 * The privacy policy, in the app.
 *
 * Play needs a hosted URL as well (see docs/10-PLAY-STORE.md), but an app whose whole
 * promise is that it works offline should be able to state its privacy terms offline.
 * Keep this in step with §3 of that document.
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { Card, PrimaryButton, Screen, SectionHeader } from '@/components';
import { color, font, space } from '@/theme/tokens';

function P({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export default function PrivacyScreen() {
  return (
    <Screen
      title="Privacy"
      subtitle="Last updated 12 September 2026"
      right={<PrimaryButton label="Done" tone="ghost" onPress={() => router.back()} />}
    >
      <Card>
        <P>Iron is a personal training log. It runs entirely on your phone.</P>
      </Card>

      <SectionHeader title="What Iron stores" />
      <Card>
        <P>
          Your workouts, plans, bodyweight, measurements, food, water and settings are saved in a database on this device.
          That database is encrypted.
        </P>
      </Card>

      <SectionHeader title="What Iron sends" />
      <Card>
        <P>Nothing, unless you turn on Google Drive backup.</P>
        <P style={styles.gap}>
          Iron has no account system, no server and no analytics. It contains no ads, uses no advertising identifier and
          sends no crash reports. Nobody, including the developer, can see your data.
        </P>
      </Card>

      <SectionHeader title="If you turn on Drive backup" />
      <Card>
        <P>
          Iron uploads an encrypted copy of its database to a private folder inside your own Google Drive, called the app
          data folder. Only Iron can read that folder. It does not appear in your Drive and other apps cannot see it. The
          developer has no access to it.
        </P>
        <P style={styles.gap}>
          The file is encrypted with a key derived from your recovery phrase, and that phrase never leaves this device —
          so without it the backup cannot be read by anyone, including Google.
        </P>
        <P style={styles.gap}>
          Authorising Drive tells Iron the name and email address on your Google account. Both stay on this device and
          are used only to show you which account is connected. It is a Drive permission, not an Iron account, and
          nothing is uploaded until you tap Back up now.
        </P>
      </Card>

      <SectionHeader title="Accounts" />
      <Card>
        <P>There are none. Iron has no sign-in, no profile on any server, and no marketing email to opt into.</P>
        <P style={styles.gap}>
          Earlier versions offered an optional account holding a name, email address, age and sex. That is gone from the
          app. If you made one, its details still exist on the old service until it is retired — ask the developer to
          remove yours.
        </P>
      </Card>

      <SectionHeader title="Deleting your data" />
      <Card>
        <P>
          Delete all my data, in Settings, erases everything on this phone. Disconnect removes Iron&apos;s access to
          Drive; backups already there can be deleted from your Google account at any time. Uninstalling Iron removes
          everything local.
        </P>
      </Card>

      <SectionHeader title="Never sold" />
      <Card>
        <P>Your data is never sold or shared. It is not used for advertising or profiling.</P>
        <P style={styles.gap}>Iron is not directed at children under 13.</P>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { ...font.body, color: color.text },
  gap: { marginTop: space.md },
});
