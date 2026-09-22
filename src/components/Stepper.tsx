import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { selection } from '@/lib/haptics';
import { color, font, hit, radius, space } from '@/theme/tokens';

import { Icon } from './Icon';

export interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  step: number;
  min?: number;
  max?: number;
  /**
   * One field, − value +, at three sizes. `hero` is the session's weight and reps:
   * a full-width card with the label and a footer inside it. Give `gym` and `hero`
   * a full row each — two side by side left the value about 60dp between its
   * buttons, which is the one number AGENTS §7 requires stay readable (UX-04).
   */
  size?: 'hero' | 'gym' | 'default';
  label?: string;
  suffix?: string;
  /** Under the value, inside a hero card: the target, or a "Use target" chip. */
  footer?: ReactNode;
  /** Replaces the built-in keyboard entry on long-press of the value. */
  onLongPress?: () => void;
  /** Opt out per instance; the user's Haptics setting already gates it globally. */
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
  footer,
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
    if (haptics) selection();
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

  const hero = size === 'hero';
  const valueStyle = hero ? styles.valueHero : size === 'gym' ? styles.valueGym : styles.value;
  const box = hero ? HERO_BUTTON : hit[size];

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
      style={styles.valueBox}
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
        Only the hero may shrink, and only to 45pt on a 360dp phone, where 102.5 kg
        is otherwise wider than the card. Anywhere else, if it does not fit the
        layout is wrong and shrinking the number only hides that (UX-11).
      */}
      <Text style={valueStyle} numberOfLines={1} adjustsFontSizeToFit={hero} minimumFontScale={0.75}>
        {value.toFixed(dp)}
        {suffix ? <Text style={hero ? styles.suffixHero : styles.suffix}> {suffix}</Text> : null}
      </Text>
    </Pressable>
  );

  const button = (dir: 1 | -1) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${dir > 0 ? 'Increase' : 'Decrease'} ${label ?? 'value'}`}
      onPress={() => bump(dir)}
      onLongPress={() => startRepeat(dir)}
      onPressOut={stopRepeat}
      delayLongPress={300}
      style={({ pressed }) => [styles.btn, { width: box }, pressed && styles.btnPressed]}
    >
      <Icon name={dir > 0 ? 'plus' : 'minus'} size={hero ? 28 : 20} color={hero ? color.text : color.textMuted} strokeWidth={hero ? 2.4 : 2} />
    </Pressable>
  );

  if (hero) {
    return (
      <View style={[styles.field, styles.fieldHero]}>
        {button(-1)}
        <View style={styles.heroMid}>
          {label ? <Text style={styles.labelHero}>{label}</Text> : null}
          {readout}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
        {button(1)}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.field, { height: hit[size] }]}>
        {button(-1)}
        {readout}
        {button(1)}
      </View>
    </View>
  );
}

/** Wider than a thumb, so a mid-set tap on − never lands on the number. */
const HERO_BUTTON = 76;

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0 },
  label: { ...font.caption, color: color.textMuted, marginBottom: space.xs, textAlign: 'center' },
  field: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: color.surfaceHigh,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    overflow: 'hidden',
  },
  fieldHero: { backgroundColor: color.surface, borderRadius: radius.lg, minHeight: 108 },
  btn: { alignItems: 'center', justifyContent: 'center' },
  btnPressed: { backgroundColor: color.border },
  heroMid: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingVertical: space.sm },
  labelHero: { ...font.eyebrow, color: color.textFaint },
  footer: { minHeight: 26, justifyContent: 'center' },
  valueBox: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0, alignSelf: 'stretch' },
  value: { ...font.label, fontWeight: '700', ...font.numeric, color: color.text, textAlign: 'center' },
  valueGym: { ...font.heading, fontSize: 22, fontWeight: '700', ...font.numeric, color: color.text, textAlign: 'center' },
  valueHero: { ...font.hero, ...font.numeric, color: color.text, textAlign: 'center' },
  suffix: { ...font.caption, fontSize: 12, fontWeight: '600', color: color.textFaint },
  suffixHero: { ...font.label, fontSize: 16, fontWeight: '600', letterSpacing: 0, color: color.textFaint },
  input: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    borderBottomWidth: 2,
    borderBottomColor: color.accent,
    paddingVertical: 0,
    textAlign: 'center',
  },
});
