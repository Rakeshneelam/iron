import { Pressable, StyleSheet, Text, View } from 'react-native';

import { selection } from '@/lib/haptics';
import { color, font, hit, radius, space } from '@/theme/tokens';

export interface ChipOption<T extends string | number> {
  label: string;
  value: T;
}

export interface ChipRowProps<T extends string | number> {
  options: readonly ChipOption<T>[];
  value: T | null | undefined;
  onChange: (next: T) => void;
  size?: 'gym' | 'default';
  /** Equal-width chips on one line (RIR 0-4). Otherwise they size to their label and wrap. */
  fill?: boolean;
  haptics?: boolean;
}

/** One tap, never a picker. */
export function ChipRow<T extends string | number>({
  options,
  value,
  onChange,
  size = 'default',
  fill = true,
  haptics = true,
}: ChipRowProps<T>) {
  const chips = options.map((o) => {
    const selected = o.value === value;
    return (
      <Pressable
        key={String(o.value)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => {
          if (haptics) selection();
          onChange(o.value);
        }}
        style={({ pressed }) => [
          styles.chip,
          { minHeight: hit[size] },
          fill && styles.fill,
          selected && styles.selected,
          pressed && !selected && styles.pressed,
        ]}
      >
        {/* Two lines rather than an ellipsis, because "General fitness" cut to
            "General fit…" makes the option unreadable. And on equal-width chips the
            text shrinks to fit: "Maintain" breaking to "Maintai / n" looks broken. */}
        <Text
          style={[size === 'gym' ? styles.textGym : styles.text, selected && styles.textSelected]}
          numberOfLines={2}
          adjustsFontSizeToFit={fill}
          minimumFontScale={0.8}
        >
          {o.label}
        </Text>
      </Pressable>
    );
  });

  // Wrapping, never a horizontal scroller: an option parked off the right edge with
  // no scroll affordance is an option the user cannot see and will never find.
  return <View style={[styles.row, !fill && styles.wrap]}>{chips}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  wrap: { flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    backgroundColor: color.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.border,
  },
  fill: { flex: 1 },
  selected: { backgroundColor: color.accent, borderColor: color.accent },
  pressed: { backgroundColor: color.border },
  text: { ...font.label, color: color.text, textAlign: 'center' },
  textGym: { ...font.heading, ...font.numeric, color: color.text },
  textSelected: { color: color.onAccent },
});
