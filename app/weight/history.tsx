import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, PrimaryButton } from '@/components';
import { useLive } from '@/db/live';
import { countWeighIns, pageWeighIns } from '@/db/repositories/body';
import { WeighInSheet, type WeighEntry } from '@/features/body/sheets';
import { fmtDayLabel } from '@/lib/date';
import { kg, signed } from '@/lib/format';
import { color, font, hit, layout, space } from '@/theme/tokens';

const PAGE = 100;

/**
 * Every weigh-in, oldest reachable.
 *
 * Body used to offer "Show all", which expanded the list to sixty rows and stopped
 * — the sixty-first reading was simply unreachable, and the label said otherwise
 * (UX-03). This pages through the lot on a virtualised list, so the count in the
 * header is the count you can actually scroll to.
 */
export default function WeightHistory() {
  const insets = useSafeAreaInsets();
  const [limit, setLimit] = useState(PAGE);
  const [weigh, setWeigh] = useState<WeighEntry | null>(null);

  const total = useLive(() => countWeighIns(), ['weigh_in']);
  const rows = useLive(() => pageWeighIns(limit), ['weigh_in'], [limit]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.flex1}>
          <Text style={styles.title}>Weigh-ins</Text>
          <Text style={styles.subtitle}>
            {total === 0 ? 'Nothing logged yet' : `${total} readings · showing ${Math.min(limit, total)}`}
          </Text>
        </View>
        <PrimaryButton label="Back" tone="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/body?section=weight'))} />
      </View>

      {total === 0 ? (
        <View style={styles.padded}>
          <EmptyState message="No weigh-ins yet." hint="Log one from Body → Weight." />
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(w) => w.date}
          contentContainerStyle={{ paddingHorizontal: layout.screenPadding, paddingBottom: insets.bottom + space.xl }}
          onEndReachedThreshold={0.5}
          onEndReached={() => setLimit((n) => (n < total ? n + PAGE : n))}
          renderItem={({ item, index }) => {
            // Newest first, so the row below is the older reading.
            const older = rows[index + 1];
            return (
              <Pressable
                style={styles.row}
                onPress={() => setWeigh({ date: item.date })}
                accessibilityRole="button"
                accessibilityLabel={`${fmtDayLabel(item.date)}: ${kg(item.kg)}. Tap to edit or delete.`}
              >
                <Text style={styles.date}>{fmtDayLabel(item.date)}</Text>
                <View style={styles.end}>
                  {older ? <Text style={styles.delta}>{signed(item.kg - older.kg)}</Text> : null}
                  <Text style={styles.value}>{kg(item.kg)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <WeighInSheet entry={weigh} onClose={() => setWeigh(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex1: { flex: 1 },
  padded: { paddingHorizontal: layout.screenPadding },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
  title: { ...font.title, color: color.text },
  subtitle: { ...font.label, color: color.textMuted, marginTop: space.xs },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
    minHeight: hit.default,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  end: { flexDirection: 'row', alignItems: 'baseline', gap: space.md },
  date: { ...font.body, color: color.text },
  delta: { ...font.caption, ...font.numeric, color: color.textMuted },
  value: { ...font.body, ...font.numeric, color: color.text, fontWeight: '600' },
});
