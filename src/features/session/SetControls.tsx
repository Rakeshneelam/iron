import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipRow, Chips } from '@/components/ChipRow';
import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { PrimaryButton } from '@/components/PrimaryButton';
import type { RuleProps } from '@/components/Rule';
import { Stepper } from '@/components/Stepper';
import { color, family, font, hit, material, radius, space } from '@/theme/tokens';

export const RIR_OPTIONS = [0, 1, 2, 3, 4].map((n) => ({ label: `RIR ${n}`, value: n }));
const RIR_CHIPS = RIR_OPTIONS.map((o) => ({ ...o, label: o.value === 4 ? '4+' : String(o.value) }));

/**
 * The one way on from a finished exercise: the next lift, or the end of the workout.
 *
 * It is its own component because it carries a name chosen by the user, and
 * nothing about "Bulgarian split squat (rear foot elevated)" is predictable.
 * As a label inside a normal button it was laid out in one row with a chevron,
 * `flexShrink: 1` on the text and `numberOfLines={2}` — so on a 360dp screen a
 * long name wrapped, collided with the icon and then truncated mid-word on the
 * orange fill. Here the destination gets the full width on its own two lines,
 * under a fixed eyebrow that says what the name IS, and the chevron is pinned
 * outside the text's box where it cannot be overlapped.
 */
export interface Advance {
  /** 'Next exercise', 'Last one', 'Finish'. Fixed copy, so it never wraps. */
  eyebrow: string;
  /** The destination — usually an exercise name, so assume it is long. */
  label: string;
  onPress: () => void;
  tone?: 'accent' | 'neutral';
}

export function AdvanceButton({ eyebrow, label, onPress, tone = 'accent' }: Advance) {
  const hot = tone === 'accent';
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow}: ${label}`}
      style={[styles.advance, hot ? styles.advanceHot : styles.advanceQuiet]}
      pressedStyle={hot ? styles.advanceHeld : styles.advanceQuietHeld}
    >
      <View style={styles.advanceText}>
        <Text style={[styles.advanceEyebrow, !hot && styles.advanceEyebrowQuiet]} numberOfLines={1}>
          {eyebrow}
        </Text>
        <Text style={[styles.advanceName, !hot && styles.advanceNameQuiet]} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Icon name="chevronRight" size={24} color={hot ? color.onAccent : color.text} strokeWidth={2.4} />
    </Press>
  );
}

export interface SetControlsProps {
  weight: number;
  reps: number;
  rir: number;
  pain: boolean;
  step: number;
  logLabel: string;
  /**
   * The one primary action when the target sets are done: the next unfinished
   * exercise, or finishing the workout. The inputs collapse behind "Add another
   * set" — with three of three logged, "Log set 4" was the loudest thing on screen
   * directly under a card saying "All 3 sets done" (UX-04).
   */
  advance?: Advance;
  /** Collapsed inputs expanded again by "Add another set". */
  expanded?: boolean;
  onExpand?: () => void;
  /** The rest row, directly above the primary action. */
  rest?: ReactNode;
  /** What the reps field counts: reps, seconds, or minutes (stored as seconds). */
  unit?: 'reps' | 'sec' | 'min';
  /** The load field's label and unit; a null label hides it (cardio). */
  weightLabel?: string | null;
  weightSuffix?: string;
  /**
   * The rule under each number: last time solid, the plan hollow (components/Rule).
   * `context` is the same facts in words, for a screen reader.
   */
  weightRule?: Pick<RuleProps, 'marks' | 'band' | 'major'>;
  repsRule?: Pick<RuleProps, 'marks' | 'band' | 'major'>;
  weightContext?: string;
  repsContext?: string;
  /** Hide the effort chips (cardio). */
  showEffort?: boolean;
  onWeight: (v: number) => void;
  onReps: (v: number) => void;
  onRir: (v: number) => void;
  onPain: (v: boolean) => void;
  onLog: () => void;
}

/** Bottom-anchored, one right thumb, no scrolling mid-set. Every target is >= 56dp. */
export function SetControls(p: SetControlsProps) {
  const unit = p.unit ?? 'reps';
  const weightLabel = p.weightLabel === undefined ? 'Weight' : p.weightLabel;
  // Done with this exercise and not deliberately adding another: one action.
  const collapsed = p.advance !== undefined && p.expanded === false;

  if (collapsed) {
    return (
      <View style={styles.wrap}>
        {p.rest}
        {/*
          Stacked, not side by side. In a row of flex 1 : flex 2 the secondary
          button got about a third of a 360dp screen and rendered "Add another
          set" as two clipped lines — a label you could not read on the one
          control that undoes the screen's assumption that you are finished.
          Two full-width rows cost 60dp of a dock that has no steppers in it.
        */}
        {p.advance ? <AdvanceButton {...p.advance} /> : null}
        <PrimaryButton label="Add another set" tone="neutral" size="gym" icon={<Icon name="plus" size={18} />} onPress={() => p.onExpand?.()} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {weightLabel !== null ? (
        <Stepper
          label={weightLabel}
          suffix={p.weightSuffix}
          rule={p.weightRule ?? {}}
          context={p.weightContext}
          value={p.weight}
          step={p.step}
          min={0}
          max={500}
          size="hero"
          onChange={p.onWeight}
        />
      ) : null}
      {unit === 'min' ? (
        <Stepper
          label="Minutes"
          rule={p.repsRule ?? {}}
          context={p.repsContext}
          value={Math.round(p.reps / 60)}
          step={1}
          min={1}
          max={180}
          size="hero"
          onChange={(v) => p.onReps(v * 60)}
        />
      ) : (
        <Stepper
          label={unit === 'sec' ? 'Seconds' : 'Reps'}
          rule={p.repsRule ?? {}}
          context={p.repsContext}
          value={p.reps}
          step={unit === 'sec' ? 5 : 1}
          min={0}
          max={unit === 'sec' ? 600 : 100}
          size="hero"
          onChange={p.onReps}
        />
      )}

      {p.showEffort === false ? null : (
        <View style={styles.effort}>
          <Text style={styles.effortLabel} accessibilityLabel="Reps in reserve">
            RIR
          </Text>
          <View style={styles.flex1}>
            <ChipRow options={RIR_CHIPS} value={p.rir} onChange={p.onRir} />
          </View>
          <View style={styles.pain}>
            <Chips
              options={[{ label: 'Pain', value: 1, icon: <Icon name="flag" size={14} color={p.pain ? color.danger : color.textMuted} strokeWidth={2.2} /> }]}
              isOn={() => p.pain}
              onPress={() => p.onPain(!p.pain)}
              role="checkbox"
            />
          </View>
        </View>
      )}

      {p.rest}
      <PrimaryButton label={p.logLabel} size="gym" icon={<Icon name="check" size={20} color={color.onAccent} />} onPress={p.onLog} />

      {/* Expanded past the target: the way on stays one tap away, and quiet, because
          Log set is the loud one while the inputs are open. */}
      {p.advance ? <AdvanceButton {...p.advance} tone="neutral" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  flex1: { flex: 1 },
  effort: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  effortLabel: { ...font.eyebrow, color: color.textFaint, width: 28 },
  pain: { width: 84 },

  advance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: hit.gym,
    paddingVertical: space.sm,
    paddingLeft: space.lg,
    paddingRight: space.md,
    borderRadius: radius.button,
  },
  /** The destination's box. `minWidth: 0` is what lets the name wrap instead of pushing the chevron off. */
  advanceText: { flex: 1, minWidth: 0, gap: 1 },
  advanceHot: { backgroundColor: color.accentFill, boxShadow: material.heat },
  advanceHeld: { backgroundColor: color.accentFillPressed },
  advanceQuiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.border },
  advanceQuietHeld: { backgroundColor: color.surfaceHigh },
  advanceEyebrow: { ...font.eyebrow, fontSize: 10, color: color.onAccent, opacity: 0.85 },
  advanceEyebrowQuiet: { color: color.textFaint, opacity: 1 },
  advanceName: { fontFamily: family.display, fontSize: 18, lineHeight: 23, fontWeight: '700', letterSpacing: -0.2, color: color.onAccent },
  advanceNameQuiet: { color: color.text },
});
