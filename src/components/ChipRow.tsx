import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
  /** Equal-width chips across the row (RIR 0-4). Otherwise a horizontal scroller. */
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
          if (haptics) void Haptics.selectionAsync();
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
        <Text style={[size === 'gym' ? styles.textGym : styles.text, selected && styles.textSelected]} numberOfLines={1}>
          {o.label}
        </Text>
      </Pressable>
    );
  });

  if (fill) return <View style={styles.row}>{chips}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chips}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
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
  text: { ...font.label, color: color.text },
  textGym: { ...font.heading, ...font.numeric, color: color.text },
  textSelected: { color: color.onAccent },
});
