import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { color as palette } from '@/theme/tokens';

/**
 * Line icons on a 24-unit grid, drawn here so the app carries no icon font.
 * `d` is stroked; `fill` shapes are filled; `dots` are small filled circles.
 */
const ICONS = {
  dumbbell: { d: 'M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11' },
  plans: { d: 'M9 6h11M9 12h11M9 18h11', dots: [[4.5, 6], [4.5, 12], [4.5, 18]] },
  progress: { d: 'M3 17l6-6 4 4 8-8M15 7h6v6' },
  body: { d: 'M12 8.5v6M6.5 10.5h11M12 14.5l-3.5 6.5M12 14.5l3.5 6.5', circles: [[12, 5, 2.2]] },
  water: { d: 'M12 3.2c3.6 4.4 6 7.8 6 10.8a6 6 0 0 1-12 0c0-3 2.4-6.4 6-10.8z' },
  food: { d: 'M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3M17.5 21V3c-2.2 1-3.5 4-3.5 8.5h3.5' },
  settings: { d: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1', circles: [[15, 6, 2], [9, 12, 2], [17, 18, 2]] },
  plus: { d: 'M12 5v14M5 12h14' },
  minus: { d: 'M5 12h14' },
  close: { d: 'M6 6l12 12M18 6L6 18' },
  check: { d: 'M5 12.5l4.5 4.5L19 7' },
  chevronLeft: { d: 'M15 5l-7 7 7 7' },
  chevronRight: { d: 'M9 5l7 7-7 7' },
  chevronUp: { d: 'M5 15l7-7 7 7' },
  chevronDown: { d: 'M5 9l7 7 7-7' },
  more: { d: '', dots: [[5, 12], [12, 12], [19, 12]] },
  play: { d: '', fill: 'M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.2-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z' },
  skip: { d: 'M5 5.5l9 6.5-9 6.5zM19 5v14' },
  swap: { d: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7' },
  trash: { d: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6' },
  undo: { d: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11' },
  edit: { d: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4' },
  copy: { d: 'M9 9h11v11H9zM5 15H4V4h11v1' },
  archive: { d: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4' },
  timer: { d: 'M12 13V9M9 2.5h6', circles: [[12, 13, 8]] },
  info: { d: 'M12 11v5.5', circles: [[12, 12, 9]], dots: [[12, 7.8]] },
  flag: { d: 'M5 21V4M5 4h11l-2 4 2 4H5' },
  calendar: { d: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
  ruler: { d: 'M3 16.5L16.5 3 21 7.5 7.5 21zM7 12.5l2 2M10 9.5l2 2M13 6.5l2 2' },
  spark: { d: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4zM19 16l.8 2.2 2.2.8-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z' },
  export: { d: 'M12 3v12M7 8l5-5 5 5M4 15v5h16v-5' },
  star: { d: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z' },
} as const;

export type IconName = keyof typeof ICONS;

type Def = { d: string; circles?: readonly (readonly number[])[]; dots?: readonly (readonly number[])[]; fill?: string };

export interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorValue;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color = palette.text, strokeWidth = 2 }: IconProps) {
  const def: Def = ICONS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {def.d ? <Path d={def.d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" /> : null}
      {def.fill ? <Path d={def.fill} fill={color} /> : null}
      {def.circles?.map(([cx, cy, r], i) => (
        <Circle key={`c${i}`} cx={cx} cy={cy} r={r} stroke={color} strokeWidth={strokeWidth} fill="none" />
      ))}
      {def.dots?.map(([cx, cy], i) => <Circle key={`d${i}`} cx={cx} cy={cy} r={1.6} fill={color} />)}
    </Svg>
  );
}
