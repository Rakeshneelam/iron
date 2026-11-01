# 07 — Sign-in, cloud sync and restore

The only network feature in the app, and optional: the app must be fully usable by
someone who never signs in.

## Model

The local SQLite file is the source of truth. Signing in with Google
(`src/services/cloud.ts`) turns on sync: an encrypted copy of the database goes to
the user's own Google Drive `appDataFolder` — a hidden, per-application folder only
this app can read. There is no Iron server.

**When it syncs** (`src/lib/syncPolicy.ts`, tested): after a workout finishes; when
the app is put away with new data (never mid-workout, at most every 15 minutes);
and on opening if the newest copy is over 12 hours old. Plus Sync now in You. Each
upload is the whole database; the last five are kept.

**Restoring on a new phone**: Continue with Google on the welcome finds the newest
copy and restores it straight into Today. Each copy carries the phrase that opens it
in the file's private `appProperties`, so nothing has to be typed — which means the
copy is protected by the Google account, not by a secret that never leaves the
phone. The privacy screen says so. Copies made before sign-in existed have no
phrase attached and still go through Restore, which asks for it.

**One phone at a time**: the newest copy wins and nothing merges. Signing in on a
phone that already has data asks whether to use the cloud copy or keep the phone's.

**Deleting**: Delete all data removes the cloud copies too, then signs out.

## Auth

Google has to know the APK's signing key before sign-in works on a build. The EAS
preview and production profiles sign with one certificate (checked across every
build since 0.1.0):

    SHA-1   51:0E:B8:88:50:A1:D5:DA:AB:F4:E3:74:B9:6A:34:18:66:1A:48:CD
    SHA-256 16:0C:0B:AC:2C:DD:F7:DE:5D:30:37:3E:B7:EA:5B:D6:40:D3:19:39:2A:A2:9A:F6:6A:3E:38:3D:25:41:42:7A

In Google Cloud project `iron-508406`: an Android OAuth client for package
`dev.rakesh.iron` with that SHA-1, the Google Drive API enabled, and the OAuth
consent screen in Testing with the tester accounts listed (or published). Until
then sign-in fails with DEVELOPER_ERROR, which the app reports as "not set up yet".

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
Settings → Restore → authorise Drive → pick a backup → **type the recovery phrase
of the phone that made it** → decrypt → validate against the live schema → preview
what is in it → one destructive confirmation → replace.

That phrase step is not optional and was, for a while, missing: restore opened the
staged file with the key *this* install happens to hold, which is by definition not
the key that encrypted a backup from another phone — so the one case the feature
exists for could not work, and the screen only said so afterwards. The phrase now
decrypts the staged copy and nothing else; a wrong phrase, a corrupt file, a failed
download or backing out all leave this phone's database and key untouched.

Both routes in — a JSON file and an encrypted database from Drive — meet at
`repositories/restore.inspectTables`, so both get the same schema validation and
the same transactional apply. Nothing goes from `SELECT *` straight into the live
database.

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
