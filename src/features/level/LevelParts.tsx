import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { Breathe } from '@/components/Breathe';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { ListCard, ListRow } from '@/components/List';
import { Press } from '@/components/Press';
import { Ring } from '@/components/Ring';
import { useReducedMotion } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import type { BadgeState, Level, XpPart } from '@/engine/level';
import { color, font, radius, space } from '@/theme/tokens';

import { BADGE_LOOK, fmtXp, type Reward } from './level';

/**
 * Your initial in a lavender disc, wrapped in a volt ring that fills toward the next
 * level, with the level number pinned to it. On Today it is the way into You.
 */
export function LevelAvatar({ name, level, size = 54, live = false, onPress }: { name: string; level: Level; size?: number; live?: boolean; onPress?: () => void }) {
  const inner = size - 12;
  const body = (
    <View style={{ width: size, height: size }}>
      {/* The ring breathes while a workout is open: the live thing on the screen. */}
      <Breathe on={live} amount={0.06}>
        <Ring progress={live ? 1 : level.progress} size={size} thickness={3}>
          <View />
        </Ring>
      </Breathe>
      <View style={[styles.avatar, { width: inner, height: inner, top: 6, left: 6 }]}>
        {name ? <Text style={[styles.initial, { fontSize: inner * 0.42, lineHeight: inner * 0.52 }]}>{name[0]?.toUpperCase()}</Text> : <Icon name="body" size={inner * 0.5} color={color.onTile} />}
      </View>
      <View style={styles.levelChip}>
        <Text style={styles.levelChipText}>{level.level}</Text>
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={`You. Level ${level.level}, ${level.title}. Opens your profile and settings.`} hitSlop={6}>
      {body}
    </Press>
  );
}

/** The level on a volt card: the number, its title, and how far to the next one. */
export function LevelCard({ level, onExplain }: { level: Level; onExplain: () => void }) {
  return (
    <Card tone="volt" style={styles.levelCard}>
      <View style={styles.levelHead}>
        <Text style={styles.levelNumber}>{level.level}</Text>
        <View style={styles.flex1}>
          <Text style={styles.levelEyebrow}>Level</Text>
          <Text style={styles.levelTitle}>{level.title}</Text>
        </View>
        <Press onPress={onExplain} accessibilityRole="button" accessibilityLabel="How XP works" hitSlop={8} style={styles.explain}>
          <Text style={styles.explainText}>How XP works</Text>
        </Press>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(level.progress * 100)}%` }]} />
      </View>
      <View style={styles.levelFoot}>
        <Text style={styles.levelFootText}>{fmtXp(level.xp)} XP</Text>
        <Text style={styles.levelFootText}>
          {fmtXp(level.next - level.xp)} to level {level.level + 1}
        </Text>
      </View>
    </Card>
  );
}

/** Where every point came from, so the score explains itself (AGENTS §6). */
export function XpSheet({ visible, parts, onClose }: { visible: boolean; parts: readonly XpPart[]; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="How XP works" subtitle="Points only ever add up. Nothing is taken away for a missed day.">
      <ListCard>
        {parts.map((p, i) => (
          <ListRow key={p.key} divider={i > 0} title={p.label} sub={`${p.each} XP each, ${fmtXp(p.count)} so far`} right={<Text style={styles.xpValue}>{fmtXp(p.xp)}</Text>} />
        ))}
      </ListCard>
      <View style={styles.sheetTail} />
    </Sheet>
  );
}

/** Badges four to a row: earned ones in their colour, the rest dark with how close they are. */
export function BadgeGrid({ states }: { states: readonly BadgeState[] }) {
  const [open, setOpen] = useState<BadgeState | null>(null);
  return (
    <>
      <View style={styles.grid}>
        {states.map((s) => {
          const look = BADGE_LOOK[s.badge.id];
          return (
            <Press
              key={s.badge.id}
              onPress={() => setOpen(s)}
              accessibilityRole="button"
              accessibilityLabel={`${s.badge.name}${s.earned ? ', earned' : `, ${Math.round(s.progress * 100)}% of the way`}. ${s.badge.description}`}
              touchStyle={styles.cell}
              style={styles.badge}
            >
              <View style={[styles.disc, s.earned ? { backgroundColor: look.tint } : styles.discLocked]}>
                <Icon name={look.icon} size={24} color={s.earned ? color.onTile : color.textFaint} strokeWidth={2.2} />
              </View>
              <Text style={[styles.badgeName, !s.earned && styles.badgeNameLocked]} numberOfLines={2}>
                {s.badge.name}
              </Text>
              {!s.earned ? (
                <View style={styles.miniTrack}>
                  <View style={[styles.miniFill, { width: `${Math.round(s.progress * 100)}%` }]} />
                </View>
              ) : null}
            </Press>
          );
        })}
      </View>
      <Sheet visible={open !== null} onClose={() => setOpen(null)} title={open?.badge.name}>
        {open ? (
          <View style={styles.badgeDetail}>
            <View style={[styles.discBig, open.earned ? { backgroundColor: BADGE_LOOK[open.badge.id].tint } : styles.discLocked]}>
              <Icon name={open.earned ? BADGE_LOOK[open.badge.id].icon : 'lock'} size={36} color={open.earned ? color.onTile : color.textFaint} strokeWidth={2.2} />
            </View>
            <Text style={styles.detailText}>{open.badge.description}</Text>
            <Text style={styles.detailMeta}>{open.earned ? 'Earned' : `${fmtXp(Math.min(open.value, open.badge.goal))} of ${fmtXp(open.badge.goal)}`}</Text>
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

const partLabel = (p: XpPart) =>
  p.key === 'workout' ? 'Workout' : p.key === 'set' ? `${p.count} ${p.count === 1 ? 'set' : 'sets'}` : p.key === 'best' ? `${p.count} ${p.count === 1 ? 'best' : 'bests'}` : p.key === 'goalWeek' ? 'Weekly goal' : p.label;

/**
 * What a finished workout earned: the XP and where it came from, the level bar with
 * it added, a level-up when one happened, and any badge it unlocked.
 */
export function RewardCard({ reward }: { reward: Reward }) {
  const reduced = useReducedMotion();
  const levelled = reward.after.level > reward.before.level;
  return (
    <Animated.View entering={reduced ? undefined : FadeInDown.duration(420)} style={styles.reward}>
      <View style={styles.rewardHead}>
        <View style={styles.flex1}>
          <Text style={styles.rewardEyebrow}>Earned</Text>
          <Text style={styles.rewardXp}>+{fmtXp(reward.gained)} XP</Text>
        </View>
        <Icon name="bolt" size={30} color={color.accent} strokeWidth={2.2} />
      </View>
      {reward.parts.length ? (
        <View style={styles.parts}>
          {reward.parts.map((p) => (
            <View key={p.key} style={styles.part}>
              <Text style={styles.partText}>
                {partLabel(p)} <Text style={styles.partXp}>+{fmtXp(p.xp)}</Text>
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {levelled ? (
        <Animated.View entering={reduced ? undefined : ZoomIn.delay(250).springify()} style={styles.levelUp}>
          <Icon name="arrowUp" size={16} color={color.onAccent} strokeWidth={2.8} />
          <Text style={styles.levelUpText}>
            Level {reward.after.level}, {reward.after.title}
          </Text>
        </Animated.View>
      ) : null}
      <View style={styles.rewardLevel}>
        <Text style={styles.rewardLevelText}>
          Level {reward.after.level} · {reward.after.title}
        </Text>
        <Text style={styles.rewardLevelText}>
          {fmtXp(reward.after.xp)} / {fmtXp(reward.after.next)}
        </Text>
      </View>
      <View style={styles.darkTrack}>
        <View style={[styles.voltFill, { width: `${Math.round(reward.after.progress * 100)}%` }]} />
      </View>
      {reward.badges.length ? (
        <View style={styles.unlocked}>
          {reward.badges.map((b, i) => (
            <Animated.View key={b.id} entering={reduced ? undefined : ZoomIn.delay(400 + i * 120).springify()} style={styles.unlockedBadge}>
              <View style={[styles.disc, { backgroundColor: BADGE_LOOK[b.id].tint }]}>
                <Icon name={BADGE_LOOK[b.id].icon} size={24} color={color.onTile} strokeWidth={2.2} />
              </View>
              <Text style={styles.unlockedName} numberOfLines={2}>
                {b.name}
              </Text>
            </Animated.View>
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  avatar: { position: 'absolute', borderRadius: radius.pill, backgroundColor: color.lav, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: font.heading.fontFamily, fontWeight: '800', color: color.onTile },
  levelChip: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    borderWidth: 2,
    borderColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelChipText: { ...font.caption, fontSize: 11, lineHeight: 13, fontWeight: '800', color: color.onAccent, fontVariant: ['tabular-nums'] },

  levelCard: { borderRadius: radius.xl, marginBottom: 0 },
  levelHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  levelNumber: { ...font.display, fontSize: 64, lineHeight: 66, color: color.onTile, paddingRight: space.xs },
  levelEyebrow: { ...font.eyebrow, color: color.onTileMuted },
  levelTitle: { ...font.title, fontSize: 30, lineHeight: 32, color: color.onTile, paddingRight: space.xs },
  explain: { height: 32, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.onTile, justifyContent: 'center' },
  explainText: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '800', color: color.accent },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: color.onTileWash, marginTop: space.md, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: color.onTile },
  levelFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm },
  levelFootText: { ...font.caption, fontSize: 12, fontWeight: '800', color: color.onTileMuted, fontVariant: ['tabular-nums'] },
  xpValue: { ...font.label, fontVariant: ['tabular-nums'], color: color.accent },
  sheetTail: { height: space.lg },

  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.xs, rowGap: space.md },
  cell: { width: '25%', paddingHorizontal: space.xs },
  badge: { alignItems: 'center', gap: space.xs + 2 },
  disc: { width: 56, height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  discLocked: { backgroundColor: color.surface },
  discBig: { width: 88, height: 88, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  badgeName: { ...font.caption, fontSize: 11, lineHeight: 14, fontWeight: '700', color: color.text, textAlign: 'center' },
  badgeNameLocked: { color: color.textFaint },
  miniTrack: { width: 40, height: 4, borderRadius: radius.pill, backgroundColor: color.surfaceHigh, overflow: 'hidden' },
  miniFill: { height: '100%', borderRadius: radius.pill, backgroundColor: color.textMuted },
  badgeDetail: { alignItems: 'center', gap: space.md, paddingBottom: space.xl },
  detailText: { ...font.body, color: color.text, textAlign: 'center' },
  detailMeta: { ...font.label, color: color.accent, fontVariant: ['tabular-nums'] },

  reward: { marginTop: space.md, padding: space.lg + 2, borderRadius: radius.xl, backgroundColor: color.surface, borderWidth: 1.5, borderColor: color.accent },
  rewardHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rewardEyebrow: { ...font.eyebrow, color: color.textMuted },
  rewardXp: { ...font.display, fontSize: 48, lineHeight: 52, color: color.accent, paddingRight: space.xs },
  parts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  part: { height: 30, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.surfaceHigh, justifyContent: 'center' },
  partText: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '700', color: color.textMuted },
  partXp: { color: color.accent, fontWeight: '800' },
  levelUp: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 34, paddingHorizontal: space.md, marginTop: space.md, borderRadius: radius.pill, backgroundColor: color.accent },
  levelUpText: { ...font.label, fontSize: 14, fontWeight: '800', color: color.onAccent },
  rewardLevel: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md },
  rewardLevelText: { ...font.caption, fontSize: 12, fontWeight: '700', color: color.textMuted, fontVariant: ['tabular-nums'] },
  darkTrack: { height: 8, borderRadius: radius.pill, backgroundColor: color.surfaceHigh, marginTop: space.xs + 2, overflow: 'hidden' },
  voltFill: { height: '100%', borderRadius: radius.pill, backgroundColor: color.accent },
  unlocked: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.lg },
  unlockedBadge: { alignItems: 'center', gap: space.xs + 2, width: 72 },
  unlockedName: { ...font.caption, fontSize: 11, lineHeight: 14, fontWeight: '800', color: color.text, textAlign: 'center' },
});
