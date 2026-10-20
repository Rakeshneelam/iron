# 12 — Mobile UI revamp: motion, material, and what is still unverified

Handoff for `Claude-Mobile-UI-Revamp-Brief.md` (v2, 18 Oct 2026), implemented 18 Oct 2026
on top of v0.5.0. Ships as **0.6.0, versionCode 7**.

Read §6 first if you only want to know what to distrust.

---

## 1. The finding this work is built on

The app was already carefully *reasoned* — measured contrast, 48/56dp targets, a
centrally gated haptics switch, honest status vocabulary — and completely **still**.

Evidence, not impression:

- `react-native-reanimated` 4.5.1 was a dependency and appeared in **three** files
  (`Ring`, `Toast`, `ExerciseDemo`). Nothing else in the app animated anything.
- Every pressable in the app acknowledged a touch with `opacity: 0.6–0.8`. On a
  filled button that is the same signal `disabled` uses, two steps apart.
- `Sheet` used `Modal animationType="slide"` — the OS transition, which cannot be
  grabbed, reversed, or handed a flick's momentum. **22 sheet instances across 16
  files** use that one component, which is why it was the single highest-leverage
  file in the app (`grep -rn "<Sheet" app src --include='*.tsx'`).
- The root stack used `animation: 'fade'`, the least spatial option available, so
  entering a session and leaving it looked identical and the back gesture had
  nothing to track.
- `motion.spring` existed in the tokens with **zero** consumers.

So the revamp is not a re-skin. The palette, type scale, spacing and target sizes
were already right, and the brief forbids changing the palette anyway. The work is
motion, material, and consistency — applied in the **primitives**, so every screen
inherits it from one place.

## 2. Design direction: heat is state

The free axes — the ones the brief leaves open — were spent on something specific
to the subject rather than on a generic dark theme.

Iron is dark machined steel. Orange is molten. So **heat marks where work is
happening, and cools as work becomes history.** The ration is the whole idea: if
three things glow, nothing reads as live.

| Carries heat | Why |
|---|---|
| The one dominant action (`tone="accent"`) | It is the thing you are meant to touch |
| A running rest timer | The only live process on the screen |
| The set you just logged | For ~900ms, then it cools to match the sets before it |

Nothing else glows. `material.heat` is one token with three consumers.

The ration only works if one accent button is visible at a time, and `accent` is
`PrimaryButton`'s default tone — so that was checked rather than assumed. The
screens with the most buttons are Setup (6: two `accent`, on different states, four
explicitly `neutral`) and Food (4: one `accent` in the body, one `accent` inside a
sheet, one `neutral`, one `danger`). The codebase already observed "one dominant
action per task area", so the glow lands on exactly one target per screen. If a
future screen breaks that, the fix is to scope heat to `size="gym"` rather than to
every `accent`.

Material: every raised surface gained a **one-pixel top highlight**
(`material.edge`, white at 5.5%). Machined metal catches light on its chamfer; a
card with one reads as an object sitting *on* the background rather than a lighter
region *of* it. It is drawn as an absolutely positioned hairline child, not a
border, so it costs no layout and cannot push content down a pixel. It is never
load-bearing — delete it and nothing becomes unreadable.

## 3. What changed

### New files (2)

| File | What it is |
|---|---|
| `src/theme/curves.ts` | Easing curves, the `transition()` helper, `press`, `edgeStyle`, and the `AnimatedViewStyle` type. Separate from `tokens.ts` because these are Reanimated bindings and `tokens.ts` is imported by `tests/theme-contrast.test.ts` under plain `node --test`, where there is no Reanimated stub. |
| `src/components/Press.tsx` | The one press feedback in the app. `scale` for buttons/chips/cards/icons; `highlight` for full-width rows, because a row that scales reads as the whole screen squashing. Every prop passed through lands on a plain `Pressable`, so the existing roles, states, labels, hints and actions are untouched. |

### Changed

| File | Change |
|---|---|
| `src/theme/tokens.ts` | `motion` extended: `press`, `pressScale`, and springs rewritten in the `{duration, dampingRatio}` form Reanimated 4 actually takes (the old `{damping, stiffness, mass}` triple had no consumers). New `material` block. New `color.dangerPressed` (white on it = 5.94:1) and `color.accentWash`. |
| `PrimaryButton` | Press scale; per-tone held colour instead of one shared opacity; heat on `accent`. |
| `Card` | Machined edge in both branches; press scale; `style` widened to accept animated styles. |
| `IconButton`, `ChipRow`, `SegmentTabs`, `SectionHeader`, `DateStepper`, `settings/Row`, `checkin/CheckInRow` | Moved onto `Press`. Rows and bordered fields highlight; buttons and chips scale. |
| `List` (`ListRow`) | Highlight instead of fading the row's text — the one thing the user is reading while deciding whether the tap landed. |
| `Sheet` | **Rewritten.** Drag-to-dismiss with momentum projection, rubber-banded at the top, velocity handed to the settling spring, backdrop opacity derived from the same shared value so the two cannot disagree. Mounts before animating in and unmounts after animating out. Nests its own `GestureHandlerRootView` (see §6). |
| `Screen` | `Animated.ScrollView` with a UI-thread scroll handler; header and dock hairlines fade in only once content is actually under them. The dock's unconditional 1px border is gone. |
| `Stepper` | ± buttons fade their highlight instead of snapping, which matters most on press-and-hold repeat. |
| `RestTimerBar` | Running row glows; progress bar drains **smoothly** between the timer's once-a-second updates via a 1s linear `width` transition. The timer's truth is still `endsAt - now` — this interpolates the gap and touches no timer logic. |
| `Toast` | Layout-animation builders moved to module scope (they were rebuilt on every render) and given real easing. |
| `Ring` | `.get()`/`.set()` instead of deprecated `.value`; explicit easing. |
| `app/_layout.tsx` | Root stack: platform `default` push, `fade` under reduced motion. |
| `app/session/[id].tsx` | The set-logged cooling flash (`COOLING`), scoped to one set id so reopening a session with ten sets logged does not set the whole grid off. |

### Deliberately NOT built

The brief asks for judgement, so these are refusals with reasons, not omissions.

- **No sliding pill on `SegmentTabs`.** Section tabs get switched tens of times a
  day; that tier allows "under 150ms or nothing". A 250ms pill travelling a track
  fails it, and sliding between peers implies a depth three views of one screen do
  not have. They cross-fade in 150ms instead.
- **No collapsing header.** It needs the header box to have a fixed height, and
  every height here is set by text the user may have scaled to 200% (WCAG 1.4.4).
  Hairlines cost no layout and cannot clip anyone's text.
- **No change to the tab bar.** `expo-router/js-tabs` with custom icons and 11pt
  labels was a deliberate choice; swapping in `NativeTabs` would hand the bar's
  appearance to Material 3 on Android and discard that. Tab switches also must not
  animate at all.
- **No entrance animations on list rows.** Lists the user scrolls past all day
  should already be there, and `entering` on a virtualized row re-fires on every
  recycle, which looks like the list flickering while you scroll.
- **No streaks, badges, or celebration.** AGENTS §6. The cooling flash is
  acknowledgement of a commit, not a reward.

## 4. Theme: what was preserved and what moved

**Preserved exactly.** Every colour in `color`: `#0B0B0D` ground, `#141417`
surface, `#E8552E` accent, the `accentFill` pairing, positive/warning/danger. The
type scale and both faces (IBM Plex Sans, Archivo). All spacing, radii, and the
48/56dp target floors. No hex was guessed; all were read from `src/theme/tokens.ts`.

**Added, not altered:** `dangerPressed` (a pressed state the filled destructive
button did not have — it was falling back to a grey), `accentWash` (the first frame
of the set-logged flash; never a ground for text), and the `material` block.

**No contrast exception was needed.** `tests/theme-contrast.test.ts` still passes:
every text token stays ≥4.5:1 on all three grounds, and the new `dangerPressed`
measures 5.94:1 against white — better than `danger` itself.

## 5. Verification actually performed

| Gate | Result | Evidence |
|---|---|---|
| `npm test` | **291 / 291 pass**, 0 fail | Run before any change (baseline) and after every stage |
| `npm run typecheck` | **Clean**, both projects | `tsc --noEmit` + tests project |
| `npx eslint app src` | **Clean**, 0 errors 0 warnings | Caught two real defects, see below |
| Android bundle | **HTTP 200**, 13.86 MB, no Metro warnings | `.expo/.virtual-metro-entry.bundle?platform=android`, twice |
| New code reachable in bundle | Confirmed | Grepped the built bundle for `transitionProperty`, `accentWash`, `rubberband`, the heat shadow, `animationName` |

Two defects the linter caught and that are fixed, worth recording because both
would have shipped:

1. `Sheet` called `setState` synchronously inside an effect to keep the modal
   mounted through its exit — a cascading render on every open and close. It now
   adjusts state during render by comparing against the previous prop.
2. RN 0.86's own `ViewStyle` declares `animationDuration` more loosely than
   Reanimated's `TimeUnit`, so `ViewStyle` and `CSSStyle<ViewStyle>` are genuinely
   incompatible. Anything handed to `Press` is now typed `AnimatedViewStyle`.

## 6. What is NOT verified — read this before believing anything above

**Nothing in this revamp has been run on a physical device or an emulator by me.**
A bundle that builds proves the code compiles and resolves. It proves nothing about
how any of it feels, and feel is the entire point of the work.

The animation guidance is explicit that a dev-mode JS thread hides exactly the
problems you are looking for, so even a dev-client run is not the real test — judge
it on a **release build on the slowest Android you have**.

### Acceptance tests from brief §10

Not prefilled. "Not tested" is the honest result for anything behavioural.

| ID | Scenario | Result |
|---|---|---|
| A01 | New user, narrow phone, main task understandable | **Not tested** — needs a person who has not seen it |
| A02 | Detail → back restores context | **Not tested**. Changed: back is now a platform push with a tracking gesture, not a fade |
| A03 | Keyboard open, field + errors + submit reachable | **Not tested**. `Sheet` keeps its `KeyboardAvoidingView`; toast still lifts above the keyboard |
| A04 | Save fails and is retried, saved once | **Not applicable** — no network in the write path (AGENTS §1.1). SQLite writes are immediate and synchronous |
| A05 | Reload after save, record correct | **Not tested** by me. Covered statically by the 291 unit tests over the repositories |
| A06 | Mistake corrected/deleted, summaries agree | **Not tested**. Undo paths untouched by this work |
| A07 | Screen-reader user completes a core flow | **Not tested.** Structurally preserved: every role, state, label, hint and custom action still sits on the `Pressable`, because `Press` spreads props onto it rather than re-implementing them. Preservation is not the same as verification — this needs a TalkBack pass |
| A08 | Larger text, long labels, nothing lost | **Not tested.** Actively designed for: no animated heights anywhere, which is why the collapsing header was rejected |
| A09 | Empty / error state has a next action | **Not tested**. Untouched by this work |
| A10 | Desktop | **Not applicable** — Android-first native app, no web target |
| F01 | Log an exercise with no active plan | **Not tested**. "Log a workout" exists on Today's no-plan state and `startSession(null)` supports it |
| F02 | Set count changed mid-session | **Not tested**. Untouched |
| F03 | Tea logged with a serving adjustment | **Not tested**, and **partly someone else's work in progress** — see §7 |
| F04 | Rest/skip marked and reversed | **Not tested** by me. `tests/db-rest-day.test.ts` (uncommitted, from §7) covers it at the repository level and passes |
| F05 | Session crosses midnight / backdated | **Not tested** by me. `tests/db-date-writes.test.ts` passes |

### The 0.6.0 APK is one commit behind the tree

EAS build `a412f470-2388-4d2e-a9ad-be4044d33689` uploaded its snapshot before the
last seven files were converted onto `Press` (`SectionHeader`, `DateStepper`,
`settings/Row`, `checkin/CheckInRow`, `water`, `ExercisePicker`,
`RecoverySection`). Every headline change — `Press`, `Sheet`, `Screen`, `Card`,
`PrimaryButton`, the set-logged flash, the rest timer — **is** in that APK; those
seven smaller conversions are not. The dev server always serves the full tree, so
`npm start` is the accurate preview. Rebuild for an APK that matches HEAD.

### Also not done

- **No before/after screenshots.** Brief §12 requires them at comparable sizes. I
  could not capture any — no emulator or device in this environment. This is a real
  gap in the handoff, not an oversight.
- **No performance measurement.** No frame traces, no cold/warm start numbers, no
  measured tap-to-acknowledgement latency. The brief's §17 budgets (100ms
  acknowledgement, 120–200ms small transitions) are what the code was *written*
  against; whether it meets them on device is unmeasured. Web Vitals (§8) do not
  apply to a native app.
- **No user testing.** Brief §11 wants ~5 representative users. Zero.
- **No microcopy pass.** §15 asks for a copy inventory; this revamp changed visual
  and interaction behaviour and almost no strings. Two genuine observations from
  reading the copy: the status vocabulary is already in line with §15 ("Missed" not
  "Skipped", "Rest day" neutral, "A missed day is just an empty ring"), and units
  are explicit in set text. Against that, the app leans heavily on `A · B · C`
  middot strings and uppercase eyebrow labels, both of which the design guidance
  flags as generic tells. Worth a pass; not done here.
- **No notification work.** §16's decision rules are already implemented in
  `src/engine/reminders.ts` and `docs/06-NOTIFICATIONS.md` (debt-based, silent when
  ahead), and `tests/reminders.test.ts` + `tests/notification-routing.test.ts` pass.
  I neither changed nor re-verified them.

### Known P2 debt

**Nine** files still have pressables that have not moved onto `Press`, so their
touch feedback is inconsistent with the primitives:

```
app/(tabs)/food.tsx            app/setup.tsx
app/(tabs)/program.tsx         src/features/exercises/ExerciseGuide.tsx
app/history/index.tsx          src/features/food/AddFoodSheet.tsx
app/library/index.tsx
app/program/[dayId].tsx
app/session/[id].tsx
```

Regenerate with `grep -rln "pressed && styles\." app src --include='*.tsx'`.
`app/session/[id].tsx` is partly converted — its set tiles use `Press`, three other
pressables on it do not. Most of the rest already change a background colour rather
than fading opacity, so they read acceptably today; they simply do not share the one
component. Mechanical to finish, and `AddFoodSheet.tsx` should wait until §7 is
committed so the two diffs do not tangle.

**`Sheet`'s nested `GestureHandlerRootView` is a belt-and-braces fix.** A `Modal`
renders into its own view hierarchy, outside the root provider, and gesture-handler
is known to need its own root there on Android — where the failure mode is a
silently dead gesture with no error. The installed package ships no documentation to
confirm it for v2.32, so this is defensive. **If the sheet drag does not work on
Android, this is the first thing to check, not the last.**

## 7. Uncommitted work from an earlier session, left intact

The working tree already contained substantial unfinished work when this started
(timestamps 18 Oct, ~13:10–13:41), implementing parts of brief §9 — and it is
deliberately untouched:

- `src/engine/foodText.ts` (new, ~450 lines) — a pure-TS plain-English meal parser
  ("2 rotis and a katori of dal"), with a documented refusal to use an LLM because
  that would mean a network call and an API key, both forbidden by AGENTS §1.1. Its
  tie-breaking is specifically built so "tea" resolves to whichever tea you actually
  drink rather than guessing between chai and black tea — that is brief F03.
- `tests/food-text.test.ts`, `tests/db-rest-day.test.ts` (new) — both pass.
- `rest` added as a session status distinct from `skipped`, so a rest day no longer
  consumes the plan's next day — brief F04.
- Changes in `AddFoodSheet`, `progress.ts`, `sessions.ts`, `schema.ts`, Today,
  review, history, summary, setup.

A patch snapshot was taken before any of this revamp began. All of it is still
uncommitted; it needs its own review and commit, separately from this work.

## 8. How to review it

```bash
cd gymapp
npm test            # 291 tests, must stay green
npm run typecheck
npx eslint app src
npm start           # dev client over Wi-Fi
```

What to actually look at, in order of how much it matters:

1. **Log a set.** The tile you just filled should arrive warm and cool over ~0.9s,
   in the same frame as the existing success haptic. This is the one piece of
   delight in the app and it should be the most-felt change.
2. **Drag a sheet down by its handle** (any sheet — check-in, plates, edit set).
   Then: flick it hard and short (it should dismiss on velocity alone, not
   distance); grab it mid-flight (it must continue from where your eye last saw it,
   not jump); drag it *up* past the top (it should resist, not stop dead).
3. **Hold a ± button** on the session screen and watch the highlight.
4. **Scroll any screen** and watch the header and dock hairlines arrive.
5. **Rest timer** — the bar should drain continuously, not tick once a second.
6. **Turn on Reduce Motion** (Android: Settings → Accessibility → Remove
   animations) and repeat 1, 2 and 4. Sheets should not translate, the flash should
   not fire, screen transitions should fade.
7. **Set font size to maximum** and open the session screen and a sheet.
