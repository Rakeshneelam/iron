import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { ChipRow } from '@/components/ChipRow';
import { Sheet } from '@/components/Sheet';
import { listEquipment } from '@/db/repositories/equipment';
import { kgNum } from '@/lib/format';
import { barsAvailable, platesPerSide } from '@/lib/plates';
import { color, family, font, space } from '@/theme/tokens';

export function PlateSheet({ visible, weight, onClose }: { visible: boolean; weight: number; onClose: () => void }) {
  const equipment = useMemo(() => (visible ? listEquipment() : []), [visible]);
  const bars = barsAvailable(equipment);
  const [barId, setBarId] = useState<string | null>(null);
  const bar = bars.find((b) => b.id === barId) ?? bars.find((b) => b.valueKg <= weight) ?? bars[0];
  const plates = equipment.filter((e) => e.kind === 'plate');
  const result = bar ? platesPerSide(weight, bar.valueKg, plates) : null;

  return (
    <Sheet visible={visible} onClose={onClose} title={`${kgNum(weight)} kg`}>
      {bars.length > 1 ? (
        <ChipRow
          options={bars.map((b) => ({ label: `${b.machineName ?? 'Bar'} ${kgNum(b.valueKg)}`, value: b.id }))}
          value={bar?.id ?? null}
          onChange={setBarId}
          fill={false}
        />
      ) : null}
      {bar && result && result.length ? <LoadedSleeve plates={result} /> : null}
      <Text style={styles.big}>
        {!bar
          ? 'Add a bar in Settings › Gym inventory.'
          : result === null
            ? `Can't load ${kgNum(weight)} kg on this bar with your plates.`
            : result.length === 0
              ? 'Just the bar.'
              : result.map((p) => (p.count > 1 ? `${kgNum(p.plate)} × ${p.count}` : kgNum(p.plate))).join('  +  ')}
      </Text>
      {bar && result && result.length ? <Text style={styles.hint}>each side, on the {kgNum(bar.valueKg)} kg bar</Text> : null}
    </Sheet>
  );
}

/**
 * One sleeve of the bar, loaded, as a side elevation: collar at the left, plates
 * from heaviest outwards, each drawn to its weight and labelled under it.
 *
 * What to load is a calculation, not something you logged, so the plates are
 * outlines (docs/13). Size grows with weight so the order you load them in is the
 * order you see them in — the eye checks the bar against the drawing, not against
 * a sum.
 */
function LoadedSleeve({ plates }: { plates: { plate: number; count: number }[] }) {
  const [width, setWidth] = useState(0);
  const each = plates.flatMap((p) => Array.from({ length: p.count }, () => p.plate)).sort((a, b) => b - a);
  const H = 104;
  const mid = 46;
  const heightOf = (kg: number) => Math.min(84, 30 + 54 * Math.sqrt(Math.min(1, kg / 25)));
  const thickOf = (kg: number) => Math.max(7, Math.min(20, 6 + kg * 0.55));
  const gap = 3;
  const starts = each.map((_, i) => each.slice(0, i).reduce((t, k) => t + thickOf(k) + gap, 0));
  const collarX = 28;
  return (
    <View style={styles.sleeve} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={`Load, from the collar outwards: ${each.map((k) => `${kgNum(k)} kilograms`).join(', ')}.`}>
      {width > 0 ? (
        <Svg width={width} height={H}>
          {/* The sleeve, and the collar plates stop against. */}
          <Line x1={0} y1={mid} x2={width} y2={mid} stroke={color.textFaint} strokeWidth={6} strokeLinecap="round" />
          <Rect x={collarX - 10} y={mid - 14} width={8} height={28} rx={2} fill={color.textMuted} />
          {each.map((kg, i) => {
            const x = collarX + starts[i]!;
            const t = thickOf(kg);
            const h = heightOf(kg);
            return (
              <Rect key={i} x={x} y={mid - h / 2} width={t} height={h} rx={2} fill={color.bg} stroke={color.text} strokeWidth={1.5} />
            );
          })}
          {each.map((kg, i) => (
            <SvgText
              key={`l${i}`}
              x={collarX + starts[i]! + thickOf(kg) / 2}
              y={H - 4}
              fill={color.textMuted}
              fontSize={11}
              fontFamily={family.text}
              fontWeight="600"
              textAnchor="middle"
            >
              {kgNum(kg)}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sleeve: { marginTop: space.lg },
  big: { ...font.measure, fontSize: 30, lineHeight: 36, color: color.text, marginTop: space.md },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs, marginBottom: space.lg },
});
