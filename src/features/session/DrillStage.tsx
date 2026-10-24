import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipRow } from '@/components/ChipRow';
import { FitText } from '@/components/FitText';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { Press } from '@/components/Press';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { setToastObstruction, toast } from '@/components/Toast';
import { doseLabel } from '@/data/drills';
import { alternativesFor } from '@/engine/recovery';
import { makeItem, type Routine, type RoutineItem } from '@/engine/warmup';
import { drillDemo } from '@/features/exercises/demo';
import { FigureDemo } from '@/features/exercises/ExerciseDemo';
import { success } from '@/lib/haptics';
import { color, font, hit, material, radius, space } from '@/theme/tokens';
import { PHASE_LABEL } from '@/features/warmup/labels';

import { Countdown, useCountdown } from './Countdown';

/**
 * The warm-up and the cool-down, as part of the workout instead of a list in a
 * modal.
 *
 * They used to be a `RoutineSheet`: a scrollable list of drill names with a
 * "Start guided" button that opened a player inside the same sheet. Reading a
 * list is not doing a warm-up, and a sheet over the session screen says "this is
 * an aside" — which is exactly how it got skipped. This is the same shape as the
 * exercise screen: one thing at a time, the numbers big, the control at the
 * bottom under a thumb, a strip at the top showing how far through you are.
 *
 * Both stages use this. A warm-up drill and a cool-down stretch differ only in
 * which engine produced them, so giving them two interfaces would be two things
 * to learn for no difference in what the user does.
 *
 * A drill carries reps OR seconds (`Drill['dose']`), so the stage shows either a
 * rep count to tick off or the shared `Countdown`. Nothing is forced: every drill
 * can be swapped or dropped, and the whole stage can be skipped from the header.
 *
 * Which drills are ticked lives in React state on purpose, unlike a logged set
 * (AGENTS §1.3). A set is data the user will look at in six months; "three of six
 * stretches done" is worth nothing once the app is closed, and giving it a table
 * would mean a migration for a tick nobody will ever read.
 */
export interface DrillStageProps {
  kind: 'warmup' | 'cooldown';
  routine: Routine;
  /** Drill equipment on hand, for "swap". */
  available: ReadonlySet<string>;
  /** Minutes label for the header, e.g. "6 min". */
  totalLabel: string;
  /** Every drill done, or the user tapped the last Done. */
  onFinish: () => void;
  /** Skip the whole stage. Always one tap away. */
  onSkip: () => void;
  /** Back out of the workout without ending it. */
  onBack: () => void;
  /** The workout's own name, for the header. */
  title: string;
  /** The stage strip from the session screen, so every stage carries the same one. */
  strip?: React.ReactNode;
  /**
   * How long the routine should be. Offered in the drill list rather than on the
   * stage itself: "I have five minutes, not fifteen" is a decision you make once,
   * and it belongs with the list it rewrites, not above the drill you are doing.
   */
  modes?: { options: readonly { label: string; value: string }[]; value: string; onChange: (v: string) => void };
}

const COPY = {
  warmup: {
    heading: 'Warm-up',
    skip: 'Skip warm-up',
    done: 'Warm-up done — on to the lifts',
    hint: 'Move through these before you load anything. Tap Done on each one.',
  },
  cooldown: {
    heading: 'Cool-down',
    skip: 'Skip cool-down',
    done: 'Cool-down done',
    hint: 'Hold each stretch and breathe. Optional, and your workout is already saved.',
  },
} as const;

/** A drill's timed length, both sides included; 0 for rep-based drills. */
const secondsOf = (item: RoutineItem | undefined) => (item?.dose.seconds ? item.dose.seconds * (item.dose.perSide ? 2 : 1) : 0);

export function DrillStage(p: DrillStageProps) {
  const copy = COPY[p.kind];
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<RoutineItem[]>(p.routine.items);
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [i, setI] = useState(0);
  const [cues, setCues] = useState(false);
  const [list, setList] = useState(false);

  // A regenerated routine (the warm-up mode changed, a lift was swapped) starts
  // over from the new list. Adjusted in render so the old names never flash.
  const [shownFor, setShownFor] = useState(p.routine);
  if (shownFor !== p.routine) {
    setShownFor(p.routine);
    setItems(p.routine.items);
    setDone(new Set());
    setI(0);
  }

  const idx = Math.min(i, Math.max(0, items.length - 1));
  const item = items[idx];
  const total = secondsOf(item);
  // Keyed on the drill, so two 30-second holds in a row each get their own clock.
  const timer = useCountdown(total, item?.drill.id);
  const remainingCount = items.filter((x) => !done.has(x.drill.id)).length;

  /** The next drill not yet ticked, wrapping past the end. -1 when they all are. */
  const nextOpen = (from: number): number => {
    for (let k = 1; k <= items.length; k++) {
      const j = (from + k) % items.length;
      const d = items[j];
      if (d && !done.has(d.drill.id)) return j;
    }
    return -1;
  };

  const complete = () => {
    if (!item) return;
    const next = new Set(done);
    next.add(item.drill.id);
    setDone(next);
    success();
    // Last one: the stage is over, and the screen moves on without another tap.
    if (next.size >= items.length) {
      p.onFinish();
      return;
    }
    const j = nextOpen(idx);
    if (j >= 0) setI(j);
  };

  const go = (j: number) => {
    setI(Math.max(0, Math.min(j, items.length - 1)));
    setCues(false);
  };

  const swap = () => {
    if (!item) return;
    const alt = alternativesFor(item, new Set(items.map((x) => x.drill.id)), p.available)[0];
    if (!alt) {
      toast('Nothing else here works the same area with your kit.');
      return;
    }
    setItems(items.map((x, j) => (j === idx ? makeItem(alt, x.phase, x.why) : x)));
  };

  const drop = () => {
    if (!item || items.length <= 1) {
      p.onSkip();
      return;
    }
    const gone = item;
    setItems(items.filter((_, j) => j !== idx));
    if (idx >= items.length - 1) setI(Math.max(0, idx - 1));
    toast(`Removed ${gone.drill.name}`, { label: 'Undo', onPress: () => setItems((cur) => [...cur.slice(0, idx), gone, ...cur.slice(idx)]) });
  };

  if (!item) {
    return (
      <View style={styles.flex}>
        <Header {...p} copy={copy} count="0 of 0" />
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Nothing needed today.</Text>
          <PrimaryButton label="Carry on" size="gym" onPress={p.onFinish} />
        </View>
      </View>
    );
  }

  const demo = drillDemo(item.drill.demo);
  const perSide = item.dose.seconds ?? 0;
  const sideNote = item.dose.perSide && item.dose.seconds ? (timer.remaining > perSide ? 'first side' : 'switch sides') : null;
  const isDone = done.has(item.drill.id);
  /**
   * What the button says, which is what tapping it DOES rather than what the
   * drill currently is. "Already done · 2 left" described the state and left the
   * one big button on screen reading as a dead end.
   */
  const wouldFinish = isDone ? done.size >= items.length : done.size + 1 >= items.length;
  const doneLabel = wouldFinish ? copy.done : isDone ? 'Next drill' : 'Done, next drill';

  return (
    <View style={styles.flex}>
      <Header {...p} copy={copy} count={`${done.size} of ${items.length}`} />
      {p.strip}

      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
        <View style={styles.titleBlock}>
          {/*
            The routine as its drills, in the marks the workout uses: done solid,
            the one you are on in heat, the rest open. Tap any to go to it.
          */}
          <View style={styles.rail} accessibilityRole="adjustable" accessibilityLabel={`Drill ${idx + 1} of ${items.length}, ${done.size} done`}>
            {items.map((x, j) => (
              <Press
                key={x.drill.id}
                onPress={() => go(j)}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                hitSlop={{ top: space.sm, bottom: space.sm }}
                touchStyle={styles.railCell}
                feedback="none"
                style={[styles.railMark, done.has(x.drill.id) ? styles.railDone : j === idx ? styles.railNow : styles.railTodo]}
              />
            ))}
          </View>
          <Text style={styles.eyebrow}>
            {PHASE_LABEL[item.phase]}, {idx + 1} of {items.length}
          </Text>
          <Text style={styles.name} numberOfLines={2}>
            {item.drill.name}
          </Text>
          <Text style={styles.why} numberOfLines={2}>
            {item.why}
          </Text>
        </View>

        {/* Timed drills get the shared countdown; counted ones get the number
            itself, at the size the weight on the exercise screen is set in — what
            you have to read across a gym floor is the figure, not its label. */}
        {total > 0 ? (
          <Countdown timer={timer} total={total} size={192} caption={item.dose.perSide ? 'Hold, each side' : 'Hold'} note={sideNote} />
        ) : (
          <View style={styles.repsBlock}>
            <Text style={styles.repsCaption}>{item.dose.perSide ? 'Each side' : 'Reps'}</Text>
            <FitText style={styles.repsValue} numberOfLines={1} minimumFontScale={0.6}>
              {item.dose.reps ?? 8}
            </FitText>
            <Text style={styles.repsNote}>no rush — these are not working sets</Text>
          </View>
        )}

        <Press
          onPress={() => setCues(!cues)}
          accessibilityRole="button"
          accessibilityState={{ expanded: cues }}
          accessibilityLabel={`How to do ${item.drill.name}`}
          feedback="highlight"
          style={styles.cueHead}
          pressedStyle={styles.cueHeld}
        >
          <Icon name="book" size={18} color={color.textMuted} />
          <Text style={styles.cueHeadText}>How to do it</Text>
          <Icon name={cues ? 'chevronUp' : 'chevronDown'} size={18} color={color.textFaint} />
        </Press>
        {/* The figure lives in here with the cues, collapsed. On its own above the
            timer it cost 170dp of a screen whose whole job is one big clock, and
            the person who needs to see the movement is the person opening this. */}
        {cues ? (
          <View style={styles.cues}>
            {demo ? <FigureDemo pattern={demo} size={132} /> : null}
            {item.drill.cues.map((c) => (
              <View key={c} style={styles.cueRow}>
                <Icon name="check" size={14} color={color.text} strokeWidth={2.4} />
                <Text style={styles.cue}>{c}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.tools}>
          <Tool icon="swap" label="Swap" a11y={`Swap ${item.drill.name} for something else`} onPress={swap} />
          <Tool icon="close" label="Remove" a11y={`Remove ${item.drill.name} from today`} onPress={drop} />
          <Tool icon="list" label="All drills" a11y="Show every drill in this routine" onPress={() => setList(true)} />
        </View>
      </ScrollView>

      <View
        style={[styles.dock, { paddingBottom: insets.bottom + space.md }]}
        // "Removed <drill>" has an Undo in it, and Undo has to land above this
        // dock rather than on Skip. Measured, because the dock's height changes
        // with the label and with the user's text size (UX-11).
        onLayout={(e) => setToastObstruction(e.nativeEvent.layout.height)}
      >
        <View style={styles.navRow}>
          <PrimaryButton label="Back" tone="ghost" disabled={idx === 0} onPress={() => go(idx - 1)} />
          <View style={styles.flex} />
          <PrimaryButton label="Next" tone="ghost" disabled={idx === items.length - 1} onPress={() => go(idx + 1)} />
        </View>
        <PrimaryButton
          label={doneLabel}
          size="gym"
          tone={isDone ? 'neutral' : 'accent'}
          icon={<Icon name="check" size={20} color={isDone ? color.text : color.onAccent} strokeWidth={2.4} />}
          onPress={complete}
          accessibilityLabel={isDone ? `${item.drill.name} is already ticked — move on. ${remainingCount} left.` : `Mark ${item.drill.name} done`}
        />
        <PrimaryButton label={copy.skip} tone="ghost" onPress={p.onSkip} />
      </View>

      <Sheet visible={list} onClose={() => setList(false)} title={`${copy.heading}, ${p.totalLabel}`}>
        <Text style={styles.sheetHint}>{copy.hint}</Text>
        {p.modes ? (
          <View style={styles.sheetModes}>
            <ChipRow options={p.modes.options} value={p.modes.value} onChange={p.modes.onChange} />
          </View>
        ) : null}
        <View style={styles.sheetList}>
          {items.map((x, j) => {
            const ticked = done.has(x.drill.id);
            return (
              <Press
                key={x.drill.id}
                onPress={() => {
                  go(j);
                  setList(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${x.drill.name}, ${doseLabel(x.dose)}${ticked ? ', done' : ''}. Go to it.`}
                feedback="highlight"
                style={[styles.listRow, j === idx && styles.listRowNow]}
                pressedStyle={styles.cueHeld}
              >
                <View style={[styles.mark, ticked && styles.markDone, j === idx && !ticked && styles.markNow]}>
                  {ticked ? <Icon name="check" size={13} color={color.bg} strokeWidth={3} /> : null}
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.listName, ticked && styles.listNameDone]} numberOfLines={1}>
                    {x.drill.name}
                  </Text>
                  <Text style={styles.listSub} numberOfLines={1}>
                    {PHASE_LABEL[x.phase]}, {doseLabel(x.dose)}
                  </Text>
                </View>
              </Press>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}

function Header({
  title,
  copy,
  totalLabel,
  count,
  onBack,
  onSkip,
}: Pick<DrillStageProps, 'title' | 'totalLabel' | 'onBack' | 'onSkip'> & { copy: (typeof COPY)[keyof typeof COPY]; count: string }) {
  return (
    <View style={styles.header}>
      <IconButton icon="chevronLeft" accessibilityLabel="Leave the workout open and go back" onPress={onBack} />
      <View style={styles.headerText}>
        <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
          {copy.heading}
        </Text>
        <Text style={styles.headerMeta} numberOfLines={1}>
          {title}, {totalLabel}, {count}
        </Text>
      </View>
      {/*
        One control on the right, not two. A 360dp header carrying a back arrow,
        a title, a count button and a skip button left the title about 190dp —
        enough for "Warm-up" and nothing else. The count reads in the meta line
        under the heading, and the drill list is a cell of the tool strip.
      */}
      <IconButton icon="skip" accessibilityLabel={copy.skip} onPress={onSkip} />
    </View>
  );
}

/** One cell of the tool strip, the same one the exercise screen uses. */
function Tool({ icon, label, a11y, onPress }: { icon: 'swap' | 'close' | 'list'; label: string; a11y: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} feedback="highlight" touchStyle={styles.flex} style={styles.tool} pressedStyle={styles.cueHeld}>
      <Icon name={icon} size={20} color={color.textMuted} />
      <Text style={styles.toolText} numberOfLines={1}>
        {label}
      </Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.sm, paddingRight: space.sm, paddingTop: space.md, gap: space.xs },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { ...font.heading, fontSize: 18, fontWeight: '700', color: color.text },
  headerMeta: { ...font.caption, color: color.textMuted },
  scroll: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xl, gap: space.lg },
  titleBlock: { gap: space.xs },
  rail: { flexDirection: 'row', gap: 3, marginBottom: space.sm },
  railCell: { flex: 1, maxWidth: 28 },
  railMark: { height: 8, borderRadius: 1.5 },
  railDone: { backgroundColor: color.text },
  railNow: { borderWidth: 1.5, borderColor: color.accent },
  railTodo: { borderWidth: 1, borderColor: color.textFaint },
  eyebrow: { ...font.eyebrow, color: color.textFaint },
  name: { ...font.title, fontSize: 28, lineHeight: 34, color: color.text },
  why: { ...font.label, color: color.textMuted },

  /** The count on its own, in the measuring face — no box: the number is the thing. */
  repsBlock: {
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },
  repsCaption: { ...font.eyebrow, color: color.textMuted },
  repsValue: { ...font.measure, fontSize: 96, lineHeight: 100, fontWeight: '800', letterSpacing: -1, color: color.text },
  repsNote: { ...font.caption, fontSize: 12, color: color.textMuted },


  cueHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: hit.default,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
  },
  cueHeld: { backgroundColor: color.surfaceHigh },
  cueHeadText: { ...font.label, fontWeight: '600', color: color.text, flex: 1 },
  cues: { gap: space.md, alignItems: 'center', borderLeftWidth: 2, borderLeftColor: color.border, paddingLeft: space.lg, paddingVertical: space.xs, marginTop: -space.sm },
  cueRow: { flexDirection: 'row', gap: space.md - 2, alignItems: 'flex-start' },
  cue: { ...font.label, color: color.text, flex: 1, lineHeight: 22 },

  tools: { flexDirection: 'row', minHeight: hit.gym, backgroundColor: color.surface, borderRadius: radius.button, borderWidth: 1, borderColor: color.border, overflow: 'hidden' },
  tool: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.sm, minHeight: hit.gym },
  toolText: { ...font.caption, fontSize: 11, lineHeight: 14, fontWeight: '600', color: color.textMuted },

  dock: { gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: color.bg, borderTopWidth: 1, borderTopColor: color.border },
  navRow: { flexDirection: 'row', alignItems: 'center' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, paddingHorizontal: space.lg },
  emptyText: { ...font.body, color: color.textMuted },

  sheetHint: { ...font.caption, color: color.textMuted, marginBottom: space.md },
  sheetModes: { marginBottom: space.md },
  sheetList: { gap: space.sm, paddingBottom: space.lg },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: hit.gym,
    paddingHorizontal: space.lg,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
  },
  listRowNow: { borderColor: color.accent, boxShadow: material.heat },
  listName: { ...font.label, fontWeight: '600', color: color.text },
  listNameDone: { color: color.textMuted },
  listSub: { ...font.caption, fontSize: 12, color: color.textFaint },
  mark: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 2, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  markDone: { backgroundColor: color.text, borderColor: color.text },
  markNow: { borderColor: color.accent },
});
