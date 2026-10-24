import { Chips, type ChipOption } from './ChipRow';

/**
 * Multi-select chips (training days, equipment, limitations). The same chip as a
 * single-select row, announced as checkboxes. Sized to their labels and wrapping,
 * or equal-width on one line with `fill`, or a fixed grid with `columns`.
 */
export function ToggleChips<T extends string | number>({
  options,
  values,
  onToggle,
  fill = false,
  columns,
}: {
  options: readonly ChipOption<T>[];
  values: readonly T[];
  onToggle: (value: T) => void;
  fill?: boolean;
  columns?: number;
}) {
  return <Chips options={options} isOn={(v) => values.includes(v)} onPress={onToggle} role="checkbox" fill={fill} columns={columns} />;
}
