import { StyleSheet, Text, View } from 'react-native';

import { selection } from '@/lib/haptics';
import { color, font, radius, space } from '@/theme/tokens';

import { Press } from './Press';

/**
 * What a number sits next to, as tappable chips under it: last time, the target,
 * the trend, the planned range. Tapping one sets the number to it — "target" is the
 * one-tap way back to the plan AGENTS §1.5 requires.
 */
export interface RuleMark {
  value: number;
  /** last — what you did. target — the plan. trend — the smoothed value. */
  kind: 'last' | 'target' | 'trend';
  /** "last 97.5", "target 100". */
  label: string;
  onPress?: () => void;
}

export interface RuleProps {
  value: number;
  step: number;
  min: number;
  max: number;
  marks?: readonly RuleMark[];
  /** A planned range: shown as one "range lo–hi" chip. */
  band?: readonly [number, number] | null;
  /** Kept for callers; chips have no graduations. */
  major?: number;
  onChange?: (next: number) => void;
}

const TONE: Record<RuleMark['kind'], { bg: string; fg: string }> = {
  last: { bg: color.surfaceHigh, fg: color.textMuted },
  target: { bg: color.accentWash, fg: color.accent },
  trend: { bg: color.lavSoft, fg: color.lav },
};

export function Rule({ value, marks = [], band = null }: RuleProps) {
  const shown = marks.filter((m) => Number.isFinite(m.value));
  if (!shown.length && !band) return null;
  return (
    <View style={styles.row} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {shown.map((m) => {
        const at = Math.abs(m.value - value) < 1e-9;
        const chip = (
          <View style={[styles.chip, { backgroundColor: TONE[m.kind].bg }, at && styles.chipAt]}>
            <Text style={[styles.text, { color: TONE[m.kind].fg }]} numberOfLines={1}>
              {m.label}
            </Text>
          </View>
        );
        return m.onPress && !at ? (
          <Press
            key={m.kind}
            onPress={() => {
              selection();
              m.onPress?.();
            }}
            hitSlop={{ top: space.sm, bottom: space.sm, left: 2, right: 2 }}
          >
            {chip}
          </Press>
        ) : (
          <View key={m.kind}>{chip}</View>
        );
      })}
      {band ? (
        <View style={[styles.chip, { backgroundColor: color.surfaceHigh }]}>
          <Text style={[styles.text, { color: color.textMuted }]} numberOfLines={1}>
            range {band[0]}–{band[1]}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 4 },
  chip: { borderRadius: radius.pill, paddingHorizontal: space.sm + 1, paddingVertical: 3 },
  /** The value already equals this mark: it is where you are, not somewhere to go. */
  chipAt: { opacity: 0.55 },
  text: { ...font.caption, fontSize: 11, lineHeight: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
