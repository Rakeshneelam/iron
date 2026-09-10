import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, ChipRow, PrimaryButton, Screen, SectionHeader, Stepper } from '@/components';
import { useLive } from '@/db/live';
import { addEquipment, deleteEquipment, listEquipment, updateEquipment, type EquipmentKind } from '@/db/repositories/equipment';
import { kgNum } from '@/lib/format';
import { color, font, hit, radius, space } from '@/theme/tokens';

const KINDS: { label: string; value: EquipmentKind }[] = [
  { label: 'Plates', value: 'plate' },
  { label: 'Dumbbells', value: 'dumbbell' },
  { label: 'Bars', value: 'bar' },
  { label: 'Stacks', value: 'machine_stack' },
];

export default function EquipmentScreen() {
  const items = useLive(listEquipment, ['equipment']);
  const [kind, setKind] = useState<EquipmentKind>('plate');
  const [value, setValue] = useState(2.5);
  const [count, setCount] = useState(2);
  const [name, setName] = useState('');

  return (
    <Screen title="Gym inventory" subtitle="Suggestions snap to what you can actually load." right={<PrimaryButton label="Done" tone="ghost" onPress={() => router.back()} />}>
      {KINDS.map((k) => {
        const rows = items.filter((i) => i.kind === k.value);
        return (
          <View key={k.value}>
            <SectionHeader title={k.label} />
            {rows.length === 0 ? <Text style={styles.hint}>None — add below.</Text> : null}
            {rows.map((r) => (
              <View key={r.id} style={styles.row}>
                <Text style={styles.value}>
                  {kgNum(r.valueKg)} kg{r.machineName ? `  ·  ${r.machineName}` : ''}
                </Text>
                <View style={styles.count}>
                  <Stepper value={r.count} step={1} min={0} max={40} suffix="×" onChange={(v) => updateEquipment(r.id, { count: v })} />
                </View>
                <Pressable style={styles.del} onPress={() => deleteEquipment(r.id)} accessibilityLabel="Remove">
                  <Text style={styles.delText}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        );
      })}

      <SectionHeader title="Add" />
      <Card>
        <ChipRow options={KINDS} value={kind} onChange={setKind} fill={false} />
        <View style={styles.pair}>
          <Stepper label="Weight" suffix="kg" value={value} step={0.25} min={0.25} max={300} onChange={setValue} />
          <Stepper label="Count" value={count} step={1} min={1} max={40} onChange={setCount} />
        </View>
        {kind === 'machine_stack' || kind === 'bar' ? (
          <TextInput
            placeholder={kind === 'bar' ? 'Name (e.g. EZ bar)' : 'Machine (e.g. Lat pulldown)'}
            placeholderTextColor={color.textFaint}
            value={name}
            onChangeText={setName}
            style={styles.input}
          />
        ) : null}
        <PrimaryButton
          label="Add"
          style={styles.gap}
          onPress={() => {
            addEquipment({ kind, valueKg: value, count, machineName: name.trim() || null });
            setName('');
          }}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  value: { ...font.body, ...font.numeric, color: color.text, flex: 1 },
  count: { width: 170 },
  del: { width: hit.default, height: hit.default, alignItems: 'center', justifyContent: 'center' },
  delText: { ...font.label, color: color.textMuted },
  hint: { ...font.caption, color: color.textMuted },
  pair: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  input: {
    ...font.body,
    color: color.text,
    backgroundColor: color.surfaceHigh,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: hit.default,
    marginTop: space.md,
  },
  gap: { marginTop: space.md },
});
