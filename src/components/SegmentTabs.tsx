import { StyleSheet, Text, View } from 'react-native';

import { selection } from '@/lib/haptics';
import { transition } from '@/theme/curves';
import { color, font, hit, radius, space } from '@/theme/tokens';

import type { ChipOption } from './ChipRow';
import { Press } from './Press';

/**
 * The parts of one screen, always in view: Body's Weight, Measures and Recovery;
 * Settings' five tabs. Words over a rule, the selected one underlined in chalk —
 * a drawing's section marker, so they never read as the answer chips below them,
 * which are boxes.
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
  row: { flexDirection: 'row', columnGap: space.xl, rowGap: space.xs, flexWrap: 'wrap' },
  pill: {
    height: hit.default - space.md,
    borderBottomWidth: 2,
    borderColor: 'transparent',
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    justifyContent: 'center',
  },
  on: { borderColor: color.text },
  text: { ...font.label, fontWeight: '600', color: color.textFaint },
  textOn: { color: color.text },
});
