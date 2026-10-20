import { StyleSheet, Text, View } from 'react-native';

import { selection } from '@/lib/haptics';
import { transition } from '@/theme/curves';
import { color, font, hit, radius, space } from '@/theme/tokens';

import type { ChipOption } from './ChipRow';
import { Press } from './Press';

/**
 * The parts of one screen, always in view: Body's Weight · Measures · Recovery,
 * Settings' five tabs. Pills, so they never read as the answer chips below them.
 *
 * Deliberately NOT a sliding indicator. These get switched tens of times a day,
 * and at that frequency motion has to be imperceptible or absent — a pill
 * travelling 250ms across a track is something you wait for, every time. Sliding
 * between peers also implies a depth they do not have: these are three views of
 * one screen, not three places. So the selection cross-fades in 150ms and the
 * press itself is the only thing that moves.
 */
export function SegmentTabs<T extends string>({ options, value, onChange }: { options: readonly ChipOption<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Press
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return;
              selection();
              onChange(o.value);
            }}
            // The pill is drawn shorter than a target; the slop makes up the rest.
            hitSlop={{ top: space.md / 2, bottom: space.md / 2 }}
            style={[styles.pill, SELECT_FADE, on && styles.on]}
          >
            <Text style={[styles.text, on && styles.textOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

/**
 * Selection fades rather than snapping. Both properties together, or the fill
 * arrives before the edge does and the pill looks like it is assembling itself.
 */
const SELECT_FADE = transition(['backgroundColor', 'borderColor']);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  pill: {
    height: hit.default - space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    justifyContent: 'center',
  },
  on: { backgroundColor: color.surfaceHigh, borderColor: color.accent },
  text: { ...font.caption, fontWeight: '600', color: color.textMuted },
  textOn: { color: color.text },
});
