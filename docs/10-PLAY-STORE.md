# 10 — Play Store readiness

What Google will ask for and what Iron currently answers. The app is local-first:
all training data lives on the device. Two things optionally leave it — a five-field
profile, if the user makes an account, and an encrypted database copy, if the user
connects their own Google Drive.

**This is engineering groundwork, not legal advice.** The privacy policy below is
a draft that describes the code accurately. Have it reviewed before publishing.

---

## 1. The two things most likely to get Iron rejected

### `USE_EXACT_ALARM` — the real risk

`app.json` requests both `SCHEDULE_EXACT_ALARM` and `USE_EXACT_ALARM`.

Google restricts `USE_EXACT_ALARM` to apps whose **core function** is an alarm
clock, timer, or calendar. It is granted automatically, which is exactly why it is
policy-reviewed. A fitness app with a rest timer is arguable — the timer is core to
the logging flow — but it is a judgement call made by a reviewer, and it is the
single most likely reason for a rejection.

Two ways to go:

| | What happens |
|---|---|
| **Keep it, justify it** | Declare the rest timer as timer functionality. Defensible, but a reviewer may disagree and you appeal. |
| **Drop it, keep `SCHEDULE_EXACT_ALARM`** (safer) | No policy review at all. Cost: on Android 13+ the user must grant exact alarms in system settings, so Settings needs a prompt explaining why. The app already has a battery-optimisation prompt to model it on. |

If the app is only ever handed to friends as an APK, neither matters. This only
bites on Play.

### Foreground service — already correct, but capped

`modules/rest-timer` declares `android:foregroundServiceType="shortService"` and
passes `FOREGROUND_SERVICE_TYPE_SHORT_SERVICE` to `startForeground`. That is the
right type and needs no extra permission or declaration, so nothing to do for Play.

**But `shortService` is capped at roughly three minutes by Android.** Rest periods
regularly exceed that: the default for a compound is 150 s and `addSeconds` lets the
user extend it. Past the cap the system times the service out, so the live countdown
notification disappears.

The timer itself still fires — completion is owned by the exact alarm
(`RestTimerAlarmReceiver`), not the service — so this degrades the notification
rather than losing the timer. Worth fixing, not urgent, and it is a runtime issue
rather than a store one.

---

## 2. Data Safety form

Play asks what is collected and what is shared. "Collected" means transmitted off
the device.

**Accounts are live as of this change.** Firebase Auth holds an email and password;
one Firestore document per user holds exactly five fields. Training data is not sent
there and `firebase/firestore.rules` rejects any attempt to, so the health category
stays out of this form.

| Question | Answer |
|---|---|
| Data type | Personal info — name, email address, **age**, **gender**, and occupation as "other info" |
| Collected or shared? | Collected by the developer. **Never shared or sold.** |
| Is it optional? | Yes — the app is fully functional with no account |
| Purposes | App functionality, Analytics (understanding the userbase), and **Marketing — only for users who opted in** |
| Encrypted in transit? | Yes |
| Can users request deletion? | Yes — Delete account in Settings, plus the web URL below |

Marketing is a *separate* purpose and must be ticked as one. It applies only to users
who ticked the unticked box at signup; `marketingOptInAt` records when, because both
GDPR and DPDP require a controller to be able to demonstrate consent.

**With no account and no Drive connection, nothing leaves the device**, so every
other answer is no.

**Once the user connects Drive**, the encrypted database is uploaded to *their own*
`appDataFolder`. Declare it rather than argue it is not collection:

| Question | Answer |
|---|---|
| Does your app collect or share user data? | Yes — only when the user connects Google Drive |
| Data type | Health and fitness (workouts, bodyweight, measurements, food) |
| Data type | Personal info — name, and the email of the Google account signed in |
| Collected or shared? | Collected (transferred to the user's own Google Drive). **Not shared with the developer or any third party.** |
| Is it optional? | Yes — the app is fully functional without it |
| Processed ephemerally? | No — it is stored until the user deletes it |
| Encrypted in transit? | Yes — HTTPS, and the payload is itself SQLCipher-encrypted |
| Can users request deletion? | Yes — Disconnect in Settings, and Drive's own controls |
| Collected for | App functionality (backup and restore) |
| Sold? | **No.** See §5. |

Analytics, crash reporting, ads, advertising ID: **none**. `AGENTS.md` rule 1
forbids them and none are installed — worth re-checking before each release, since
a single added SDK changes these answers.

---

## 3. Privacy policy

Play requires a publicly reachable URL, and the same text should be linked from
inside the app. Host this as a page (GitHub Pages is enough) and put the URL in the
Play Console *and* in Settings.

> ### Iron — Privacy Policy
>
> _Last updated: 12 September 2026_
>
> Iron is a personal training log. It runs entirely on your phone.
>
> **What Iron stores.** Your workouts, plans, bodyweight, measurements, food, water
> and settings are saved in a database on your device. That database is encrypted.
>
> **What Iron sends.** Nothing, unless you create an account or turn on Google Drive
> backup.
>
> **If you create an account.** An account is optional and Iron works fully without
> one. If you make one, five things are stored on our server: your name, email
> address, occupation, age and sex. Your workouts, bodyweight, measurements, food,
> water and any areas you flagged to go easy on are never sent there — they stay on
> your phone. We email you about Iron only if you ticked the box asking us to; that
> box is never ticked for you, is never required, and can be turned off in Settings
> at any time. *Delete account* in Settings erases those five fields from our server.
>
> Iron has no analytics SDK. It does not contain ads. It does not use an advertising
> identifier. It does not send crash reports. Beyond the five account fields above,
> nobody — including the developer — can see your data: your training, body, food and
> water are never transmitted to us at all.
>
> **If you turn on Google Drive backup.** Iron uploads an encrypted copy of its
> database to a private folder inside *your* Google Drive, called the app data
> folder. Only Iron can read that folder; it does not appear in your Drive and other
> apps cannot see it. The developer has no access to it. The file is encrypted with a
> key derived from your recovery phrase, which never leaves your device — so without
> that phrase the backup cannot be read by anyone, including Google.
>
> Signing in tells Iron your Google account's name and email address, which stay on
> your device and are used only to show you which account is connected.
>
> **Deleting your data.** *Delete all my data* in Settings erases everything on the
> phone. *Delete account*, also in Settings, erases your name, email, occupation, age
> and sex from our server; you can also do this at <account deletion URL> without
> installing the app. *Disconnect* stops Drive backups; existing backups can be
> deleted from your Google account at any time. Uninstalling removes everything local.
>
> **Children.** Iron is not directed at children under 13.
>
> **Your data is never sold or shared.** It is not used for advertising or profiling.
>
> **Contact.** <your email address>

---

## 4. Also required before submission

- **Target API level** — Play enforces a minimum. `npx expo-doctor` and an SDK
  upgrade keep this current; SDK 57 is fine today.
- **App content declarations** — ads (no), content rating questionnaire, target
  audience, news (no), data safety (above), government app (no).
- **`android.permission.RECEIVE_BOOT_COMPLETED`** — used to restore a running rest
  timer after a reboot. No declaration form, but expect to explain it if asked.
- **Account deletion** — **now mandatory**, because Iron has accounts. Play requires
  both an in-app path (built: Settings -> Account -> Delete account) **and** a public
  web URL where an account can be deleted without installing the app. The web URL is
  still outstanding and a reviewer will check it.
- **Screenshots, feature graphic, description** — Play will not accept a listing
  without them.

---

## 5. What changes if a backend is added

If Firebase Auth or any server is introduced, this document changes substantially
and so does the app's promise to its users:

1. **Account deletion becomes mandatory.** Play requires both an in-app path *and*
   a publicly reachable web URL where an account can be deleted without installing
   the app. This is enforced, not advisory.
2. **The Data Safety answers invert.** Data would then be collected *by the
   developer*, not merely moved to the user's own Drive. The "not shared with the
   developer" line above stops being true.
3. **Consent must be explicit and prominent**, given before anything is uploaded,
   and separate from a terms checkbox. Silence, pre-ticked boxes and bundled consent
   do not count under GDPR or India's DPDP Act, and health and fitness data is
   sensitive under both.
4. **The in-app copy must change.** Settings currently tells users *"Everything
   stays on this phone, and nothing is sent anywhere unless you export it."* Shipping
   a backend without changing that sentence is a false statement to people who
   already installed on the strength of it.
5. **Selling it is not an option.** Play's User Data policy prohibits the sale of
   personal and sensitive user data outright, and health and fitness data is
   sensitive. This is not a disclosure problem that consent solves — the sale itself
   is prohibited. Sustainable alternatives that need no data harvesting: a paid app,
   a one-time unlock, or a subscription for cloud sync, where the sync is the thing
   people are paying for.

Anyone adding a backend should read this section first and update §2 and §3 in the
same change.
