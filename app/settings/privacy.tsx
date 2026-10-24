/**
 * The privacy policy, in the app.
 *
 * Play needs a hosted URL as well (see docs/10-PLAY-STORE.md), but an app whose whole
 * promise is that it works offline should be able to state its privacy terms offline.
 * Keep this in step with §3 of that document.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { Screen, SectionHeader } from '@/components';
import { color, font, space } from '@/theme/tokens';

function P({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export default function PrivacyScreen() {
  return (
    <Screen
      title="Privacy"
      subtitle="Last updated 12 September 2026"
      back
    >
      {/* A document, so it is set as one: a lede, then ruled sections, no boxes. */}
      <P style={styles.lede}>Iron is a personal training log. It runs entirely on your phone.</P>

      <SectionHeader title="What Iron stores" />
      <View style={styles.section}>
        <P>
          Your workouts, plans, bodyweight, measurements, food, water and settings are saved in a database on this device.
          That database is encrypted.
        </P>
      </View>

      <SectionHeader title="What Iron sends" />
      <View style={styles.section}>
        <P>Nothing, unless you turn on Google Drive backup.</P>
        <P style={styles.gap}>
          Iron has no account system, no server and no analytics. It contains no ads, uses no advertising identifier and
          sends no crash reports. Nobody, including the developer, can see your data.
        </P>
      </View>

      <SectionHeader title="If you turn on Drive backup" />
      <View style={styles.section}>
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
      </View>

      <SectionHeader title="Accounts" />
      <View style={styles.section}>
        <P>There are none. Iron has no sign-in, no profile on any server, and no marketing email to opt into.</P>
        <P style={styles.gap}>
          Earlier versions offered an optional account holding a name, email address, age and sex. That is gone from the
          app. If you made one, its details still exist on the old service until it is retired — ask the developer to
          remove yours.
        </P>
      </View>

      <SectionHeader title="Deleting your data" />
      <View style={styles.section}>
        <P>
          Delete all my data, in Settings, erases everything on this phone. Disconnect removes Iron&apos;s access to
          Drive; backups already there can be deleted from your Google account at any time. Uninstalling Iron removes
          everything local.
        </P>
      </View>

      <SectionHeader title="Never sold" />
      <View style={styles.section}>
        <P>Your data is never sold or shared. It is not used for advertising or profiling.</P>
        <P style={styles.gap}>Iron is not directed at children under 13.</P>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { ...font.body, color: color.text },
  lede: { ...font.heading, fontSize: 22, lineHeight: 30, fontWeight: '600', marginTop: space.sm },
  section: { paddingLeft: space.md, borderLeftWidth: 2, borderLeftColor: color.border },
  gap: { marginTop: space.md },
});
