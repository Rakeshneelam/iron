import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
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
  /** Last session and today's target, right above the numbers they explain. */
  context?: ReactNode;
  /** What the reps field counts: reps, seconds, or minutes (stored as seconds). */
  unit?: 'reps' | 'sec' | 'min';
  /** Label for the load field; null hides it (cardio). */
  weightLabel?: string | null;
  /** Hide the effort chips (cardio). */
  showEffort?: boolean;
  onWeight: (v: number) => void;
  onReps: (v: number) => void;
  onRir: (v: number) => void;
  onPain: (v: boolean) => void;
  onLog: () => void;
}

/** Bottom third, one right thumb, no scrolling mid-set. Every target is >= 56dp. */
export function SetControls(p: SetControlsProps) {
  const unit = p.unit ?? 'reps';
  const weightLabel = p.weightLabel === undefined ? 'kg' : p.weightLabel;
  // Done with this exercise and not deliberately adding another: one action.
  const collapsed = p.advance !== undefined && p.expanded === false;

  return (
    <View style={styles.wrap}>
      {p.context}

      {collapsed ? (
        <View style={styles.pair}>
          <PrimaryButton label="Add another set" tone="neutral" size="gym" style={styles.flex1} onPress={() => p.onExpand?.()} />
          <PrimaryButton
            label={p.advance?.label ?? ''}
            size="gym"
            style={styles.flex1}
            icon={<Icon name="chevronRight" size={20} color={color.onAccent} />}
            onPress={() => p.advance?.onPress()}
          />
        </View>
      ) : (
        <>
          <View style={styles.pair}>
            {weightLabel !== null ? (
              <Stepper label={weightLabel} value={p.weight} step={p.step} min={0} max={500} size="gym" onChange={p.onWeight} />
            ) : null}
            {unit === 'min' ? (
              <Stepper label="min" value={Math.round(p.reps / 60)} step={1} min={1} max={180} size="gym" onChange={(v) => p.onReps(v * 60)} />
            ) : (
              <Stepper
                label={unit === 'sec' ? 'sec' : 'reps'}
                value={p.reps}
                step={unit === 'sec' ? 5 : 1}
                min={0}
                max={unit === 'sec' ? 600 : 100}
                size="gym"
                onChange={p.onReps}
              />
            )}
          </View>

          {p.showEffort === false ? null : (
            <>
              <Text style={styles.caption}>{unit === 'reps' ? 'Reps left in the tank' : 'How much more could you have done?'}</Text>
              <ChipRow options={RIR_CHIPS} value={p.rir} onChange={p.onRir} size="gym" />
            </>
          )}

          <View style={styles.pair}>
            <PrimaryButton
              label="Pain"
              accessibilityLabel={p.pain ? 'Pain flagged — tap to clear' : 'Flag pain on this set'}
              icon={<Icon name="flag" size={18} color={p.pain ? color.onAccent : color.textMuted} />}
              tone={p.pain ? 'danger' : 'neutral'}
              size="gym"
              onPress={() => p.onPain(!p.pain)}
            />
            <PrimaryButton label={p.logLabel} size="gym" style={styles.flex1} icon={<Icon name="check" size={20} color={color.onAccent} />} onPress={p.onLog} />
          </View>

          {/* Expanded past the target: the way on stays one tap away. */}
          {p.advance ? (
            <PrimaryButton
              label={p.advance.label}
              tone="neutral"
              size="gym"
              icon={<Icon name="chevronRight" size={18} />}
              onPress={p.advance.onPress}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  flex1: { flex: 1 },
  pair: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' },
  caption: { ...font.caption, color: color.textMuted, textAlign: 'center' },
});
