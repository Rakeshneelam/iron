/**
 * Your data: getting it out, and getting rid of it.
 *
 * Separate from backup because the purpose is different. A backup is for you, later.
 * An export is for a coach, a spreadsheet or a model — readable on purpose, which is
 * exactly why it is not encrypted and why that has to be said out loud.
 */
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, confirm, Icon, PrimaryButton, Screen, SectionHeader } from '@/components';
import { wipeAllData } from '@/db/repositories/admin';
import { exportAll } from '@/services/export';
import { color, font, space } from '@/theme/tokens';

export default function DataSettings() {
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const deleteAll = () =>
    confirm({
      title: 'Delete all your data?',
      message: 'Workouts, plans, body measurements, water, food and settings are removed from this phone. Export first if you want a copy. This cannot be undone.',
      confirmLabel: 'Continue',
      destructive: true,
      onConfirm: () =>
        confirm({
          title: 'Really delete everything?',
          confirmLabel: 'Delete everything',
          destructive: true,
          onConfirm: () => {
            wipeAllData();
            router.replace('/setup');
          },
        }),
    });

  return (
    <Screen title="Your data" right={<PrimaryButton label="Done" tone="ghost" onPress={() => router.back()} />}>
      <SectionHeader title="Export" hint="For a coach, a spreadsheet, or an AI assistant." />
      <Card>
        <Text style={styles.hint}>
          A structured JSON file covering your profile, plans, every workout with planned against done, records, body,
          water and weekly summaries — plus CSVs and a full backup.
        </Text>
        <PrimaryButton
          label={exporting ? 'Exporting…' : 'Export to a folder'}
          tone="neutral"
          disabled={exporting}
          icon={<Icon name="export" size={18} />}
          style={styles.gap}
          onPress={() => {
            setMessage(null);
            setExporting(true);
            exportAll()
              .then(
                (n) => setMessage(n === null ? null : `Saved ${n} files.`),
                (e: unknown) => setMessage(`Export failed: ${e instanceof Error ? e.message : String(e)}`),
              )
              .finally(() => setExporting(false));
          }}
        />
        {message ? <Text style={styles.hint}>{message}</Text> : null}
        <Text style={styles.hint}>
          These files are readable on purpose, so they are not encrypted — anything that can open the folder can read
          them.
        </Text>
      </Card>

      <SectionHeader title="Privacy" />
      <Card onPress={() => router.push('/settings/privacy')}>
        <View style={styles.linkRow}>
          <View style={styles.flex1}>
            <Text style={styles.body}>What Iron stores and sends</Text>
            <Text style={styles.hint}>And how to delete any of it.</Text>
          </View>
          <Icon name="chevronRight" size={20} color={color.textMuted} />
        </View>
      </Card>

      <SectionHeader title="Delete" />
      <Card>
        <Text style={styles.hint}>
          Everything on this phone: workouts, plans, body, food, water and settings. Your account, if you have one, is
          deleted separately under Account.
        </Text>
        <PrimaryButton
          label="Delete all my data"
          tone="ghost"
          icon={<Icon name="trash" size={16} color={color.danger} />}
          style={styles.gap}
          onPress={deleteAll}
        />
      </Card>

      <Text style={styles.footer}>
        Iron {Constants.expoConfig?.version ?? ''} · No account, no server. Everything stays on this phone.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  body: { ...font.body, color: color.text },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  gap: { marginTop: space.md },
  footer: { ...font.caption, color: color.textFaint, textAlign: 'center', marginTop: space.lg, marginBottom: space.xl },
});
