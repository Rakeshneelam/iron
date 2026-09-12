# 07 — Backup and restore

The only network feature in the app. Ships last (phase 8) and stays optional: the
app must be fully usable by someone who never signs in.

## Model

The local SQLite file is the source of truth. Backup writes an encrypted copy of it
to the user's own Google Drive `appDataFolder` — a hidden, per-application folder
only this app can read. Nothing is uploaded automatically without an explicit action
or an explicit "back up weekly on Wi-Fi" toggle.

## Auth

`@react-native-google-signin/google-signin`, scope `drive.appdata` only. Google
classifies `drive.appdata` as a non-sensitive scope, so no OAuth verification review
is needed for personal use. **Do not request `drive.file` or full Drive scopes** —
they're unnecessary and would drag the project into verification.

## Producing a consistent dump

1. `PRAGMA wal_checkpoint(FULL)` — without this, recent writes sit in the `-wal`
   file and the copy is stale or corrupt.
2. Copy the DB file to cache via `expo-file-system`.
3. Encrypt (below).
4. Upload with `uploadType=resumable`. Simple and multipart uploads are capped at
   5 MB; a few years of training data plus a food table will exceed that. Resumable
   is also the only sane choice on Indian mobile data.
5. Keep the last 5 backups, named `iron-YYYY-MM-DD-HHmm.db.enc`. Delete older ones.
6. Store `lastBackupAt` and the byte size in `setting`; show them in Settings.

## Encryption

Two acceptable approaches — pick one and document it:

- **SQLCipher at rest** via `expo-sqlite`'s `useSQLCipher` option (dev build only;
  set `PRAGMA key` immediately after opening). The whole DB is encrypted on device
  and the backup is already ciphertext.
- **Encrypt the dump only**, with AES-GCM via `expo-crypto`, before upload.

Either way the key is generated once, stored in `expo-secure-store`, and shown to
the user once in Settings as a recovery phrase they can write down. **A backup he
cannot decrypt on a new phone is not a backup** — make key recovery explicit, not
clever.

## Restore

Restore is the feature, backup is just the prerequisite. On a fresh install:
Settings → Restore → sign in → pick a backup → decrypt → validate schema version →
replace the DB → restart.

Validate before replacing. Never overwrite a populated DB without a confirmation
that names the date of the backup being restored and the date of the local data.

## Plain export — build this first

Independent of Drive: **Export all data** writes a single `.json` (and per-table
`.csv`) to the share sheet. It requires no auth, no key, and no network, and it is
the actual guarantee that his data is never trapped. If Drive backup slips, export
must still ship.

## Test matrix

1. Backup, wipe app data, restore → identical row counts on every table
2. Restore a backup from an older schema version → migrations run, data intact
3. Restore with the wrong key → clear error, local data untouched
4. Backup on a metered connection with the app backgrounded mid-upload → resumes
5. Export → open the CSV in a spreadsheet on a laptop

## Implementation design

The resolved design, screen flows and copy live in
`docs/superpowers/specs/2026-09-12-backup-and-restore-design.md`.
That document closes the two open choices above: SQLCipher at rest, and a recovery
phrase that is the root secret rather than a display encoding of the key.
