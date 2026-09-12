# Backup and restore — design

Implements `docs/07-BACKUP.md`. That document sets the technical model and still
governs; this one records the choices it left open, and adds the layer it has none
of: what the user actually sees and does.

## The goal, in one sentence

The user never performs a backup, and moving their training history to a new phone
is three taps.

Everything below is subordinate to that. A backup feature that relies on someone
remembering to press a button is a feature most people discover they never used at
the moment it would have mattered.

## Decisions this document closes

07-BACKUP.md asks for two open choices to be picked and documented.

**Encryption: SQLCipher at rest.** Shipped 2026-09-12 (`src/db/client.ts`). The
database file is encrypted on device, so the backup is already ciphertext and
nothing has to be encrypted a second time on the way out. This also means the
restore path is a file replacement rather than a row-level import, which is what
lets an old backup be restored and then migrated forward.

**Cadence: connect once, then daily on Wi-Fi.** 07-BACKUP.md requires that nothing
uploads automatically "without an explicit action or an explicit toggle".
Connecting Drive is that explicit action; the toggle is offered at connect time and
lives in Settings afterwards. Wi-Fi-only is the default because the app is built for
use on Indian mobile data.

## The recovery phrase

This is the single most important design element in the feature, because it is the
only thing standing between a lost phone and lost data.

**The phrase is the root secret; the database key is derived from it.** The reverse —
encoding the existing key for display — is not possible: the key shipped on
2026-09-12 is 32 random bytes, and 256 bits cannot be written as a phrase anyone
will transcribe by hand.

```
K7WM-3PQX-9FTR-2BHD-6NSV-4JGZ
```

Six groups of four, 120 bits, from a 32-character alphabet with no `0`/`O` and no
`1`/`I`/`l`. It will be typed by hand, on a phone, possibly years from now, by
someone who is already anxious. Ambiguous glyphs are not an acceptable cost, and
neither is a phrase long enough to give up on.

**Existing installs are re-keyed once.** SQLCipher's `PRAGMA rekey` re-encrypts an
already-encrypted database in place, so an install carrying the random key generates
a phrase, derives a key from it, rekeys, and stores the phrase. No export, no copy,
no data movement — and it must happen before that install's first Drive backup, or
the backup inherits a key nobody can reproduce.

Rules:

- Input is normalised before decoding: upper-cased, dashes and spaces stripped, and
  the ambiguous glyphs folded onto their intended characters (`O`→`0` is *not*
  applied — `0` is not in the alphabet, so `O` is simply invalid and reported as a
  typo rather than silently reinterpreted).

- **Retrievable from Settings at any time**, not a one-time reveal. 07-BACKUP.md
  says "shown once"; that is the one place this design deliberately goes further.
  Almost everyone who loses their data had a working phone right up until they
  didn't, so a phrase they could miss is a phrase they will miss.
- Shown at connect, with **Copy** and **Save to password manager** (Android
  Credential Manager), and an explicit "I've saved it" acknowledgement.
- Settings shows whether it has ever been acknowledged, and says plainly what it is
  for: *"Needed to restore your data on a new phone."*
- It gates **both** transports. One phrase, one concept, whichever way the data
  travels.

### Known risk

The phrase is a single point of failure. Lose it and the backup is unreadable —
by design, and accepted knowingly. The mitigations above (always retrievable,
password-manager handoff, explicit acknowledgement) are the whole of the defence;
there is no recovery path behind them, and the UI must never imply otherwise.

## The journeys

### Connecting — once, then never again

Settings → Data → **Back up to Google Drive** → account picker → recovery phrase
screen (Copy · Save to password manager · I've saved it) → done.

Afterwards Settings shows a single line: *"Last backed up · 2 hours ago"*. No
button to press, nothing to schedule, nothing to remember.

### Restoring on a new phone — the case this exists for

Install → open → the setup screen offers **"Already using Iron? Restore from
Google Drive"**, directly under the subtitle and above the form. It is at the top
because the person who needs it is being asked their height while the thing they
want is five years of training history; making them scroll past a two-minute form
to find it is the failure this feature exists to prevent.

Tap → account picker → the app finds the latest backup and shows:

> **Backed up yesterday · 21:04**
> 142 workouts · 196 weigh-ins · 94 days of food
> 8 Mar 2025 – 1 Mar 2026
>
> *Nothing on this phone will be lost.*

→ enter recovery phrase → restore → land on Today with everything back.

Rule 2 is intact throughout: still one setup screen, no account required, and
anyone who ignores the line proceeds exactly as before.

### Restoring from an exported file — a first-class fallback

For anyone who never linked Google but exported before uninstalling. Settings →
Data → **Restore from backup** → file picker → the same preview, the same phrase,
the same result. It shares the entire core with the Drive path; only the transport
differs.

The empty state names the file — *"Look for `iron-backup-2026-03-01.json`"* —
because `exportAll()` writes ten files and the user has to pick the right one.
Preventing that confusion up front beats explaining it afterwards.

### Everyday — nothing

No prompts, no badges, no reminders, no "you haven't backed up in N days" nagging.
The anti-feature list in AGENTS.md §6 applies here as much as anywhere.

## Preview screen

A screen (`app/settings/restore.tsx`), not a Sheet: `src/components/Sheet.tsx`
carries an explicit contract that it is never used as an "are you sure", and §1.4
makes `confirm()` mandatory for destroying data with no undo.

Content, in human facts rather than table row counts:

- When it was taken, relative and absolute
- Three `StatTile`s: Workouts · Weigh-ins · Days of food
- The span of the data
- **The consequence line** — the sentence that earns trust. Either *"This phone has
  3 workouts and 2 weigh-ins since this backup. Restoring removes them."* or, in
  the common new-phone case, *"Nothing on this phone will be lost."*
  07-BACKUP.md requires a confirmation naming both dates; this satisfies it and
  goes further by naming what is actually at stake.
- Action: `tone="danger" size="gym"`, labelled **"Replace everything with this
  backup"**. A label that states the action beats "Confirm". It fires `confirm()`
  once — not the double confirm Delete-all uses, because the screen has already
  done the work a second dialog would stand in for.

## Failure behaviour

Every rejection ends with **"Nothing was changed."** and never mentions a schema,
a column or a version number.

| Situation | What the user is told |
|---|---|
| Wrong recovery phrase | "That phrase doesn't open this backup. Check for typos — letters are not case sensitive." |
| Picked `iron-export-<date>.json` | "That's the readable summary export. The one you want is named `iron-backup-<date>.json`." |
| Backup from a newer app version | "This backup is from a newer version of Iron. Update the app, then restore." |
| Not an Iron backup | "This file isn't an Iron backup." |
| Upload interrupted | Silent. Retries on the next launch; never surfaced mid-workout. |

The near-miss case is built deliberately: the summary export sits in the same
folder as the backup, so picking it is the most likely mistake anyone will make.
Recognising it by shape and naming the right file is the difference between
software that answers and software that just refuses.

## Architecture

```
recovery phrase  ────KDF────►  database key (expo-secure-store)
  (root secret)                 existing installs: PRAGMA rekey, once
                                          │
        ┌─────────────────────────────────┴─────────────────────────┐
   Drive transport                                          File transport
   (google-signin, drive.appdata)                    (expo-file-system picker)
        └─────────────────────────────────┬─────────────────────────┘
                                          │
                              restore core: validate → replace → migrate
```

The core takes bytes and knows nothing about where they came from, which is why the
file fallback costs almost nothing once Drive exists, and why the core is testable
without any credentials at all.

Restore sequence, per 07-BACKUP.md: validate before replacing, replace the database
file, run migrations, restart into Today. Local data is untouched until validation
has passed.

Backup sequence: `PRAGMA wal_checkpoint(FULL)` — without it recent writes sit in the
`-wal` file and the copy is stale — copy to cache, upload with
`uploadType=resumable` (simple and multipart uploads cap at 5 MB), keep the last
five as `iron-YYYY-MM-DD-HHmm.db.enc`, record `lastBackupAt` and size in `setting`.

## Auth

`@react-native-google-signin/google-signin`, scope `drive.appdata` **only**.
Requesting `drive.file` or any broader scope would drag the project into OAuth
verification review for no benefit.

## Accessibility

Built in, not a later pass. The consequence line uses `color.text` and never
`textFaint` — it is the most important sentence on the screen. The destructive
button carries an `accessibilityLabel` stating what it replaces. The recovery
phrase is selectable text with a Copy affordance, never an image. Gym-sized
targets throughout.

## Testing

07-BACKUP.md's matrix, plus the phrase:

1. Backup → wipe → restore → identical row counts on every table
2. Restore a backup from an older schema version → migrations run, data intact
3. Restore with the wrong phrase → clear error, local data untouched
4. Backgrounded mid-upload on a metered connection → resumes
5. Export → open the CSV in a spreadsheet
6. Phrase → key derivation is stable across runs; normalisation accepts lower case,
   missing dashes and stray spaces; ambiguous glyphs are rejected as typos
7. Restore from an exported file with no Google account linked
8. An install carrying the pre-phrase random key rekeys once, opens afterwards, and
   does not rekey again on the next launch

Items 6 and the validation half of 1 and 3 are reachable under `node --test`.
Everything touching Drive, the keystore or the file system needs a device.

## Not in scope

Merging two datasets, sync-conflict resolution and multi-device merge are named
anti-features in AGENTS.md §6. Restore replaces.

## External dependency

Drive cannot ship until a Google Cloud project exists with OAuth client IDs,
including the SHA-1 of the release signing key. That is the user's to create; no
amount of app code substitutes for it. The file transport has no such dependency
and can ship first.

## Correctness detail

Restoring on a fresh install must not then run first-run setup. The restored
`setting` rows carry the profile, so the setup-complete check has to read from the
restored database rather than from state captured before the restore.
