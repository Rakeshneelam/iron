import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, font, hit, radius, space } from '@/theme/tokens';

import type { ChipOption } from './ChipRow';

/** Multi-select chips (training days, limitations). Wraps onto several lines. */
export function ToggleChips<T extends string | number>({
  options,
  values,
  onToggle,
}: {
  options: readonly ChipOption<T>[];
  values: readonly T[];
  onToggle: (value: T) => void;
}) {
  return (
    <View style={styles.row}>
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => {
              void Haptics.selectionAsync();
              onToggle(o.value);
            }}
            style={({ pressed }) => [styles.chip, on && styles.on, pressed && !on && styles.pressed]}
          >
            <Text style={[styles.text, on && styles.textOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: hit.default,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surfaceHigh,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  on: { backgroundColor: color.accent, borderColor: color.accent },
  pressed: { backgroundColor: color.border },
  text: { ...font.label, color: color.text },
  textOn: { color: color.onAccent },
});
