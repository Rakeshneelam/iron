import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { selection } from '@/lib/haptics';
import { color, font, hit, radius, space } from '@/theme/tokens';

import { FitText } from './FitText';
import { Press } from './Press';

export interface ChipOption<T extends string | number> {
  label: string;
  value: T;
  /** A glyph before the label ("Pain" carries its flag). */
  icon?: ReactNode;
}

export interface ChipRowProps<T extends string | number> {
  options: readonly ChipOption<T>[];
  value: T | null | undefined;
  onChange: (next: T) => void;
  size?: 'gym' | 'default';
  /** Equal-width chips on one line (RIR 0-4). Otherwise they size to their label and wrap. */
  fill?: boolean;
  /** A fixed grid: five places to train read as rows of three, not one squeezed line. */
  columns?: number;
  haptics?: boolean;
}

/** One tap, never a picker. */
export function ChipRow<T extends string | number>({ options, value, onChange, ...layout }: ChipRowProps<T>) {
  return <Chips options={options} isOn={(v) => v === value} onPress={onChange} role="button" {...layout} />;
}

interface ChipsProps<T extends string | number> {
  options: readonly ChipOption<T>[];
  isOn: (value: T) => boolean;
  onPress: (value: T) => void;
  role: 'button' | 'checkbox';
  size?: 'gym' | 'default';
  fill?: boolean;
  columns?: number;
  haptics?: boolean;
}

/**
 * The one chip. Single-select rows and multi-select sets look identical: an
 * unchosen option is an outline in muted text, a chosen one is solid chalk with
 * graphite text.
 *
 * Chalk, not heat. An answer you gave is a fact, and facts are written in chalk
 * across the whole app (docs/13); heat is for the one live thing, and a row of
 * RIR chips with one glowing would have competed with Log set for it. Solid also
 * reads at arm's length in a way a 1px coloured edge never did.
 */
export function Chips<T extends string | number>({ options, isOn, onPress, role, size = 'default', fill = true, columns, haptics = true }: ChipsProps<T>) {
  const grid = columns !== undefined;
  const chips = options.map((o) => {
    const on = isOn(o.value);
    const chip = (
      <Press
        key={String(o.value)}
        accessibilityRole={role}
        accessibilityState={role === 'checkbox' ? { checked: on } : { selected: on }}
        accessibilityLabel={o.label}
        onPress={() => {
          if (haptics) selection();
          onPress(o.value);
        }}
        // Equal-width chips flex, and the flex has to sit on the touch target.
        touchStyle={fill && !grid ? styles.fill : undefined}
        style={[styles.chip, { minHeight: hit[size] }, on && styles.on]}
        pressedStyle={on ? undefined : styles.pressed}
      >
        {o.icon}
        {/* Two lines rather than an ellipsis, because "General fitness" cut to
            "General fit…" makes the option unreadable. And on equal-width chips the
            text shrinks to fit: "Maintain" breaking to "Maintai / n" looks broken. */}
        <FitText
          style={[size === 'gym' ? styles.textGym : styles.text, on && styles.textOn]}
          numberOfLines={2}
          adjustsFontSizeToFit={fill || grid}
          minimumFontScale={0.8}
        >
          {o.label}
        </FitText>
      </Press>
    );
    return grid ? (
      <View key={String(o.value)} style={[styles.cell, { width: `${100 / columns}%` }]}>
        {chip}
      </View>
    ) : (
      chip
    );
  });

  // Wrapping, never a horizontal scroller: an option parked off the right edge with
  // no scroll affordance is an option the user cannot see and will never find.
  return <View style={grid ? styles.grid : [styles.row, !fill && styles.wrap]}>{chips}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  wrap: { flexWrap: 'wrap' },
  // Half a gap either side of every cell, pulled back at the edges: exact thirds.
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.xs, rowGap: space.sm },
  cell: { paddingHorizontal: space.xs },
  chip: {
    flexDirection: 'row',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.border,
  },
  fill: { flex: 1 },
  on: { backgroundColor: color.text, borderColor: color.text },
  pressed: { backgroundColor: color.surfaceHigh },
  text: { ...font.label, fontWeight: '600', color: color.textMuted, textAlign: 'center' },
  textGym: { ...font.measure, fontSize: 20, lineHeight: 24, color: color.textMuted },
  textOn: { color: color.bg },
});
