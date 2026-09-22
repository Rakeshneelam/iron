/**
 * Restore from a backup (docs/superpowers/specs/2026-09-12-backup-and-restore-design.md).
 *
 * A screen rather than a sheet: Sheet is explicitly never an "are you sure", and
 * AGENTS.md §1.4 makes confirm() mandatory for destroying data with no undo. The
 * screen carries the information, confirm() is the single gate.
 *
 * Both routes in — a JSON file, or an encrypted database from Drive — end at the
 * same place: a preview of what is actually in the backup, then one confirmation,
 * then the same validated transactional import. The Drive route used to skip
 * straight from a file name to replacing everything, using this install's own key,
 * which is the one key a backup from another phone was never encrypted with
 * (UX-13). It asks for the phrase first now.
 */
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, confirm, PrimaryButton, Screen, SectionHeader, StatTile, TextField, toast } from '@/components';
import { inspectBackup, restoreBackup, type BackupSummary } from '@/db/repositories/restore';
import { PHRASE_CHARS, formatPhrase, normalisePhrase } from '@/lib/recoveryPhrase';
import { inspectDriveBackup, listBackups, type DriveFile } from '@/services/backup';
import { connect, currentAccount, isConfigured } from '@/services/drive';
import { fmtDayLabel } from '@/lib/date';
import { color, font, space } from '@/theme/tokens';

type Row = Record<string, unknown>;
type Loaded = { summary: BackupSummary; tables: Record<string, Row[]>; from: string };

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
  const [picked, setPicked] = useState<DriveFile | null>(null);
  const [phrase, setPhrase] = useState('');

  const typed = normalisePhrase(phrase);
  const phraseReady = typed.length === PHRASE_CHARS;

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

  /**
   * Download, decrypt with the typed phrase, validate, preview. Nothing is written:
   * a wrong phrase, a corrupt file or simply backing out all leave this phone
   * exactly as it was, with its own key still in place.
   */
  const check = (f: DriveFile) => {
    setBusy(true);
    setProblem(null);
    void inspectDriveBackup(f, phrase)
      .then((found) => {
        if (found.ok) {
          setLoaded({ summary: found.summary, tables: found.tables, from: `${fmtDayLabel(f.createdTime.slice(0, 10))} · Google Drive` });
          setProblem(null);
        } else {
          setLoaded(null);
          setProblem(found.reason);
        }
      })
      .catch(() => setProblem('That backup could not be read.'))
      .finally(() => setBusy(false));
  };

  const choose = () => {
    setBusy(true);
    setProblem(null);
    void (async () => {
      try {
        const chosen = await File.pickFileAsync({ mimeTypes: ['application/json'] });
        const file = Array.isArray(chosen) ? chosen[0] : chosen;
        if (!file) return; // cancelled
        const found = inspectBackup(await new File(file).text());
        if (found.ok) setLoaded({ summary: found.summary, tables: found.tables, from: 'a file on this phone' });
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

  /** The single destructive gate, and the only thing on this screen that writes. */
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
      back
    >
      {loaded ? (
        <>
          <Card>
            <Text style={styles.when}>
              Backed up {loaded.summary.exportedAt ? fmtDayLabel(loaded.summary.exportedAt.slice(0, 10)) : 'at an unknown time'}
            </Text>
            <Text style={styles.hint}>From {loaded.from}</Text>
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
          <PrimaryButton
            label="Choose a different backup"
            tone="ghost"
            onPress={() => {
              setLoaded(null);
              setPicked(null);
            }}
          />
        </>
      ) : (
        <>
          <Card>
            <Text style={styles.body}>
              Restoring replaces the workouts, plans, body, food and water on this phone with the contents of a backup.
            </Text>
            <Text style={styles.hint}>Look for a file named iron-backup-2026-03-01.json — the other exported files are summaries, not backups.</Text>
            <PrimaryButton label={busy ? 'Opening…' : 'Choose backup file'} size="gym" style={styles.gap} disabled={busy} onPress={choose} />
            {isConfigured() && cloud === null ? (
              <PrimaryButton label={busy ? 'Please wait…' : 'Restore from Google Drive'} tone="neutral" style={styles.gap} disabled={busy} onPress={fromDrive} />
            ) : null}
          </Card>

          {cloud !== null ? (
            <>
              <SectionHeader title="Backups in Drive" hint={cloud.length ? 'Newest first.' : undefined} />
              <Card>
                {cloud.length === 0 ? <Text style={styles.body}>No backups in Drive yet.</Text> : null}
                {cloud.map((f) => (
                  <PrimaryButton
                    key={f.id}
                    label={`${fmtDayLabel(f.createdTime.slice(0, 10))} · ${Math.max(1, Math.round(f.size / 1024))} KB`}
                    tone={picked?.id === f.id ? 'neutral' : 'ghost'}
                    accessibilityLabel={`${picked?.id === f.id ? 'Chosen: ' : 'Choose '}the backup from ${fmtDayLabel(f.createdTime.slice(0, 10))}`}
                    onPress={() => {
                      setPicked(f);
                      setProblem(null);
                    }}
                  />
                ))}
              </Card>
            </>
          ) : null}

          {picked ? (
            <>
              <SectionHeader title="Recovery phrase" hint="From the phone that made this backup." />
              <Card>
                <Text style={styles.body}>
                  A backup is encrypted with the phrase of the phone that made it. If that was this phone, it is the one
                  under Backup; if it was another, it is the one shown there.
                </Text>
                <TextField
                  value={phrase}
                  onType={setPhrase}
                  onCommit={setPhrase}
                  placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  accessibilityLabel="Recovery phrase"
                  style={styles.phraseInput}
                />
                <Text style={styles.hint}>
                  {typed.length === 0
                    ? `${PHRASE_CHARS} characters. Dashes and spaces are ignored.`
                    : phraseReady
                      ? formatPhrase(typed)
                      : `${typed.length} of ${PHRASE_CHARS} characters.`}
                </Text>
                <PrimaryButton
                  label={busy ? 'Checking…' : 'Check this backup'}
                  size="gym"
                  style={styles.gap}
                  disabled={busy || !phraseReady}
                  onPress={() => check(picked)}
                />
                <Text style={styles.hint}>Nothing on this phone changes until you have seen what is in the backup.</Text>
              </Card>
            </>
          ) : null}
        </>
      )}

      {problem ? <Text style={styles.problem}>{problem} Nothing was changed.</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { ...font.body, color: color.text },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  gap: { marginTop: space.md },
  when: { ...font.title, color: color.text, marginBottom: space.xs },
  tiles: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  span: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  phraseInput: { ...font.numeric, marginTop: space.md, letterSpacing: 1 },
  // Never textFaint: this is the most important sentence on the screen.
  consequence: { ...font.body, color: color.text, marginTop: space.md },
  problem: { ...font.body, color: color.danger, marginTop: space.md },
});
