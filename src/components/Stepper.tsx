import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { color, font, hit, radius, space } from '@/theme/tokens';

export interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  step: number;
  min?: number;
  max?: number;
  /**
   * `gym` stacks the value above its own pair of ± buttons. In a row, two gym
   * steppers side by side left each value about 60dp between two 56dp buttons, and
   * `adjustsFontSizeToFit` hid that by shrinking 102.5 until it fitted — the one
   * number AGENTS §7 requires stay readable at arm's length (UX-04).
   */
  size?: 'gym' | 'default';
  label?: string;
  suffix?: string;
  /** Replaces the built-in keyboard entry on long-press of the value. */
  onLongPress?: () => void;
  haptics?: boolean;
}

function decimalsOf(step: number): number {
  const s = String(step);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

/**
 * ± steppers are the default input on the logging screen; the keyboard is the
 * escape hatch on long-press (docs/05). Press-and-hold repeats and accelerates.
 * Tabular figures so the digits never jitter while held.
 */
export function Stepper({
  value,
  onChange,
  step,
  min = 0,
  max = 9999,
  size = 'default',
  label,
  suffix,
  onLongPress,
  haptics = true,
}: StepperProps) {
  const dp = decimalsOf(step);
  const valueRef = useRef(value);
  // Re-synced after every render, as the old in-render assignment did, but outside render.
  useEffect(() => {
    valueRef.current = value;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const clampRound = (v: number) => {
    const factor = 10 ** dp;
    return Math.min(max, Math.max(min, Math.round(v * factor) / factor));
  };

  const bump = (dir: 1 | -1) => {
    const next = clampRound(valueRef.current + dir * step);
    if (next === valueRef.current) return;
    valueRef.current = next;
    if (haptics) void Haptics.selectionAsync();
    onChange(next);
  };

  const startRepeat = (dir: 1 | -1) => {
    let delay = 380;
    const tick = () => {
      bump(dir);
      delay = Math.max(45, delay * 0.8);
      timer.current = setTimeout(tick, delay);
    };
    timer.current = setTimeout(tick, delay);
  };

  const stopRepeat = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  /** Runs on every keystroke: a Save tap steals focus before onBlur can fire. */
  const apply = (text: string) => {
    const parsed = Number(text.replace(',', '.'));
    if (text.trim() !== '' && Number.isFinite(parsed)) onChange(clampRound(parsed));
  };

  const commitDraft = () => setEditing(false);

  /** Long-press is a gesture a screen reader cannot perform; this is the same door. */
  const typeIt = () => {
    if (onLongPress) {
      onLongPress();
      return;
    }
    setDraft(value.toFixed(dp));
    setEditing(true);
  };

  const gym = size === 'gym';
  const box = hit[size];
  const valueStyle = gym ? styles.valueGym : styles.value;

  const readout = editing ? (
    <TextInput
      autoFocus
      value={draft}
      onChangeText={(t) => {
        setDraft(t);
        apply(t);
      }}
      onSubmitEditing={commitDraft}
      onBlur={commitDraft}
      keyboardType="decimal-pad"
      selectTextOnFocus
      style={[valueStyle, styles.input]}
    />
  ) : (
    <Pressable
      style={gym ? styles.valueBoxGym : styles.valueBox}
      onLongPress={typeIt}
      accessibilityRole="adjustable"
      accessibilityLabel={`${label ?? 'Value'}: ${value.toFixed(dp)}${suffix ? ` ${suffix}` : ''}`}
      accessibilityHint="Long-press to type a value"
      accessibilityActions={[{ name: 'activate', label: 'Type a value' }, { name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') bump(1);
        else if (e.nativeEvent.actionName === 'decrement') bump(-1);
        else typeIt();
      }}
    >
      {/*
        No adjustsFontSizeToFit. Given room, 102.5 fits; where it does not, the
        layout is wrong and shrinking the number only hides that (UX-11).
      */}
      <Text style={valueStyle} numberOfLines={1}>
        {value.toFixed(dp)}
        {suffix ? <Text style={styles.suffix}> {suffix}</Text> : null}
      </Text>
    </Pressable>
  );

  const minus = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Decrease ${label ?? 'value'}`}
      onPress={() => bump(-1)}
      onLongPress={() => startRepeat(-1)}
      onPressOut={stopRepeat}
      delayLongPress={300}
      style={({ pressed }) => [styles.btn, gym ? styles.btnWide : { width: box }, { height: box }, pressed && styles.btnPressed]}
    >
      <Text style={styles.btnText}>−</Text>
    </Pressable>
  );
  const plus = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Increase ${label ?? 'value'}`}
      onPress={() => bump(1)}
      onLongPress={() => startRepeat(1)}
      onPressOut={stopRepeat}
      delayLongPress={300}
      style={({ pressed }) => [styles.btn, gym ? styles.btnWide : { width: box }, { height: box }, pressed && styles.btnPressed]}
    >
      <Text style={styles.btnText}>+</Text>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {gym ? (
        <View style={styles.stack}>
          {readout}
          <View style={styles.buttons}>
            {minus}
            {plus}
          </View>
        </View>
      ) : (
        <View style={styles.row}>
          {minus}
          {readout}
          {plus}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0 },
  label: { ...font.caption, color: color.textMuted, marginBottom: space.xs, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  stack: { gap: space.xs },
  buttons: { flexDirection: 'row', gap: space.xs },
  btn: {
    borderRadius: radius.md,
    backgroundColor: color.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Half the field each, rather than 56dp of fixed furniture either side of the number.
  btnWide: { flex: 1 },
  btnText: { ...font.title, color: color.text },
  btnPressed: { backgroundColor: color.border },
  valueBox: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0 },
  valueBoxGym: { alignItems: 'center', justifyContent: 'center', minHeight: hit.default, paddingHorizontal: space.xs },
  value: { ...font.heading, ...font.numeric, color: color.text, textAlign: 'center' },
  // Pinned, not derived. This was font.display.fontSize * 0.6, so shrinking the
  // display token quietly shrank the weight and rep controls on the logging screen.
  valueGym: { ...font.title, fontSize: 34, lineHeight: 40, ...font.numeric, color: color.text, textAlign: 'center' },
  suffix: { ...font.caption, color: color.textMuted },
  input: {
    flex: 1,
    minWidth: 0,
    borderBottomWidth: 2,
    borderBottomColor: color.accent,
    paddingVertical: 0,
    textAlign: 'center',
  },
});
