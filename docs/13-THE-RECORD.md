# 13 — The Record: Iron's design language

The "Project Beyond Human" brief (Oct 2026) asked for a ground-up reinvention of the
interface, real and working, not a concept. This is the language that came out of it,
how it is built, and — read §8 first if you only want to know what to distrust — what
has and has not been verified.

---

## 1. What the product actually is

Read from the code, not assumed: Iron is a private, local-first training log whose
engine (`src/engine`) prescribes every next set from your own history and says why in
plain English, with food, water and bodyweight tracked beside it. Its character is in
AGENTS.md, and it is unusual for a fitness app:

- **Honest advice from your own record.** Every number shows its reasoning; nothing is
  changed for you (§1.5).
- **Calm.** Missed days are neutral, there are no streaks, raw weight is never the
  headline, reminders are silent when you are ahead (§6).
- **Fast in the gym.** One thumb, no scrolling mid-set, writes are immediate (§7).

So the most powerful thing it does is not "track fitness". It **turns what you did into
what to do next, and shows its working**. The interface had to make that working
visible — the record — without becoming the dashboard every tracker already is.

## 2. Concept exploration (brief §25)

Fifteen directions were developed and scored 1–5 on the brief's criteria. Abbreviated:

| # | Direction | Orig. | Everyday use | Logging speed | Honesty | Feasible | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | Living performance organism (generative form that grows) | 4 | 1 | — | 2 | 2 | Rejected: decorative, invites physiological claims the data cannot back (§5 warns) |
| 2 | Strength instrument (dials, gauges) | 3 | 4 | 4 | 4 | 4 | **Kept in part**: the Rule under the stepper. Skeuomorphic dials rejected |
| 3 | Constellation (exercises as an explorable space) | 3 | 2 | 1 | 3 | 3 | Rejected: costs taps, poor at numbers (also rejected in the previous pass) |
| 4 | Continuous journey (one timeline, many zooms) | 3 | 4 | 4 | 5 | 4 | **The spine** |
| 5 | Intent canvas (UI assembles around intent) | 3 | 4 | 3 | 4 | 3 | Kept in part: Today's emphasis follows state, its structure does not |
| 6 | Athletic editorial | 3 | 3 | 3 | 4 | 4 | Kept in part: the day's name as a headline |
| 7 | Kinetic system (rhythm, pulsing reps) | 3 | 2 | 3 | 4 | 3 | Rejected: motion fatigue, battery; rhythm kept as data (the session score) |
| 8 | Minimal precision engine | 2 | 5 | 5 | 5 | 5 | Kept as a discipline, not an identity |
| 9 | Training archive | 3 | 3 | — | 5 | 4 | Kept in part: Progress as the long record |
| 10 | Chalkboard (the coach's whiteboard) | 4 | 4 | 4 | 4 | 4 | Kept in part: chalk as the ink of facts |
| 11 | *Too far:* topographic body map | 5 | 2 | — | 1 | 2 | Rejected: implies physiology; idea kept: density over time as lanes |
| 12 | *Too far:* training as a musical score | 5 | 3 | 3 | 4 | 3 | **Kept, de-musicked**: parallel lanes on one time axis |
| 13 | *Too far:* the engineering drawing | 5 | 4 | 4 | 5 | 4 | **The visual grammar** (§3) |
| 14 | *Too far:* gravity UI (heavier sets sink) | 4 | 2 | 2 | 3 | 3 | Rejected: wobble in a gym is a bug; kept: "compare against last" |
| 15 | The forge (heat, strata, temper colours) | 3 | 3 | 4 | 4 | 4 | Kept only as the previous pass's "heat is state" |

**Synthesis — "The Record, drawn":** one continuous record of effort (4), drawn with
the conventions of a technical drawing (13), read in parallel lanes on one time axis
(12), at several magnifications, with an instrument under the thumb (2), chalk ink on
graphite (10), and heat only where something is live (15). One philosophy, not a
mixture: **the app is a precise drawing of what you did; what is planned is drawn
hollow; what is derived is drawn as a line; the one thing to do now is hot.**

## 3. The drawing conventions

Engineering drawings separate visible edges (solid), hidden or projected ones
(dashed), and derived axes (centre lines). Iron's honesty rules map onto that exactly,
so they became the grammar every instrument uses:

| Form | Means | Examples |
|---|---|---|
| **Solid** | Something you logged | a set, a glass, a meal, a weigh-in, a workout block |
| **Hollow / dashed** | Something planned or proposed | the next set, a planned workout, the water pace line, a calorie target (dashed while it is still Iron's estimate) |
| **Line** | Something derived | bodyweight trend, estimated 1RM, the trend mark on the weight rule |
| **Heat** | The one live thing | the primary action, the needle, the set under your thumb, a running rest, a set just logged |
| **Heat → chalk** | A plan becoming a fact | a logged set arrives hot and cools into chalk over 900ms |
| **Datum** | Your best before today | a green rule across the record; a set past it is green |
| **Dimension** | A measured difference | the step from last time to today, with its exact value in kilograms, never a percentage |
| **Break** | Time off | a zigzag on the floor of the record where training stopped |

Two consequences worth naming. A missed day is *just an open mark* — the grammar says
"planned, not done" with no judgement, which is what AGENTS §6 always promised. And no
estimate ever shares a lane with what you lifted: the estimated 1RM lives in its own
lane above the sets, as a line, under the word "estimated" (brief §6).

## 4. One record, five magnifications

| Scale | Instrument | Where |
|---|---|---|
| The set | **Rule** — a graduated tape under the number, last time solid, target hollow, drag to scrub | `components/Rule.tsx`, in the session's hero steppers and the weigh-in sheet |
| The workout | **Session rail** (every set as a mark) and **session score** (every set at the minute it was logged, a lane per exercise) | `features/session/SessionRail.tsx`, `SessionScore.tsx` |
| The day | **Day score** — train, food, water, body on one clock with a "now" needle | `features/today/DayScore.tsx` |
| The lift | **LoadLine** — every set of every session; datum, dimension, break, estimate lane | `features/progress/LoadLine.tsx` (inline on the session screen, `full` on the exercise page) |
| Months | **Long record** — weeks across, a lane per thing you record | `features/progress/LongRecord.tsx`, fed by `weeksRecord` in one read |

They are the same drawing at different scales, which is how the brief's §11 ("one
system, not trackers stapled together") is met without a dashboard: training, food,
water and weight share a time axis, never a unit.

## 5. Materials, type, geometry, motion

**Colour — three materials and one live thing** (`theme/tokens.ts`). Graphite ground
(`#15181B`, cast iron, not a void), chalk ink (`#EFEBE4`, every fact), heat (`#FFA321`,
only what is live). Then four inks with one meaning each: cold (water), green (a best),
violet (worth a look — a stall, a lighter week; never an alarm), red (pain, and nothing
else). The old near-black + vermilion was the single most common generated-dark-UI
default; a dark ground is kept for the reasons it was chosen (gym at night, OLED,
arm's-length contrast). Every ratio is measured in `tests/theme-contrast.test.ts`,
which now also checks each meaning-ink as text. Filled heat carries graphite text
(8.9 : 1), as high-visibility equipment does.

**Type — width carries meaning.** IBM Plex Sans for reading; Archivo for names;
**Archivo Condensed** (added, same OFL family, `assets/fonts`) for measurements.
Condensed figures are taller for the same width, which is why the logged number is
52pt where 44pt used to be the ceiling. Uppercase tracked eyebrows and "A · B · C"
strings — generic tells — are gone from the UI.

**Geometry — machined, and fewer boxes.** Radii step by what a thing is (4 / 8 / 10 /
12 / 20). Instruments sit on the ground with hairline rules instead of inside cards;
the title block (`components/TitleBlock.tsx`) replaces rows of stat tiles.

**Motion — gated by frequency** (the expo-animation gate). Tab switches never animate.
± steps slide the rule 150ms ease-out. A rule released after a drag settles with the
flick's velocity, critically damped, and ticks a detent haptic per graduation crossed
(one call per graduation, never per frame). An exercise change arrives 16dp from the
side you moved towards (200ms). A range change cross-fades (150ms). Logged marks cool
over 900ms. Every one of these is skipped under Reduce Motion, and nothing ever waits
on an animation.

## 6. What changed, surface by surface

- **Today** — the day's work as a headline over a title block; the day score; the
  week in the same marks; decisions as quiet controls; the dock's words follow state.
  States: planned, rest day, in progress, done, no plan, long gap (said once, as a
  fact), marked rest/missed. The duplicated water row the previous pass left behind is
  gone.
- **Workout** — the rule under weight and reps (last time, target, drag, one-tap back
  to the plan); the session rail; the record with dimension and datum; exercise
  changes travel; meta as spans; header and reason on the shared press feedback.
- **Summary** — title block, the session score, bests as a green datum line.
- **Exercise page** — renamed tab "Record": the whole history, scrollable, newest
  first on screen, estimate lane, legend, bests that are each a set you lifted.
- **Progress** — the long record leads (tap any week); the picked week below it in a
  title block, notes in the margin, suggestions you approve, lifts with their own
  miniature records and deltas in kilograms.
- **Water** — a level on the clock against the reminders' own pace line, quick amounts,
  the glass you just logged cools from heat into water's ink. No ring.
- **Food** — intake as composition: a segment per meal inside the target's outline,
  dashed while the target is an estimate; going over carries on past it, plainly, never
  in red.
- **Body** — the trend as the headline in the measuring face; raw readings as faint
  solid dots; range changes cross-fade; the weigh-in uses the rule with the previous
  reading (solid) and the trend (a line).
- **Plans** — each day's planned sets drawn hollow, grouped by exercise: a plan is the
  hollow version of a workout.
- **Everything else** inherits through the primitives: chips (a decision is solid
  chalk), underlined section tabs, section headers with a leader rule, links in chalk,
  the tab bar (where you are is chalk; a live workout puts a heat dot on Today).
- **App icon** — the same I-beam, redrawn in heat on graphite from its own geometry.

## 7. Deliberately not built

- **No celebration.** A best is a green datum line and a sentence. No confetti, no
  badge, no streak (AGENTS §6).
- **No generative "living" art.** The record changes exactly as much as the data does.
- **No physics, no gesture-only controls.** The rule's drag is a shortcut; ± and the
  screen-reader actions are the door.
- **No light theme.** Every StyleSheet is built at import from static tokens; a runtime
  theme is a refactor of every screen, not a design decision.
- **No new npm dependency.** Everything is react-native-svg, Reanimated and Gesture
  Handler, already installed. The only new asset is the condensed font.

## 8. Verification — read this before believing §6

| Check | Result |
|---|---|
| `npm test` | **309 / 309** (300 before; +5 contrast checks for the meaning inks and the danger fill, +5 for `weeksRecord` / `liftTops`) |
| `npm run typecheck` | Clean, both projects |
| `npx eslint app src` | Clean |
| `expo export --platform android` | Succeeds, 6.4 MB Hermes bundle |

**Nothing has been seen rendered.** This Mac has no Android SDK, no Xcode and no Java,
and EAS Simulator is not enabled on the account (`simulator:availability` →
`available: false`). Every layout claim above is arithmetic and reading, not a
screenshot. In particular, unverified:

- The condensed font's registration on device (same config shape as the existing
  faces; falls back to the system face silently if wrong).
- The rule's drag inside sheets (horizontal pan against the sheet's vertical drag) and
  its detent haptic timing.
- Label collisions at 200% text size in the day score, the long record and the rule.
- The session screen's vertical budget on a 360×800 phone: by arithmetic the steppers,
  effort chips, rest row and Log set fit the dock, and the record's lower part needs a
  short scroll — the controls never do.
- Android dashed borders on the food target outline.

**How to check it:** build a preview APK (`eas build -p android --profile preview`),
then on the slowest Android you have: log three sets (watch the hollow mark fill and
cool), drag the weight rule and flick it, tap "target" on the rule, open Today at
different times of day, open a lift's record and scroll it, switch a week on Progress,
set font size to maximum and repeat, turn on Remove animations and repeat.
