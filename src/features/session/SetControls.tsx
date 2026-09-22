import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipRow, Chips } from '@/components/ChipRow';
import { Icon } from '@/components/Icon';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Stepper } from '@/components/Stepper';
import { color, font, space } from '@/theme/tokens';

export const RIR_OPTIONS = [0, 1, 2, 3, 4].map((n) => ({ label: `RIR ${n}`, value: n }));
const RIR_CHIPS = RIR_OPTIONS.map((o) => ({ ...o, label: o.value === 4 ? '4+' : String(o.value) }));

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
  advance?: { label: string; onPress: () => void };
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
  /** Under each number, inside its card: today's target, or the way back to it. */
  weightFooter?: ReactNode;
  repsFooter?: ReactNode;
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
        <View style={styles.pair}>
          <PrimaryButton label="Add another set" tone="neutral" size="gym" style={styles.flex1} icon={<Icon name="plus" size={18} />} onPress={() => p.onExpand?.()} />
          <PrimaryButton
            label={p.advance?.label ?? ''}
            size="gym"
            style={styles.flex2}
            icon={<Icon name="chevronRight" size={20} color={color.onAccent} />}
            onPress={() => p.advance?.onPress()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {weightLabel !== null ? (
        <Stepper label={weightLabel} suffix={p.weightSuffix} footer={p.weightFooter} value={p.weight} step={p.step} min={0} max={500} size="hero" onChange={p.onWeight} />
      ) : null}
      {unit === 'min' ? (
        <Stepper label="Minutes" footer={p.repsFooter} value={Math.round(p.reps / 60)} step={1} min={1} max={180} size="hero" onChange={(v) => p.onReps(v * 60)} />
      ) : (
        <Stepper
          label={unit === 'sec' ? 'Seconds' : 'Reps'}
          footer={p.repsFooter}
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

      {/* Expanded past the target: the way on stays one tap away. */}
      {p.advance ? <PrimaryButton label={p.advance.label} tone="neutral" icon={<Icon name="chevronRight" size={18} />} onPress={p.advance.onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  pair: { flexDirection: 'row', gap: space.sm },
  effort: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  effortLabel: { ...font.eyebrow, color: color.textFaint, width: 28 },
  pain: { width: 84 },
});
