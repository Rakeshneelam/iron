import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { Card, isTile, type CardTone } from '@/components/Card';
import { Icon, type IconName } from '@/components/Icon';
import { Press } from '@/components/Press';
import { Ring } from '@/components/Ring';
import { useReducedMotion } from '@/components/Screen';
import { XP } from '@/engine/level';
import { EASE_OUT } from '@/theme/curves';
import { color, font, motion, radius, space } from '@/theme/tokens';

/**
 * The order the screen builds itself in when it opens: hero, actions, then the
 * tiles row by row. Short steps, so the whole screen is still within half a second.
 */
export const ENTER_STEP = 70;

/** Wraps a block so it rises in at its place in the sequence. Still under reduced motion. */
export function Rise({ order, children, style }: { order: number; children: ReactNode; style?: object }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={reduced ? undefined : FadeInDown.delay(order * ENTER_STEP).duration(motion.slow + 100)} style={style}>
      {children}
    </Animated.View>
  );
}

/** A progress bar whose fill grows to its value rather than appearing full. */
function Fill({ fraction, track, ink }: { fraction: number; track: string; ink: string }) {
  const reduced = useReducedMotion();
  const target = Math.min(1, Math.max(0, fraction));
  const w = useSharedValue(reduced ? target : 0);
  useEffect(() => {
    w.set(reduced ? target : withDelay(250, withTiming(target, { duration: 700, easing: EASE_OUT })));
  }, [reduced, target, w]);
  const grow = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return (
    <View style={[styles.track, { backgroundColor: track }]}>
      <Animated.View style={[styles.trackFill, { backgroundColor: ink }, grow]} />
    </View>
  );
}

/**
 * The day's work as a volt card: a small dark tag for its state, the name as large
 * as the screen allows, and its facts as chips. Tapping it does what the dock does;
 * the round button in its corner changes which workout, or how long.
 */
export function Hero({
  kicker,
  live = false,
  note,
  title,
  chips,
  onPress,
  onChange,
  accessibilityLabel,
}: {
  kicker: string;
  live?: boolean;
  note?: string;
  title: string;
  chips: readonly { key: string; text: ReactNode }[];
  onPress?: () => void;
  onChange?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Card tone="volt" onPress={onPress} accessibilityLabel={accessibilityLabel} style={styles.hero}>
      <View style={styles.heroRing} pointerEvents="none" />
      <View style={styles.kickerRow}>
        <View style={styles.kicker}>
          <View style={[styles.kickerDot, live && styles.kickerDotLive]} />
          <Text style={styles.kickerText} numberOfLines={1}>
            {kicker}
          </Text>
        </View>
        {note ? (
          <Text style={styles.heroNote} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
      {onChange ? (
        <Press onPress={onChange} accessibilityRole="button" accessibilityLabel="Change today's workout or its length" hitSlop={6} style={styles.change} touchStyle={styles.changeTouch}>
          <Icon name="swap" size={18} color={color.accent} strokeWidth={2.4} />
        </Press>
      ) : null}
      <Text style={styles.heroTitle} numberOfLines={2}>
        {title}
      </Text>
      {chips.length ? (
        <View style={styles.heroChips}>
          {chips.map((c) => (
            <View key={c.key} style={styles.heroChip}>
              <Text style={styles.heroChipText}>{c.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export interface Action {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  accessibilityLabel?: string;
}

/**
 * The day's other choices, always in view: an icon over a short label, so nothing
 * is truncated and nothing hides behind a "More". Up to four to a row.
 */
export function Actions({ items }: { items: readonly Action[] }) {
  return (
    <View style={styles.actions}>
      {items.map((a) => {
        const danger = a.tone === 'danger';
        return (
          <Press
            key={a.label}
            onPress={a.onPress}
            accessibilityRole="button"
            accessibilityLabel={a.accessibilityLabel ?? a.label}
            touchStyle={styles.flex1}
            style={styles.action}
            pressedStyle={styles.actionHeld}
          >
            <View style={[styles.actionIcon, danger && styles.actionIconDanger]}>
              <Icon name={a.icon} size={20} color={danger ? color.danger : color.text} />
            </View>
            <Text style={[styles.actionLabel, danger && styles.actionLabelDanger]} numberOfLines={2}>
              {a.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

/**
 * One tracker as a tile in its own colour: a label, the figure, what it is out of,
 * and a bar. The round + logs straight from here — a glass, a food, a weigh-in.
 */
export function Tile({
  tone,
  icon,
  label,
  value,
  unit,
  sub,
  fill,
  onPress,
  add,
  accessibilityLabel,
  children,
}: {
  tone: CardTone;
  icon?: IconName;
  label: string;
  value: string;
  unit?: string;
  sub: string;
  fill?: number;
  onPress: () => void;
  add?: { label: string; onPress: () => void };
  accessibilityLabel: string;
  children?: ReactNode;
}) {
  const tile = isTile(tone);
  const ink = tile ? color.onTile : color.text;
  const quiet = tile ? color.onTileMuted : color.textMuted;
  return (
    <Card tone={tone} onPress={onPress} accessibilityLabel={accessibilityLabel} style={styles.tile} touchStyle={styles.flex1}>
      <View style={styles.tileHead}>
        {icon ? <Icon name={icon} size={16} color={ink} strokeWidth={2.2} /> : null}
        <Text style={[styles.tileLabel, { color: tile ? ink : quiet }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {add ? (
        <Press onPress={add.onPress} accessibilityRole="button" accessibilityLabel={add.label} hitSlop={8} style={styles.tileAdd} touchStyle={styles.tileAddTouch}>
          <Icon name="plus" size={18} color={color.text} strokeWidth={2.6} />
        </Press>
      ) : null}
      <Text style={[styles.tileValue, { color: ink }]} numberOfLines={1}>
        {value}
        {unit ? <Text style={[styles.tileUnit, { color: tile ? ink : quiet }]}> {unit}</Text> : null}
      </Text>
      <Text style={[styles.tileSub, { color: quiet }]} numberOfLines={1}>
        {sub}
      </Text>
      {fill !== undefined ? <Fill fraction={fill} track={tile ? color.onTileWash : color.border} ink={tile ? color.onTile : color.accent} /> : null}
      {children}
    </Card>
  );
}

/**
 * This week against the weekly goal, as a ring. It fills and resets each Monday —
 * a week that falls short simply ends; nothing carries over and nothing breaks.
 */
export function WeekGoalTile({ done, goal, onPress }: { done: number; goal: number; onPress: () => void }) {
  const met = goal > 0 && done >= goal;
  return (
    <Card
      onPress={onPress}
      touchStyle={styles.flex1}
      style={styles.tile}
      accessibilityLabel={goal > 0 ? `Weekly goal: ${done} of ${goal} workouts${met ? ', reached' : ''}. Opens history.` : `${done} workouts this week. Opens history.`}
    >
      <Text style={[styles.tileLabel, styles.goalLabel]}>Weekly goal</Text>
      <View style={styles.goalRow}>
        <Ring progress={goal > 0 ? done / goal : 0} size={68} thickness={8}>
          <Text style={styles.goalValue}>
            {done}
            {goal > 0 ? <Text style={styles.goalOf}>/{goal}</Text> : null}
          </Text>
        </Ring>
      </View>
      <Text style={[styles.tileSub, met ? styles.goalMet : styles.goalLeft]} numberOfLines={1}>
        {goal === 0 ? 'Pick training days' : met ? `Reached, +${XP.goalWeek} XP` : `${goal - done} to go`}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },

  hero: { marginTop: space.lg + 2, marginBottom: 0, padding: space.xl - 2, minHeight: 188, borderRadius: radius.xl, overflow: 'hidden' },
  heroRing: { position: 'absolute', right: -48, top: -48, width: 210, height: 210, borderRadius: radius.pill, borderWidth: 30, borderColor: color.onTileWash },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2, paddingRight: 52 },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.onTile, flexShrink: 1 },
  kickerDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: color.accent },
  kickerDotLive: { backgroundColor: color.pink },
  kickerText: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '800', color: color.accent, flexShrink: 1 },
  heroNote: { ...font.caption, fontSize: 12, fontWeight: '700', color: color.onTileMuted, flexShrink: 1 },
  changeTouch: { position: 'absolute', top: space.lg, right: space.lg },
  change: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: color.onTile, alignItems: 'center', justifyContent: 'center' },
  // Italic display type overhangs its box; the right padding keeps the last glyph whole.
  heroTitle: { ...font.title, fontSize: 54, lineHeight: 56, letterSpacing: -1, color: color.onTile, marginTop: space.md + 2, marginBottom: space.md, paddingRight: space.xs },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  heroChip: { height: 30, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.onTileWash, justifyContent: 'center' },
  heroChipText: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '800', color: color.onTile, fontVariant: ['tabular-nums'] },

  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  action: { alignItems: 'center', gap: space.xs + 2, paddingVertical: space.md, paddingHorizontal: space.xs, borderRadius: radius.lg, backgroundColor: color.surface, minHeight: 88 },
  actionHeld: { backgroundColor: color.surfaceHigh },
  actionIcon: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  actionIconDanger: { backgroundColor: color.dangerWash },
  actionLabel: { ...font.caption, fontSize: 12, lineHeight: 15, fontWeight: '700', color: color.text, textAlign: 'center' },
  actionLabelDanger: { color: color.danger },

  tile: { minHeight: 158, marginBottom: 0, padding: space.lg },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 40, minHeight: 22 },
  tileLabel: { ...font.eyebrow },
  tileAddTouch: { position: 'absolute', right: space.md, top: space.md },
  tileAdd: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: color.onTile, alignItems: 'center', justifyContent: 'center' },
  tileValue: { ...font.measure, fontWeight: '900', fontSize: 38, lineHeight: 42, letterSpacing: -0.5, marginTop: space.lg, paddingRight: space.xs },
  tileUnit: { ...font.measure, fontSize: 18, letterSpacing: 0 },
  tileSub: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  track: { height: 8, borderRadius: radius.pill, marginTop: space.md, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: radius.pill },

  goalLabel: { color: color.textMuted },
  goalRow: { alignItems: 'flex-start', marginTop: space.sm, marginBottom: space.xs },
  goalValue: { ...font.measure, fontWeight: '900', fontSize: 22, lineHeight: 26, color: color.text },
  goalOf: { ...font.measure, fontSize: 14, color: color.textMuted },
  goalMet: { color: color.accent },
  goalLeft: { color: color.textMuted },
});
