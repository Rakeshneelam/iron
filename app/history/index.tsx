/**
 * Workout history.
 *
 * One list and one search field — no mode switch. People arrive asking either "what
 * did I do on bench" or "what did I do in March", and making them choose a search
 * mode first serves neither. Type a lift and every row shows that lift's top set,
 * because that number is the actual question being asked.
 *
 * The list pages through everything on a stable cursor. It used to ask for 200 rows
 * and print "narrow the search to see older ones" underneath — which, for someone
 * with 250 sessions and nothing in particular to search for, put the oldest
 * workouts out of reach entirely (UX-09).
 */
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { Card, ChipRow, EmptyState, PrimaryButton, TextField } from '@/components';
import { useLive } from '@/db/live';
import { searchWorkoutsPage, type HistoryCursor } from '@/db/repositories/progress';
import { addDays, fmtDayLabel, todayISO } from '@/lib/date';
import { kg } from '@/lib/format';
import { color, font, hit, layout, space } from '@/theme/tokens';

/** Null = everything. Ranges people actually think in, not a date picker. */
const RANGES = [
  { label: 'All', value: 0 },
  { label: '30 days', value: 30 },
  { label: '3 months', value: 90 },
  // Was "This year", which actually meant the previous 365 days — so in February it
  // showed most of last year under a heading claiming otherwise (UX-09).
  { label: 'Last 12 months', value: 365 },
] as const;

const PAGE = 40;

/**
 * Filters survive leaving the screen.
 *
 * Opening a result and coming back used to reset the search, the range and the
 * scroll position, so finding the workout before the one you opened meant typing
 * it all again. Module state rather than component state, because the screen
 * unmounts on navigation.
 */
const useHistoryFilters = create<{ text: string; days: number; pages: number }>(() => ({ text: '', days: 0, pages: 1 }));

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { text, days, pages } = useHistoryFilters();
  const set = useHistoryFilters.setState;
  // Committed separately from the keystrokes so typing does not requery per letter
  // while still updating as you type — onCommit alone waited for a blur (UX-09).
  const [draft, setDraft] = useState(text);

  const sinceISO = useMemo(() => (days > 0 ? addDays(todayISO(), -days) : undefined), [days]);

  /**
   * Pages are re-read as one list rather than accumulated in state: a correction or
   * a deletion elsewhere has to be reflected, and re-walking N cursors is a handful
   * of indexed lookups on a local database.
   */
  const page = useLive(
    () => {
      const rows = [];
      let after: HistoryCursor | null = null;
      let next: HistoryCursor | null = null;
      for (let i = 0; i < pages; i++) {
        const p = searchWorkoutsPage({ text, sinceISO, limit: PAGE, after });
        rows.push(...p.rows);
        next = p.next;
        if (!p.next) break;
        after = p.next;
      }
      return { rows, next };
    },
    ['session', 'set_log', 'exercise', 'routine_day'],
    [text, sinceISO, pages],
  );

  const searching = text.trim().length > 0;
  const clear = () => {
    setDraft('');
    set({ text: '', days: 0, pages: 1 });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.flex1}>
          <Text style={styles.title}>History</Text>
          <Text style={styles.subtitle}>
            {page.rows.length} {page.rows.length === 1 ? 'workout' : 'workouts'}
            {page.next ? ' so far' : ''}
          </Text>
        </View>
        <PrimaryButton label="Back" tone="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/review'))} />
      </View>

      <View style={styles.filters}>
        <TextField
          value={draft}
          onType={(t) => {
            setDraft(t);
            // Every keystroke, not on blur: waiting for a blur meant the list sat
            // there unchanged while you typed, which reads as broken.
            set({ text: t, pages: 1 });
          }}
          onCommit={(t) => set({ text: t, pages: 1 })}
          placeholder="Search a lift — bench, squat, row"
          accessibilityLabel="Search workouts by exercise"
          style={styles.input}
        />
        <ChipRow options={RANGES} value={days} onChange={(v) => set({ days: v, pages: 1 })} />
      </View>

      {page.rows.length === 0 ? (
        <View style={styles.padded}>
          <EmptyState
            message={searching ? `Nothing logged for "${text.trim()}" in this period.` : 'No finished workouts yet.'}
            hint={searching ? undefined : 'Finish a workout and it appears here.'}
            actionLabel={searching || days > 0 ? 'Clear filters' : undefined}
            onAction={searching || days > 0 ? clear : undefined}
          />
        </View>
      ) : (
        <FlashList
          data={page.rows}
          keyExtractor={(r) => r.session.id}
          contentContainerStyle={{ paddingHorizontal: layout.screenPadding, paddingBottom: insets.bottom + space.xl }}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (page.next) set((s) => ({ pages: s.pages + 1 }));
          }}
          ListFooterComponent={page.next ? <Text style={styles.footer}>Loading older workouts…</Text> : null}
          renderItem={({ item: r }) => (
            <Pressable
              onPress={() => router.push(`/session/summary/${r.session.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${fmtDayLabel(r.session.date)}, ${r.sets} sets. Open workout.`}
            >
              <Card>
                <View style={styles.row}>
                  <Text style={styles.date}>{fmtDayLabel(r.session.date)}</Text>
                  {r.session.status === 'cancelled' ? <Text style={styles.muted}>cancelled</Text> : null}
                </View>
                <Text style={styles.muted}>{[r.dayLabel, `${r.sets} ${r.sets === 1 ? 'set' : 'sets'}`].filter(Boolean).join(' · ')}</Text>
                {/* The reason you searched, on the row itself, so you never have to open it. */}
                {r.top ? (
                  <Text style={styles.top}>
                    {r.top.name} · {r.top.weight > 0 ? `${kg(r.top.weight)} × ` : ''}
                    {r.top.reps}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          )}
        />
      )}
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
    paddingBottom: space.sm,
  },
  title: { ...font.title, color: color.text },
  subtitle: { ...font.label, color: color.textMuted, marginTop: space.xs },
  filters: { paddingHorizontal: layout.screenPadding, gap: space.sm, paddingBottom: space.md },
  input: { minHeight: hit.default },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { ...font.body, color: color.text, fontWeight: '600' },
  muted: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  top: { ...font.body, color: color.accent, marginTop: space.xs },
  footer: { ...font.caption, color: color.textMuted, textAlign: 'center', paddingVertical: space.lg },
});
