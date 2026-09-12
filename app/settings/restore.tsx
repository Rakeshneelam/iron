/**
 * Restore from a backup file (docs/superpowers/specs/2026-09-12-backup-and-restore-design.md).
 *
 * A screen rather than a sheet: Sheet is explicitly never an "are you sure", and
 * AGENTS.md §1.4 makes confirm() mandatory for destroying data with no undo. The
 * screen carries the information, confirm() is the single gate.
 */
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, confirm, PrimaryButton, Screen, StatTile, toast } from '@/components';
import { inspectBackup, restoreBackup, type BackupSummary } from '@/db/repositories/restore';
import { listBackups, restoreFromDrive, type DriveFile } from '@/services/backup';
import { connect, currentAccount, isConfigured } from '@/services/drive';
import { fmtDayLabel } from '@/lib/date';
import { color, font, space } from '@/theme/tokens';

type Row = Record<string, unknown>;
type Loaded = { summary: BackupSummary; tables: Record<string, Row[]> };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What the user stands to lose, in their own terms — or the reassurance that it is nothing. */
function consequence(s: BackupSummary): string {
  const parts: string[] = [];
  if (s.losesWorkouts > 0) parts.push(plural(s.losesWorkouts, 'workout'));
  if (s.losesWeighIns > 0) parts.push(plural(s.losesWeighIns, 'weigh-in'));
  if (parts.length === 0) return 'Nothing on this phone will be lost.';
  return `This phone has ${parts.join(' and ')} logged since this backup. Restoring removes them.`;
}

export default function RestoreScreen() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cloud, setCloud] = useState<DriveFile[] | null>(null);

  /** Sign in only if needed, then list what is up there. */
  const fromDrive = () => {
    setBusy(true);
    setProblem(null);
    void (async () => {
      try {
        const account = (await currentAccount()) ?? (await connect());
        if (!account) return; // backed out of the account picker
        setCloud(await listBackups());
      } catch (e) {
        setProblem(e instanceof Error ? e.message : 'Google Drive could not be reached.');
      } finally {
        setBusy(false);
      }
    })();
  };

  const applyCloud = (f: DriveFile) =>
    confirm({
      title: 'Replace everything on this phone?',
      message: `Restores ${f.name}. This cannot be undone.`,
      confirmLabel: 'Replace',
      destructive: true,
      onConfirm: () => {
        setBusy(true);
        void restoreFromDrive(f.id)
          .then(
            (n) => {
              toast(`Restored ${plural(n, 'workout')}.`);
              router.replace('/');
            },
            () => setProblem('That backup could not be read. It may belong to a different install, whose recovery phrase this phone does not have.'),
          )
          .finally(() => setBusy(false));
      },
    });

  const choose = () => {
    setBusy(true);
    setProblem(null);
    void (async () => {
      try {
        const picked = await File.pickFileAsync({ mimeTypes: ['application/json'] });
        const file = Array.isArray(picked) ? picked[0] : picked;
        if (!file) return; // cancelled
        const found = inspectBackup(await new File(file).text());
        if (found.ok) setLoaded({ summary: found.summary, tables: found.tables });
        else {
          setLoaded(null);
          setProblem(found.reason);
        }
      } catch {
        setProblem("That file couldn't be opened.");
      } finally {
        setBusy(false);
      }
    })();
  };

  const apply = (l: Loaded) =>
    confirm({
      title: 'Replace everything on this phone?',
      message: `${consequence(l.summary)} This cannot be undone.`,
      confirmLabel: 'Replace',
      destructive: true,
      onConfirm: () => {
        try {
          const n = restoreBackup(l.tables);
          toast(`Restored ${plural(n, 'workout')}.`);
          router.replace('/');
        } catch {
          setProblem('The restore failed part-way and was undone. Nothing was changed.');
        }
      },
    });

  return (
    <Screen
      title="Restore"
      subtitle="Put a backup back onto this phone."
      right={<PrimaryButton label="Back" tone="ghost" onPress={() => router.back()} />}
    >
      {loaded ? (
        <>
          <Card>
            <Text style={styles.when}>
              Backed up {loaded.summary.exportedAt ? fmtDayLabel(loaded.summary.exportedAt.slice(0, 10)) : 'at an unknown time'}
            </Text>
            <View style={styles.tiles}>
              <StatTile label="Workouts" value={String(loaded.summary.workouts)} tone="accent" />
              <StatTile label="Weigh-ins" value={String(loaded.summary.weighIns)} />
              <StatTile label="Days of food" value={String(loaded.summary.foodDays)} />
            </View>
            {loaded.summary.from && loaded.summary.to ? (
              <Text style={styles.span}>
                {fmtDayLabel(loaded.summary.from)} – {fmtDayLabel(loaded.summary.to)}
              </Text>
            ) : null}
            <Text style={styles.consequence}>{consequence(loaded.summary)}</Text>
          </Card>
          <PrimaryButton
            label="Replace everything with this backup"
            tone="danger"
            size="gym"
            style={styles.gap}
            accessibilityLabel={`Replace everything on this phone with this backup. ${consequence(loaded.summary)}`}
            onPress={() => apply(loaded)}
          />
          <PrimaryButton label="Choose a different file" tone="ghost" onPress={choose} />
        </>
      ) : (
        <Card>
          <Text style={styles.body}>
            Restoring replaces the workouts, plans, body, food and water on this phone with the contents of a backup.
          </Text>
          <Text style={styles.hint}>Look for a file named iron-backup-2026-03-01.json — the other exported files are summaries, not backups.</Text>
          <PrimaryButton label={busy ? 'Opening…' : 'Choose backup file'} size="gym" style={styles.gap} disabled={busy} onPress={choose} />
          {isConfigured() ? (
            <PrimaryButton
              label={busy ? 'Please wait…' : 'Restore from Google Drive'}
              tone="neutral"
              style={styles.gap}
              disabled={busy}
              onPress={fromDrive}
            />
          ) : null}
        </Card>
      )}

      {cloud !== null ? (
        <Card>
          <Text style={styles.body}>{cloud.length === 0 ? 'No backups in Drive yet.' : 'Backups in Drive, newest first'}</Text>
          {cloud.map((f) => (
            <PrimaryButton
              key={f.id}
              label={`${fmtDayLabel(f.createdTime.slice(0, 10))} · ${Math.max(1, Math.round(f.size / 1024))} KB`}
              tone="ghost"
              accessibilityLabel={`Restore the backup from ${fmtDayLabel(f.createdTime.slice(0, 10))}`}
              onPress={() => applyCloud(f)}
            />
          ))}
        </Card>
      ) : null}

      {problem ? (
        <Text style={styles.problem}>
          {problem} Nothing was changed.
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { ...font.body, color: color.text },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  gap: { marginTop: space.md },
  when: { ...font.title, color: color.text, marginBottom: space.md },
  tiles: { flexDirection: 'row', gap: space.sm },
  span: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  // Never textFaint: this is the most important sentence on the screen.
  consequence: { ...font.body, color: color.text, marginTop: space.md },
  problem: { ...font.body, color: color.danger, marginTop: space.md },
});
