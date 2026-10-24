import { StyleSheet, View } from 'react-native';

import { Press } from '@/components/Press';
import { color, radius, space } from '@/theme/tokens';

export interface RailExercise {
  id: string;
  /** Working sets logged so far. */
  done: number;
  /** Sets this exercise is running to today. */
  target: number;
  skipped: boolean;
}

/**
 * The whole workout as its sets: one group per exercise, one mark per set.
 *
 * It replaces a row of 4dp segments that could only say "this exercise is
 * started" or "finished". A workout is not five things, it is twenty sets with
 * rest between them, and that is what the rail draws — so a glance from the bench
 * says how much is left in sets, which is the unit you are actually counting.
 *
 * The app's conventions (docs/13): a logged set is solid chalk, a planned one is
 * hollow, the set you are on is a hollow mark in heat, and a skipped exercise is a
 * single quiet rule — present in the record as a decision, with nothing to count.
 * Sets beyond the plan are solid too; the group simply grows.
 *
 * Not a streak and not a score: nothing here can be broken or scored, and nothing
 * is coloured for being finished. Tapping it opens the exercise list.
 */
export function SessionRail({ items, current, onPress }: { items: readonly RailExercise[]; current: string | null; onPress: () => void }) {
  const done = items.reduce((t, e) => t + (e.skipped ? 0 : Math.min(e.done, Math.max(e.target, e.done))), 0);
  const total = items.reduce((t, e) => t + (e.skipped ? 0 : Math.max(e.target, e.done)), 0);
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${done} of ${total} sets logged across ${items.length} exercises. Opens the exercise list.`}
      feedback="highlight"
      style={styles.rail}
      pressedStyle={styles.held}
    >
      {items.map((e) => {
        const now = e.id === current;
        const slots = Math.max(e.target, e.done);
        return (
          <View key={e.id} style={[styles.group, { flexGrow: e.skipped ? 1 : slots }]}>
            {e.skipped ? (
              <View style={styles.skipped} />
            ) : (
              Array.from({ length: slots }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.mark,
                    i < e.done ? styles.logged : now && i === e.done ? styles.next : styles.planned,
                  ]}
                />
              ))
            )}
          </View>
        );
      })}
    </Press>
  );
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    minHeight: 28,
    paddingHorizontal: space.xs,
    borderRadius: radius.sm,
  },
  held: { backgroundColor: color.surfaceHigh },
  group: { flexDirection: 'row', flexShrink: 1, flexBasis: 0, gap: 2 },
  /** Up to 9dp wide, down to whatever a long workout leaves. */
  mark: { flex: 1, maxWidth: 9, height: 12, borderRadius: 1.5 },
  logged: { backgroundColor: color.text },
  planned: { borderWidth: 1, borderColor: color.textFaint },
  next: { borderWidth: 1.5, borderColor: color.accent },
  skipped: { flex: 1, maxWidth: 18, height: 1.5, backgroundColor: color.textFaint },
});
