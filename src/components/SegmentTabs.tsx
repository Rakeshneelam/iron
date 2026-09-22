import { Pressable, StyleSheet, Text, View } from 'react-native';

import { selection } from '@/lib/haptics';
import { color, font, hit, radius, space } from '@/theme/tokens';

import type { ChipOption } from './ChipRow';

/**
 * The parts of one screen, always in view: Body's Weight · Measures · Recovery,
 * Settings' five tabs. Pills, so they never read as the answer chips below them.
 */
export function SegmentTabs<T extends string>({ options, value, onChange }: { options: readonly ChipOption<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
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
            style={[styles.pill, on && styles.on]}
          >
            <Text style={[styles.text, on && styles.textOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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
