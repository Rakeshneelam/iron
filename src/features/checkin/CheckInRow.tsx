import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { useLive } from '@/db/live';
import { getCheckIn, getWeighIn } from '@/db/repositories/body';
import { getDayTotal } from '@/db/repositories/water';
import { kg, ml } from '@/lib/format';
import { hydrationTarget } from '@/services/hydration';
import { color, font, hit, radius, space } from '@/theme/tokens';

import { sleepLabel } from './CheckInSheet';

/**
 * Today's check-in, compressed to one row, plus the water shortcut.
 *
 * This replaces the card that used to sit above the workout on every state of
 * Today: a title, a hint, three cells and — on the main screen — a weight chart,
 * which pushed the thing the screen is for below the fold. Today asks "what am I
 * doing now"; the check-in is optional context for it, and the trend belongs on
 * Body where the full one lives (UX-02).
 *
 * It opens the same CheckInSheet, so this is a shortcut, not a second form.
 */
export function CheckInRow({ onCheckIn }: { onCheckIn: () => void }) {
  const data = useLive(
    () => {
      const today = new Date().toISOString().slice(0, 10);
      return {
        checkIn: getCheckIn(today),
        weighIn: getWeighIn(today),
        water: getDayTotal(today),
        waterTarget: hydrationTarget().ml,
      };
    },
    ['check_in', 'weigh_in', 'water_log', 'setting', 'session'],
  );

  const c = data.checkIn;
  // Only committed facts. "Checked in" with nothing under it says nothing.
  const saved = [
    data.weighIn ? kg(data.weighIn.kg) : null,
    c && c.sleepHours !== null ? sleepLabel(c.sleepHours) : null,
    c && c.soreness !== null ? `soreness ${c.soreness}` : null,
  ].filter(Boolean);

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onCheckIn}
        accessibilityRole="button"
        accessibilityLabel={saved.length ? `Check-in: ${saved.join(', ')}. Tap to edit.` : 'Check in. Optional.'}
        style={({ pressed }) => [styles.cell, styles.grow, pressed && styles.pressed]}
      >
        <Icon name="pulse" size={18} color={color.textMuted} />
        <View style={styles.flex1}>
          <Text style={styles.label} numberOfLines={1}>
            {saved.length ? saved.join(' · ') : 'Check in — optional'}
          </Text>
        </View>
        <Text style={styles.action}>{saved.length ? 'Edit' : 'Add'}</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push('/water')}
        accessibilityRole="button"
        accessibilityLabel={`Water: ${ml(data.water)} of ${ml(data.waterTarget)} today. Tap to log.`}
        style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
      >
        <Icon name="water" size={18} color={color.textMuted} />
        <Text style={styles.label}>{ml(data.water)}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  grow: { flex: 1 },
  row: { flexDirection: 'row', gap: space.sm },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: hit.default,
    paddingHorizontal: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
  },
  pressed: { backgroundColor: color.surfaceHigh },
  label: { ...font.label, color: color.text },
  action: { ...font.label, color: color.accent, fontWeight: '700' },
});
