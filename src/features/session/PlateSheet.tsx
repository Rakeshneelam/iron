import { useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { Sheet } from '@/components/Sheet';
import { listEquipment } from '@/db/repositories/equipment';
import { kgNum } from '@/lib/format';
import { barsAvailable, platesPerSide } from '@/lib/plates';
import { color, font, space } from '@/theme/tokens';

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

const styles = StyleSheet.create({
  big: { ...font.title, ...font.numeric, color: color.text, marginTop: space.lg },
  hint: { ...font.caption, color: color.textMuted, marginTop: space.xs, marginBottom: space.lg },
});
