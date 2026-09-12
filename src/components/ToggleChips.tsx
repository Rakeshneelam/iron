import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, font, hit, radius, space } from '@/theme/tokens';

import type { ChipOption } from './ChipRow';

/**
 * Multi-select chips (training days, equipment, limitations). Wraps onto lines.
 *
 * Selected reads as an outline rather than a solid fill. A single-select row has one
 * loud answer, but "what you have" can be thirteen yeses at once, and thirteen solid
 * accent blocks stop being emphasis and become the background.
 */
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
  on: { backgroundColor: color.surfaceHigh, borderColor: color.accent, borderWidth: 2 },
  pressed: { backgroundColor: color.border },
  text: { ...font.label, color: color.text },
  textOn: { color: color.accent, fontWeight: '700' },
});
