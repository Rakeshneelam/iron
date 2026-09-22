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

import { ChipRow, EmptyState, Icon, IconButton, Pill, TextField } from '@/components';
import { useLive } from '@/db/live';
import { searchWorkoutsPage, type HistoryCursor, type HistoryRow } from '@/db/repositories/progress';
import { STATUS_LABEL, STATUS_TONE } from '@/features/session/status';
import { addDays, fmtDayLabel, parseISODate, todayISO } from '@/lib/date';
import { kg } from '@/lib/format';
import { color, font, hit, layout, radius, space } from '@/theme/tokens';

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
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A month label, then that month's workouts as the rows of one card. */
type Item = { kind: 'month'; key: string; label: string } | { kind: 'row'; key: string; r: HistoryRow; first: boolean; last: boolean };

function monthOf(iso: string): string {
  const d = parseISODate(iso);
  const label = MONTHS[d.getMonth()] ?? '';
  return d.getFullYear() === new Date().getFullYear() ? label : `${label} ${d.getFullYear()}`;
}

function minutesOf(r: HistoryRow): number | null {
  if (!r.session.endedAt) return null;
  const m = Math.round((Date.parse(r.session.endedAt) - Date.parse(r.session.startedAt)) / 60000);
  return Number.isFinite(m) && m > 0 ? m : null;
}

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

  const items = useMemo(() => {
    const out: Item[] = [];
    page.rows.forEach((r, i) => {
      const month = monthOf(r.session.date);
      const prev = page.rows[i - 1];
      const next = page.rows[i + 1];
      const first = !prev || monthOf(prev.session.date) !== month;
      if (first) out.push({ kind: 'month', key: `m-${month}`, label: month });
      out.push({ kind: 'row', key: r.session.id, r, first, last: !next || monthOf(next.session.date) !== month });
    });
    return out;
  }, [page.rows]);

  const searching = text.trim().length > 0;
  const clear = () => {
    setDraft('');
    set({ text: '', days: 0, pages: 1 });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/review'))} />
        <View style={styles.flex1}>
          <Text style={styles.title} accessibilityRole="header">
            Workout history
          </Text>
          <Text style={styles.subtitle}>
            {page.rows.length} {page.rows.length === 1 ? 'workout' : 'workouts'}
            {page.next ? ' so far' : ''}
            {!page.next && page.rows.length ? ` since ${monthOf(page.rows[page.rows.length - 1]?.session.date ?? todayISO())}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.filters}>
        <View style={styles.search}>
          <Icon name="search" size={20} color={color.textFaint} />
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
        </View>
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
          data={items}
          keyExtractor={(it) => it.key}
          getItemType={(it) => it.kind}
          contentContainerStyle={{ paddingHorizontal: layout.screenPadding, paddingBottom: insets.bottom + space.xl }}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (page.next) set((s) => ({ pages: s.pages + 1 }));
          }}
          ListFooterComponent={page.next ? <Text style={styles.footer}>Loading older workouts…</Text> : null}
          renderItem={({ item }) => {
            if (item.kind === 'month') return <Text style={styles.month}>{item.label}</Text>;
            const { r, first, last } = item;
            const mins = minutesOf(r);
            return (
              <Pressable
                onPress={() => router.push(`/session/summary/${r.session.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${r.dayLabel ?? 'Workout'}, ${fmtDayLabel(r.session.date)}, ${r.sets} sets. Open workout.`}
                style={({ pressed }) => [styles.row, first && styles.rowFirst, last && styles.rowLast, !first && styles.divider, pressed && styles.pressed]}
              >
                <View style={styles.flex1}>
                  <Text style={styles.name} numberOfLines={1}>
                    {r.dayLabel ?? 'Workout'}
                  </Text>
                  <Text style={styles.sub}>{[fmtDayLabel(r.session.date), `${r.sets} ${r.sets === 1 ? 'set' : 'sets'}`, mins ? `${mins} min` : null].filter(Boolean).join(' · ')}</Text>
                  {/* The reason you searched, on the row itself, so you never have to open it. */}
                  {r.top ? (
                    <Text style={styles.top}>
                      {r.top.name} · {r.top.weight > 0 ? `${kg(r.top.weight)} × ` : ''}
                      {r.top.reps}
                    </Text>
                  ) : null}
                </View>
                {r.session.status !== 'completed' ? <Pill label={STATUS_LABEL[r.session.status]} tone={STATUS_TONE[r.session.status]} /> : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex1: { flex: 1 },
  padded: { paddingHorizontal: layout.screenPadding },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingLeft: space.sm, paddingRight: layout.screenPadding, paddingTop: space.md, paddingBottom: space.sm },
  title: { ...font.titleSm, color: color.text },
  subtitle: { ...font.caption, color: color.textMuted, marginTop: 2 },
  filters: { paddingHorizontal: layout.screenPadding, gap: space.sm, paddingBottom: space.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md - 2,
    minHeight: hit.gym,
    paddingLeft: space.lg,
    backgroundColor: color.surfaceHigh,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
  },
  input: { flex: 1, minHeight: hit.gym, backgroundColor: 'transparent', paddingHorizontal: 0 },
  month: { ...font.eyebrow, color: color.textFaint, marginTop: space.lg, marginBottom: space.sm },
  // One card per month, drawn by its rows: the first rounds the top, the last the bottom.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 60,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    backgroundColor: color.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: color.border,
  },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  pressed: { backgroundColor: color.surfaceHigh },
  name: { ...font.label, fontWeight: '600', color: color.text },
  sub: { ...font.caption, fontSize: 12, ...font.numeric, color: color.textFaint, marginTop: 2 },
  top: { ...font.caption, fontWeight: '600', ...font.numeric, color: color.accent, marginTop: 2 },
  footer: { ...font.caption, color: color.textMuted, textAlign: 'center', paddingVertical: space.lg },
});
