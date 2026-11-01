import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { Press } from '@/components/Press';
import { useLive } from '@/db/live';
import { getActiveSession } from '@/db/repositories/sessions';
import { selection } from '@/lib/haptics';
import { color, material, radius, space } from '@/theme/tokens';

/**
 * Five destinations, in the order the day runs: what am I doing now, what have I
 * eaten, how is my body, what will I train, how has it gone. Route names are kept
 * from v1 — deep links and notifications point at them — so `index`, `program` and
 * `review` carry the labels Today, Plans and Progress. Water is a screen off Today
 * and Food, not a tab; `daily` survives only as a redirect for old reminders.
 */
const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Today', icon: 'dumbbell' },
  { name: 'food', title: 'Food', icon: 'food' },
  { name: 'body', title: 'Body', icon: 'body' },
  { name: 'program', title: 'Plans', icon: 'plans' },
  { name: 'review', title: 'Progress', icon: 'progress' },
];

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export default function TabsLayout() {
  const live = useLive(() => getActiveSession() !== undefined, ['session']);
  return (
    <Tabs
      tabBar={(props) => <PillTabBar {...props} live={live} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.bg },
        // Tabs are peers: switching between them never animates (docs/05).
        animation: 'none',
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.title }} />
      ))}
      {/* A route old reminders still carry, not a destination: never in the bar. */}
      <Tabs.Screen name="daily" options={{ href: null }} />
    </Tabs>
  );
}

/**
 * A floating capsule of five round buttons, icons only, the current one a volt
 * disc. While a workout is open, Today carries a small pink dot from every tab.
 */
function PillTabBar({ state, navigation, insets, live }: TabBarProps & { live: boolean }) {
  const current = state.routes[state.index]?.name;
  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + space.sm }]}>
      <View style={styles.capsule} accessibilityRole="tablist">
        {TABS.map((t) => {
          const route = state.routes.find((r) => r.name === t.name);
          if (!route) return null;
          const focused = current === t.name;
          return (
            <Press
              key={t.name}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) {
                  selection();
                  navigation.navigate(route.name, route.params);
                }
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={t.name === 'index' && live ? `${t.title}, a workout is in progress` : t.title}
              style={[styles.tab, focused && styles.tabOn]}
            >
              <Icon name={t.icon} size={22} color={focused ? color.onAccent : color.textMuted} strokeWidth={focused ? 2.4 : 2} />
              {t.name === 'index' && live ? <View style={[styles.live, focused && styles.liveOn]} /> : null}
            </Press>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: color.bg, paddingHorizontal: space.lg + 2, paddingTop: space.xs },
  capsule: {
    height: 70,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceHigh,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: space.sm,
    boxShadow: material.lift,
  },
  tab: { width: 54, height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: color.accent },
  live: { position: 'absolute', top: 9, right: 9, width: 9, height: 9, borderRadius: radius.pill, backgroundColor: color.pink, borderWidth: 2, borderColor: color.surfaceHigh },
  liveOn: { borderColor: color.accent },
});
