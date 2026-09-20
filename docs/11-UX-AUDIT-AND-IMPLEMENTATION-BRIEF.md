**Iron UX audit and implementation brief for Claude — 21 September 2026**

This is a source-based review of the current app, including its routes, shared components, logging flows, repositories and project requirements. No physical Android device, emulator or screen recordings were available. Code-confirmed behavior is distinguished below from layout risks that require device verification. This document proposes changes; the app has not been modified.

**Assessment**

The app has good foundations: immediate SQLite writes, bottom-anchored set logging, meal repeats, reusable sheets, and explanations for workout suggestions. Its biggest UX problem is unclear ownership. Six tabs expose a mixture of daily tasks, occasional administration and reports. Today and Daily overlap, while Body excludes weight. A user must learn the implementation to know where to go.

Keep the existing visual identity. Prioritize navigation, understandable actions, readable workout inputs, and reliable correction of mistakes before decorative changes. Useful shortcuts should remain when they open the same editor. Removing every repeated button would make frequent actions slower.

**The navigation decision — implement this exact structure**

Use exactly five bottom tabs, in this order: **Today · Food · Body · Plans · Progress**. Daily disappears from the visible tab bar. Water remains a detail screen. Settings remains a header destination.

| Tab | User's question | Owns | Contextual links |
| --- | --- | --- | --- |
| Today | What am I doing now? | Upcoming/active workout, Start/Resume, workout-day choice, optional compact check-in | Shared check-in, Water, Settings |
| Food | What have I eaten or drunk? | Meal diary, repeat meals, food/recipe selection, nutrition targets | Compact Water row opening the existing Water screen; body-weight goal link |
| Body | How is my body changing, and how do I feel? | Weight, recovery/check-ins, measurements | Profile & goals in Settings |
| Plans | What will I train? | Saved plans, templates, day/exercise editing, training schedule | Exercise library; equipment settings |
| Progress | How has my training gone? | Weekly training summary, approved suggestions, workout-history access | Canonical exercise history; compact links to Body and Water details |

Body has three local section selectors: **Weight · Recovery · Measurements**, defaulting to Weight. Keep these within one tab rather than creating more bottom tabs. Profile fields belong to **Settings → Profile & goals**; do not give them their own tab.

Material's navigation-bar guidance describes three to five destinations. Five preserves direct access to Iron's main tasks while resolving the current six-tab crowding. The particular grouping above is this audit's recommendation, not a claim from user testing. [Material navigation-bar guidance](https://github.com/material-components/material-components-android/blob/master/docs/components/BottomNavigation.md)

**What to consolidate, and what to keep**

| Current overlap | Exact decision |
| --- | --- |
| Full check-in card on Today and Daily | Body owns the detailed view; Today keeps a compact shortcut into the same CheckInSheet. |
| Weight in CheckInSheet, CheckInCard and Daily's separate action | Keep quick access, but use one shared weight field/editor behavior and existing weigh-in repository. Do not create separate kinds of weight records. |
| Daily's weight trend and Today's weight chart | Full trend lives in Body → Weight. Remove the chart from Today. |
| Body measurements and personal profile mixed together | Measurements stay in Body; profile moves to Settings. |
| Water hidden behind a check-in cell | Keep /water; add a clearly labeled entry in Food and retain the compact Today shortcut. |
| Session Next/Finish in a card and the fixed controls | Keep one primary action in the fixed controls; the card becomes status text. |
| How-to via exercise heading and session action row | Keep one explicit How-to action beside the exercise heading. |
| Add exercise in session action row and Workout sheet | Own it in the clearly labeled Exercises sheet; an empty session can offer a shortcut to the same picker. |
| Detailed lift chart in Progress and exercise details | Exercise details own full history; Progress shows a compact result linking directly to it. |
| Plan activation on both list and detail | Keep both: the same action is useful in both contexts. Share the handler and Undo behavior. |
| Planned muscle volume and logged muscle volume | Keep both. Label them “Planned weekly sets” and “Logged sets this week.” They answer different questions. |
| Food repeat-day, repeat-meal and usual items | Keep all three. They operate at different levels and save taps. |

**Instructions to Claude**

Implement the tickets below in bounded commits. Read AGENTS.md, CLAUDE.md and the matching specs first. Respect the current build-phase/device gates. This is a refinement of the existing app, not permission to rebuild it.

- Keep SQLite as the source of truth and writes through repositories. Preserve all existing user data, IDs, session status, history and backup compatibility.
- Do not rewrite src/engine. Put presentation changes in components/features; query or correction changes in repositories. Keep existing native rest-timer and keep-awake behavior.
- Add no dependencies without asking. Existing React Native, Expo, Reanimated, Gesture Handler and list components are sufficient for this brief.
- Keep screen colors, type, spacing and dimensions in theme tokens.
- Reversible committed actions get immediate feedback and Undo. Confirm only irreversible destruction of existing data.
- A contextual shortcut must open the canonical editor with the same value, validation and save behavior. Do not duplicate a form to support another entry point.
- Preserve route compatibility and notification destinations. Audit notification response routing before hiding/moving routes. /daily already appears in reminder output; route it to Body → Weight. Existing measurement notifications must still open Measurements. Normalize these at the routing boundary without rewriting the engine.
- Update the architecture/design docs and mirror any changed project instructions between gymapp/AGENTS.md and gymapp/CLAUDE.md. Explain intentional changes to the old “Daily” structure rather than leaving contradictory instructions.
- Do not claim physical-device checks passed unless actually performed. Do not start a later build phase to compensate for a failed device check.

**UX-01 · P1 · Consolidate the tab structure**

Evidence: app/(tabs)/_layout.tsx:11 defines six tabs. app/(tabs)/daily.tsx:68 owns check-in, weight and sleep. app/(tabs)/body.tsx:37 owns measurements and profile; its own comment says these change only every few weeks.

Change:

1. Set the visible tab order to index, food, body, program, review, using the labels defined above.
2. Move Daily's content into reusable Body feature components; do not paste a second copy into Body.
3. Render Weight, Recovery and Measurements via Body's local section selector. Each section has one clear primary action: Log weight, Check in, Log measurements.
4. Preserve /daily as a hidden compatibility redirect to Body's Weight section. Explicitly hide it from the router's automatic tab discovery.
5. Move DetailsSheet access into Settings → Profile & goals; Body has a quiet link there, not another profile editor.
6. Let the Body section be selected by route parameters so notification/deep-link entry reaches the requested section. Preserve the chosen section on ordinary tab switches.
7. In src/services/notifications.ts, map a notification with content.data.type === 'measurements' to /body?section=measurements. Ordinary Body tab entry still defaults to Weight; /daily maps to Weight. Verify both cold-start and already-running notification entry.

Acceptance: Exactly five labeled bottom tabs. Weight and measurements are discoverable under Body. Old reminder links reach the right content. All preexisting readings still appear; this reorganization needs no destructive database migration.

**UX-02 · P1 · Make Today a workout-first screen**

Evidence: app/(tabs)/index.tsx:86,155,182,217 mounts CheckInCard before the workout in all main states. CheckInCard.tsx:65–82 includes three cells and an optional chart. index.tsx:84 intercepts Start to open another sheet when a check-in is absent.

Change the visual order:

1. Header: Today/date and Settings.
2. Active workout, if one exists: name, progress, elapsed time. Otherwise show the next workout's name, exercise count and duration.
3. Compact optional check-in row. Show “Check in — optional” or a short saved status and Edit. Opening it reuses CheckInSheet. Keep a compact Water shortcut.
4. Workout preview. Put “Change workout day” and the duration choice together; expand day choices on demand rather than always showing every day chip.
5. Secondary workout options and neutral weekly activity overview.
6. Fixed bottom Start/Resume button, retained from the current implementation.

Remove the body-weight chart from Today. Start should start the session directly using available saved readiness data; do not automatically interpose the check-in sheet. If someone explicitly opens the check-in first, allow Save and start. Preserve the existing optional warm-up workflow after starting.

Use Today states deliberately: active session prioritizes Resume; rest day says “Rest day” and offers Train anyway plus optional recovery; a finished session shows today's result with a quieter Start another workout; no plan offers Choose a plan and an empty workout. Never describe cancelled work as completed.

Acceptance: On a 360dp-wide phone at normal text size, workout identity/status and Start/Resume are visible without scrolling. Starting requires one tap from Today even without a check-in. Increasing text size may reflow secondary content, but the fixed action and current workout remain usable.

**UX-03 · P1 · Unify Body entry and settings ownership**

Evidence: Daily has weight entry both through CheckInCard and its Weight heading (daily.tsx:69–71). DetailsSheet edits profile separately (src/features/body/DetailsSheet.tsx:26). CheckInSheet.tsx:86 says “Saved as today's weigh-in” before its Save handler has run.

Change:

- Extract reusable weight-input behavior for CheckInSheet and WeighInSheet. Keep the short weight-only sheet for users who just want to weigh in. Both must edit the same date's reading.
- An untouched previous/default weight must never become a new weigh-in. Offer an explicit “Use this weight” action, including when the number happens to equal the default.
- Label unsaved selections “Will save with check-in”; show “Saved” only for committed data. Clearing a check-in must explain that a separately saved weigh-in remains; weight deletion belongs to the weight editor.
- Body → Weight: current smoothed trend, range control, recent weigh-ins, View all and Log/Edit weight. Body → Recovery: shared check-in action, sleep trend and recorded check-ins that can be corrected. Body → Measurements: existing measurements content.
- Let the shared check-in editor accept a date so past sleep/soreness/stress can be corrected; allow individual optional answers to return to “Not recorded.” Measurement edits must include date correction. For new measurements, show common/previously used sites first and let users explicitly record an unchanged value without incrementing then decrementing it. Never save untouched fallback values.
- Move the body-weight goal selector into the single Profile & goals editor; show its current value and an Edit link in Body and Food targets. Keep **Training goal** and **Body-weight goal** as separate labeled fields: goalFocus and phase are different settings, not duplicate data.
- Do not label a maximum of 60 displayed weigh-ins “Show all” (daily.tsx:56,127). Use a paginated history when all readings are requested.

Acceptance: Editing today's weight from either entry point immediately updates every display with one record for that date. Dismissing an untouched form writes no invented measurement. Profile/goal edits have one implementation and contextual links return to their caller.

**UX-04 · P1 · Simplify the workout controls and fix exercise navigation**

Evidence: app/session/[id].tsx:215 searches only after the selected exercise for unfinished work. Next/Finish appears at :564–577 and :609–615. How-to and Add are repeated at :589–590 and :651. SetControls.tsx:46 puts two horizontal steppers side by side; Stepper.tsx reserves 112dp per field for its ± buttons and shrinks the value to fit.

Change:

1. Keep one primary Log set → Next exercise → Finish workout action in the bottom dock. Make the completion card a status line without another Next/Finish button.
2. Search the whole session for the next unfinished, unskipped exercise, wrapping to earlier exercises. Normal Finish becomes primary only after every exercise is completed or skipped. Keep explicit Finish early and Cancel workout available in the exercise-list sheet.
3. Provide a clearly labeled “Exercises · 3/6” button opening the existing checklist. Tiny progress segments become noninteractive indicators; remove redundant previous/next exercise controls once the checklist and dock handle navigation.
4. Retain one How-to action beside the exercise name. Keep Swap and Skip/Remove accessible beside the current exercise. Put Add exercise in the Exercises sheet; preserve an empty-session shortcut.
5. Give weight and reps/duration each a large value above their own pair of ± buttons. Do not squeeze a value such as 102.5 between two 56dp buttons in a half-width field. Keep normal logging keyboard-free; preserve explicit numeric entry via the existing gesture and accessible action.
6. Put a concise previous-session comparison and target explanation immediately above the dock. The actual entry values must be at least as prominent as the suggested values. A suggested change must state the reason and offer a one-tap way to retain the planned prescription.
7. After target sets are complete, collapse the inputs behind “Add another set” and emphasize Next exercise. Every active-session action, including secondary ones, must meet the project's 56dp target.

Acceptance: Jump to the last exercise, complete it, and the primary action points to earlier unfinished work. On 360dp and 200% text scaling, values, units and action labels remain readable and the dock does not cover the exercise identity. Core weight/reps/log interaction requires no scrolling. Check loaded exercises, bodyweight, bands, timed holds, cardio and supersets.

**UX-05 · P0 · Protect saved sets and keep the timer accessible**

Evidence: session/[id].tsx:211,324 treats a warm-up-only workout as empty when cancelling. Today's discard path similarly counts only working sets (index.tsx:43,142). Warm-up logging returns before Undo (session/[id].tsx:257), and warm-up rows are not editable. RestTimerBar is under current && !current.skipped at :596–598.

Change:

- Base discard protection on every persisted set, including warm-ups, in both Today and the session screen. Use the same cancellation behavior in both entry points.
- Cancel with saved data must offer Keep sets and a clearly destructive Discard option. Cancellation never counts as completion. Do not silently delete warm-up logs.
- Give warm-up logs Undo and allow tapping a saved warm-up to open EditSetSheet. Preserve isWarmup during edits and in restored rows.
- Mount the running RestTimerBar independently of the selected exercise. It remains available when an exercise is skipped/removed or the exercise list becomes empty. Keep the existing native timer as the authority.

Acceptance: Log only a warm-up, cancel and keep it, force-quit, reopen: the log survives and the workout is cancelled. Editing/deleting/undoing a warm-up works. Selecting a skipped exercise during rest does not remove timer controls. Background, lock-screen and notification timer behavior still work on Android.

**UX-06 · P0 · Make date selection govern the whole Water screen**

Evidence: app/water.tsx:26,28 selects viewDate for Entries, but :81–84 displays today's consumption and :94 quick-adds to today. Custom amount instead starts from viewDate (:150 onwards). Identical-looking add actions therefore affect different dates.

Change:

- Move one DateStepper below the Water header. The ring, entries, totals, quick amounts and custom amount all use that selected date.
- Pass the selected date explicitly to every write. Show “Added 500 ml to Yesterday” in historical-date feedback and include Undo.
- Show reminder/pace status only for today. Historical days show their logged total; do not imply that today's target was the target historically unless a snapshot exists. If using the current target for comparison, label it “Current target.”
- Use the shared DateStepper in Food too; replace its unlabeled ‹/› text buttons. Add a visible return-to-Today action when browsing another date.
- Apply Food's existing midnight/resume principle to date-based screens: follow the new day if the user was viewing today, preserve an intentionally selected historical day.

Acceptance: Select Yesterday and use every add method: all entries land on Yesterday, today's total remains unchanged, and Undo affects exactly the inserted entry. Resume after midnight and verify the selected date and writes agree.

**UX-07 · P1 · Streamline Food without losing the fast repeat flows**

Evidence: app/(tabs)/food.tsx:91–113 places four stats before logging; :177–184 puts a large New recipe card after the whole diary and opens it with breakfast as context. AddFoodSheet.tsx:132–133 unmounts recipe creation when switching to New food, while :223 explicitly sends users there for a missing ingredient.

Change:

- Keep Protein/Calories as the main summary; place Carbs/Fat in a compact secondary row. Keep repeat-yesterday prominent when applicable.
- Add the compact Water entry beneath the summary, linking to /water; do not embed a second complete Water screen.
- Pass Food's selected date to Water as a route parameter and initialize its DateStepper from that value. The displayed Water total/label in Food must refer to that same date. Browsing yesterday's Food must not silently open today's Water.
- Keep meal sections with their contextual Add food, Repeat and usual-item shortcuts. These are useful repetitions, not redundant screens.
- Put “Saved meals & recipes” near the top as a secondary destination. Reuse the recipe components there. Remove the large bottom New recipe promotion.
- Separate recipe creation from meal logging. Creating a recipe must not imply breakfast. Logging a saved recipe uses the meal/date chosen by the user; a global entry must expose those choices.
- Keep recipe drafts in the owning flow when opening an ingredient creator. “Create ingredient” returns to the same draft with its name, servings and existing ingredients intact. Provide explicit ingredient removal, not just a zero-gram workaround.
- Use one canonical food/recipe picker and creation flow from every entry point. After logging, show the item, amount and destination with Undo.

Acceptance: Repeat yesterday in one tap with Undo. Add food to Dinner without losing Dinner context. Start a recipe, create a missing ingredient, return, and finish without re-entering earlier fields. Creating a recipe alone creates no meal log.

**UX-08 · P0 · Replace numeric sentinels with understandable target controls**

Evidence: src/features/food/TargetSheet.tsx:33–52 presents null automatic targets as 0. The first + tap writes a manual target of 50 kcal or 5 g protein rather than adjusting the current calculated target.

Change:

- Each overridable target uses an explicit **Automatic / Custom** selection. Preserve independent calorie/protein overrides.
- Automatic shows the actual effective calculated value and plain-English basis. Null can stay an internal representation; never display it as a zero target.
- Selecting Custom initializes from the currently effective value. Subsequent adjustments start there; an untouched calculated value must not jump to the smallest increment.
- “Use automatic target” clears the relevant override. Apply the same interaction model to Water targets where applicable.
- Keep target overrides in their domain sheets; link to the shared body-weight goal editor rather than duplicating that selector. Provide immediate save feedback and Undo for committed target changes.

Acceptance: If effective calories are 2,300, Custom begins at 2,300 and + produces 2,350. Automatic restores the calculated value. Changing protein leaves the calorie mode unchanged, and vice versa. No engine formula changes are required.

**UX-09 · P1 · Make Progress and history useful for finding and correcting work**

Evidence: review.tsx:257–279 buries history at the bottom and only renders its entry when workouts exist. :213 shows only eight lifts without View all. History's TextField uses only onCommit (:47–52), so search waits for blur; :34,91 caps results at 200. “This year” actually means the previous 365 days (:25,32). Summary always routes Done to Today (session/summary/[id].tsx:171), and historical correction requires reopening the session (:173).

Change:

1. Order Progress as period selector, concise weekly totals, always-visible Workout history entry, up to three actionable suggestions, lifts, and collapsible detailed breakdowns. Keep missing days neutral.
2. Add View all lifts. Link a lift directly to its existing exercise page's History section; avoid another full chart implementation inside Progress. Label dates/scopes consistently when browsing an old week. Current deload actions belong to the current week.
3. Make history search update while typing using onType or a dedicated controlled input. Do not change save-on-blur settings inputs globally.
4. Rename the rolling filter to “Last 12 months.” Replace the 200-result dead end with stable cursor pagination and a virtualized list using existing dependencies. Keep filters and scroll position on return.
5. A historical workout gets a workout/date title and top Back. Return to the actual caller; use a safe fallback only for cold/deep links. A just-finished workout may retain “Workout saved” and Done → Today. Do not push a new session cooldown at someone browsing an old workout.
6. Expand saved exercises into individual warm-up/working sets and reuse EditSetSheet directly. Corrections must update repository aggregates without reopening the session, changing its original timestamps/status, advancing the plan, or interfering with today's active workout.
7. Format timed exercises as duration using existing measure-aware helpers. Do not add stored seconds to a “Reps” total or display estimated-1RM comparisons for timed work. Put permanent workout deletion in overflow with its existing destructive confirmation.
8. Starting/ending a deload is reversible: apply immediately with Undo instead of the current End deload confirmation (review.tsx:128–139).

Acceptance: With 250+ matching sessions, the oldest remains reachable. Type a search, open a result, go Back: query, filters and position remain. Correct yesterday while today's workout is active; both sessions retain their original status/time. A 600-second cardio entry reads 10 minutes. Verify summary and Progress recalculate after edit/delete/Undo.

**UX-10 · P2 · Clarify plans and group Settings by task**

Evidence: program.tsx:82 calls the number of rotation days “days a week”; plan/[id].tsx separately edits daysPerWeek. Weekly totals use selected weekdays first in repositories/progress.ts:134. Settings mixes training, equipment, preferences, quiet hours and data links into a long page.

Change:

- Distinguish “N workouts in rotation” from “N scheduled days per week.” Do not silently equate or rewrite these values. Use the same weekly-target resolver/display policy in Today, Plans and Progress; preserve current engine progression rules.
- Plans → Training schedule owns preferred weekdays and typical duration. The Settings shortcut opens that same editor. Existing workouts in the plan remain a rotation, independent of calendar weekdays.
- Show active plan first, saved alternatives below, then collapsed archive. Keep activation contextual and undoable. Expose the exercise library with a readable label, not only a book icon.
- Make Settings a short list: Profile & goals; Training preferences; Equipment; Reminders; Backup & restore; Your data. Move detailed controls under these destinations. Training preferences links to the shared schedule and owns warm-up/rest/haptic preferences; Reminders owns quiet hours.
- Use consistent Back on navigational screens and Close/Done for sheets or completion. Provide valid fallback destinations for cold links.

Acceptance: A four-workout rotation with three selected weekdays says “4 workouts in rotation · 3 scheduled days per week.” There is one weekday editor. Editing it updates all relevant summaries without resetting the rotation. Returning from a settings detail returns to Settings, not Today.

**UX-11 · P1 · Fix shared readability, reach and accessibility**

Evidence: tokens.ts:14 defines textFaint as #5C5C68; :16,19 pairs #E8552E with white. Computed token contrast is approximately 2.79:1 for textFaint on surface, 2.55:1 on surfaceHigh and 3.64:1 for white on accent. PrimaryButton's ordinary label is 15px. Toast.tsx:44 places Undo at the top; Screen.tsx reserves a fixed action-bar allowance even without a dock. Sheet has a tappable handle but no visible close label. Chart responders claim every starting gesture (TrendChart.tsx:78–81).

Change:

- Keep muted body text readable. Reserve textFaint for nonessential decoration, or replace it with a token meeting 4.5:1 for small meaningful text on every supported surface. Use a separate filled-action background/foreground pairing meeting that target; do not darken all accent text indiscriminately.
- Increase the shared ordinary touch target to 48dp for Android, retain at least 56dp for active-session controls. These exceed the repository's 44dp floor. Check both width and height; icon artwork size is not the touch target.
- Move actionable Undo feedback within thumb reach, above the actual fixed dock/tab bar/keyboard as appropriate. It must never cover Log set or another primary action. Use measured obstruction heights and a single active host/lifecycle across root and modal surfaces. Honor accessibility-recommended timeout and announce committed actions.
- Make Screen accept an actual footer/dock clearance rather than reserving 96dp everywhere. Respect safe areas and dynamic text size. Do not clip buttons with numberOfLines=1 or shrink critical numeric values to hide layout problems.
- Give sheets an obvious Close action, accessible title/focus handling, and keyboard-safe primary actions. Draft dismissal and committed live-setting changes must have truthful labels; don't imply a draft was saved.
- Permit vertical page scrolling when a gesture begins over a chart; activate chart scrubbing intentionally. Provide a textual value/date alternative to chart-only information.
- Respect reduced motion. Verify haptics off actually silences shared controls, not only workout commit feedback.

Acceptance: Test 360dp width and 200% text size, TalkBack, reduced motion and keyboard open. All visible action labels and values remain identifiable. Undo is reachable and doesn't block logging. Swiping vertically over a chart scrolls the page. Run contrast checks on enabled text/control states. These layout checks require a device; the source review alone cannot certify them.

Android recommends 48dp touch targets. WCAG's normal-text contrast reference is 4.5:1; it is used here as a measurable readability target. [Android accessibility guidance](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views), [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

**UX-12 · P0 · Restore the required local-only setup and profile experience**

This is a conflict with the supplied product requirements, not a preference about tab placement. Both AGENTS files require no accounts/backend and one setup screen. app/setup.tsx:24–25 defines four stages; :17,65–77,119 wires account reads/writes. settings/index.tsx:95–103 exposes Account. settings/account.tsx:95 explicitly describes personal details stored on a server.

Change:

- Replace the four-stage flow with one setup screen containing local profile and plan selection. Keep infrequent training details in expandable options; reuse the existing recommendation engine. Provide one explicit Finish setup action.
- Setup currently defaults weight to 70 kg and unconditionally records it (setup.tsx:44,116). Require explicit entry/confirmation before creating a weigh-in. Skipping that field must leave weight unrecorded; a calculation fallback must never masquerade as a measured value.
- Remove account/sign-in/sign-up/marketing surfaces and their runtime calls from the app. Turn old account routes into safe redirects to local Profile & goals; do not leave hidden working login screens.
- Treat optional Google Drive authorization as backup-specific authorization, never an Iron account. Keep it out of setup's primary path and preserve a secondary Restore existing backup path.
- Request optional reminder permission in context when enabling reminders, not automatically before setup is understood (app/_layout.tsx:85).
- Preserve existing setupDone, local profile and training history during upgrade. Do not delete remote records, deployed infrastructure or backup files as part of a UI task. Any legacy service retirement requiring external destructive actions is separate work.
- Follow the supplied requirement that backups are user-initiated. Do not silently enable auto-upload when connecting Drive or run startup uploads; reconcile the existing backupIfDue path and contrary older copy/specs explicitly.

Acceptance: Fresh installation reaches Today from one setup screen without an Iron account or network requirement. Existing installation opens Today with its data intact and sees no setup again. Ordinary app use makes no account/backend requests; Drive is used only by the explicit backup/restore flow.

**UX-13 · P0 release follow-up · Make the advertised recovery flow usable**

This is a separate backup workflow defect discovered during the settings review. Avoid mixing a cryptography redesign into the tab refactor.

Evidence: settings/backup.tsx advertises recovery on another phone. settings/restore.tsx:57–73 has no recovery-phrase entry and calls restoreFromDrive(fileId), then reports that another install's phrase is missing. services/backup.ts:126–127 opens the staged backup with the current installation key.

Change: Add explicit recovery-phrase entry to the existing restore flow, use the supplied phrase to inspect/decrypt only the staged backup through the established key helpers, validate its contents, then present a concrete restore preview before the single final destructive confirmation. Reuse validated transactional import. Keep the current database/key untouched on wrong phrase, invalid file or cancellation. Do not invent a new encryption format or upload anything to an additional service. Correct Wi-Fi/automatic-upload copy unless the implementation and current product rules actually support those claims.

Acceptance: Make an encrypted backup on installation A and restore it on installation B with A's phrase. Wrong phrase changes nothing; cancellation changes nothing; successful restore matches preview counts. This needs meaningful backup tests and physical-device verification before claiming the advertised recovery feature works.

**Delivery order and verification**

1. Fix immediate correctness risks: UX-05, UX-06 and UX-08. Address UX-12's product-rule violation in its own commit/workstream. Track UX-13 separately as a release blocker for advertised cross-install recovery.
2. Implement UX-01, UX-02 and UX-03 together as the navigation/ownership change. Then UX-04, UX-07, UX-09 and UX-10. Apply UX-11's shared-component work alongside the affected screens, followed by a full device pass.
3. Run npm test, npm run typecheck and npm run lint. Add focused regression coverage for date-targeted writes, all-set cancellation, next-pending exercise selection, target-mode conversion and history corrections. Do not add shallow tests that merely assert component markup.
4. On physical Android, exercise fresh install, upgrade with existing data, active workout, completed workout, rest day, empty history, long history, keyboard open and large text. Force-quit after each committed log/edit and verify it survives. Test native rest timer while backgrounded and screen-off.
5. Capture before/after screens for Today, the five-tab bar, Body sections, Food, active workout and Progress/History. Report which checks were run and which remain unverified. Verify iOS compiles as the secondary target. Leave no console.log calls.

The final implementation is complete only when tasks have clear homes, shortcuts share their editors, the existing data survives, and the physical-device definition of done in AGENTS.md is satisfied.
