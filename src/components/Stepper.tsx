import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { selection } from '@/lib/haptics';
import { color, font, hit, radius, space } from '@/theme/tokens';

import { FitText } from './FitText';
import { Icon } from './Icon';
import { Press } from './Press';
import { Rule, type RuleMark, type RuleProps } from './Rule';

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
  /** What a screen reader calls it when the visible label lives elsewhere (a row title). */
  accessibilityLabel?: string;
  suffix?: string;
  /** Under the value, inside a hero card: the target, or a "Use target" chip. */
  footer?: ReactNode;
  /**
   * Hero only: the graduated tape under the number, with last time and the plan
   * marked on it (components/Rule). Replaces the footer when given — the marks
   * say what the footer said, on a scale instead of in small print.
   */
  rule?: Pick<RuleProps, 'marks' | 'band' | 'major'>;
  /**
   * What a screen reader hears after the value: "last time 97.5, target 100". The
   * rule draws this; it is hidden from assistive tech, so it has to be said here.
   */
  context?: string;
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
  accessibilityLabel,
  suffix,
  footer,
  rule,
  context,
  onLongPress,
  haptics = true,
}: StepperProps) {
  const dp = decimalsOf(step);
  const name = label ?? accessibilityLabel;
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
  const markActions = (rule?.marks ?? []).filter((m) => m.onPress && Math.abs(m.value - value) > 1e-9);
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
      accessibilityLabel={`${name ?? 'Value'}: ${value.toFixed(dp)}${suffix ? ` ${suffix}` : ''}${context ? `. ${context}` : ''}`}
      accessibilityHint="Long-press to type a value"
      accessibilityActions={[
        { name: 'activate', label: 'Type a value' },
        { name: 'increment' },
        { name: 'decrement' },
        // The rule's marks are taps on a tape a screen reader cannot see; these are the same doors.
        ...markActions.map((m) => ({ name: m.kind, label: MARK_ACTION[m.kind] })),
      ]}
      onAccessibilityAction={(e) => {
        const name = e.nativeEvent.actionName;
        if (name === 'increment') bump(1);
        else if (name === 'decrement') bump(-1);
        else if (name === 'activate') typeIt();
        else markActions.find((m) => m.kind === name)?.onPress?.();
      }}
    >
      {/*
        Only the hero may shrink, and only far enough that "102.5 kg" fits a 360dp
        phone. Anywhere else, if it does not fit the layout is wrong and shrinking
        the number only hides that (UX-11).

        FitText, not Text: `font.hero` carries lineHeight 64, and Android shrinks
        fontSize while leaving lineHeight alone, so the height constraint could
        never be satisfied and the search ran to the floor — this rendered at
        roughly 10pt on device. See components/FitText.
      */}
      <FitText style={valueStyle} numberOfLines={1} adjustsFontSizeToFit={hero}>
        {value.toFixed(dp)}
        {suffix ? <Text style={hero ? styles.suffixHero : styles.suffix}> {suffix}</Text> : null}
      </FitText>
    </Pressable>
  );

  const button = (dir: 1 | -1) => (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`${dir > 0 ? 'Increase' : 'Decrease'} ${name ?? 'value'}`}
      onPress={() => bump(dir)}
      onLongPress={() => startRepeat(dir)}
      onPressOut={stopRepeat}
      delayLongPress={300}
      // Highlight, not scale: these are two halves of one card, and a scaling
      // half pulls away from the border it shares with the number.
      feedback="highlight"
      touchStyle={styles.btnTouch}
      style={[styles.btn, { width: box }]}
      pressedStyle={styles.btnPressed}
    >
      <Icon name={dir > 0 ? 'plus' : 'minus'} size={hero ? 28 : 20} color={hero ? color.text : color.textMuted} strokeWidth={hero ? 2.4 : 2} />
    </Press>
  );

  if (hero) {
    return (
      <View style={[styles.field, styles.fieldHero]}>
        {button(-1)}
        <View style={styles.heroMid}>
          {label ? <Text style={styles.labelHero}>{label}</Text> : null}
          {readout}
          {rule ? (
            <Rule value={value} step={step} min={min} max={max} {...rule} onChange={onChange} />
          ) : footer ? (
            <View style={styles.footer}>{footer}</View>
          ) : null}
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

const MARK_ACTION: Record<RuleMark['kind'], string> = { target: 'Use the target', last: 'Use last time', trend: 'Use the trend' };

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
  /**
   * 114: the label (16), a 52pt condensed number in a 56dp line, and the rule (33).
   * Condensed figures are why 52 fits where 44 used to: the same width, a taller
   * number, read from a bench.
   */
  fieldHero: { backgroundColor: color.surface, borderRadius: radius.lg, minHeight: 114 },
  /** The target stretches the full height of the field; the fill inside it follows. */
  btnTouch: { alignSelf: 'stretch' },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  btnPressed: { backgroundColor: color.border },
  heroMid: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingTop: space.xs + 2, paddingBottom: 2 },
  labelHero: { ...font.eyebrow, color: color.textFaint },
  footer: { minHeight: 26, justifyContent: 'center' },
  valueBox: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0, alignSelf: 'stretch' },
  value: { ...font.label, fontWeight: '700', ...font.numeric, color: color.text, textAlign: 'center' },
  valueGym: { ...font.heading, fontSize: 22, fontWeight: '700', ...font.numeric, color: color.text, textAlign: 'center' },
  valueHero: { ...font.hero, color: color.text, textAlign: 'center' },
  suffix: { ...font.caption, fontSize: 12, fontWeight: '600', color: color.textFaint },
  suffixHero: { ...font.measure, fontSize: 22, fontWeight: '600', letterSpacing: 0, color: color.textFaint },
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
