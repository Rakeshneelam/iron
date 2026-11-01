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
import { color, font, radius, space } from '@/theme/tokens';

function P({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export default function PrivacyScreen() {
  return (
    <Screen
      title="Privacy"
      subtitle="Last updated 1 November 2026"
      back
    >
      {/* A document: a lede, then each section on its own card. */}
      <P style={styles.lede}>Iron is a personal training log. It works on your phone, with an optional copy in your own Google account.</P>

      <SectionHeader title="What Iron stores" />
      <View style={styles.section}>
        <P>
          Your workouts, plans, bodyweight, measurements, food, water and settings are saved in a database on this device.
          That database is encrypted.
        </P>
      </View>

      <SectionHeader title="What Iron sends" />
      <View style={styles.section}>
        <P>Nothing, unless you sign in with Google.</P>
        <P style={styles.gap}>
          Iron has no server of its own and no analytics. It contains no ads, uses no advertising identifier and sends no
          crash reports.
        </P>
      </View>

      <SectionHeader title="If you sign in with Google" />
      <View style={styles.section}>
        <P>
          Your Google account becomes your Iron account. Iron keeps an encrypted copy of its database in a private folder
          inside your own Google Drive, called the app data folder, and refreshes it after a workout, when you put the app
          away with new data, and when you open it after a long gap. Only Iron can read that folder; it does not appear in
          your Drive and other apps cannot see it. The developer has no access to it.
        </P>
        <P style={styles.gap}>
          The key that opens the copy is stored with it, so that signing in on a new phone brings everything back without
          a phrase to type. That means the copy is protected by your Google account: anyone who can sign in as you could
          restore it, so keep that account secure.
        </P>
        <P style={styles.gap}>
          Signing in tells Iron the name and email address on your Google account. Both stay on this phone and are used
          only to show you which account is signed in.
        </P>
      </View>

      <SectionHeader title="Deleting your data" />
      <View style={styles.section}>
        <P>
          Delete all data, in You → Backup & data, erases everything on this phone and, if you are signed in, the copy in
          your Google account. Signing out stops syncing and leaves this phone as it is. Uninstalling Iron removes
          everything local; copies in your Drive can also be removed from your Google account&apos;s settings.
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
  section: { padding: space.lg, borderRadius: radius.lg, backgroundColor: color.surface },
  gap: { marginTop: space.md },
});
