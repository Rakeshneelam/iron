import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { useLive } from '@/db/live';
import { getActiveSession } from '@/db/repositories/sessions';
import { color, font, radius } from '@/theme/tokens';

/**
 * Five destinations, in the order the day runs: what am I doing now, what have I
 * eaten, how is my body, what will I train, how has it gone.
 *
 * There were six, and two of them overlapped: Daily owned the check-in, weight and
 * sleep, while Body owned measurements and profile and its own comment admitted it
 * changed every few weeks. A user had to learn the implementation to know where to
 * go. Daily's content moved into Body as its Weight and Recovery sections, and the
 * profile fields moved to Settings (UX-01).
 *
 * Route names are kept from v1 where they exist — deep links and notifications point
 * at them — so `index`, `program` and `review` carry the labels Today, Plans and
 * Progress. Water stays a detail screen off Today and Food, not a tab.
 *
 * Where you are is chalk; heat is not spent on navigation. The one exception is the
 * point of heat: while a workout is open, Today carries a small hot mark from every
 * other tab, because a live workout is the one thing in the app that is running.
 */
const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Today', icon: 'dumbbell' },
  { name: 'food', title: 'Food', icon: 'food' },
  { name: 'body', title: 'Body', icon: 'body' },
  { name: 'program', title: 'Plans', icon: 'plans' },
  { name: 'review', title: 'Progress', icon: 'progress' },
];

export default function TabsLayout() {
  const live = useLive(() => getActiveSession() !== undefined, ['session']);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.text,
        tabBarInactiveTintColor: color.textFaint,
        tabBarStyle: { backgroundColor: color.bg, borderTopColor: color.border, borderTopWidth: StyleSheet.hairlineWidth },
        tabBarLabelStyle: { ...font.caption, fontSize: 11, lineHeight: 14, fontWeight: '600' },
        sceneStyle: { backgroundColor: color.bg },
        // Tabs are peers: switching between them never animates (docs/05).
        animation: 'none',
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarAccessibilityLabel: t.name === 'index' && live ? 'Today, a workout is in progress' : t.title,
            tabBarIcon: ({ color: tint, focused }) => (
              <View style={styles.icon}>
                {/* Where you are: a short chalk rule above the glyph, as a drawing marks the sheet it is on. */}
                <View style={[styles.marker, focused && styles.markerOn]} />
                <Icon name={t.icon} size={22} color={tint} strokeWidth={focused ? 2.2 : 1.8} />
                {t.name === 'index' && live ? <View style={styles.live} /> : null}
              </View>
            ),
          }}
        />
      ))}
      {/*
        `daily` is still a route — reminders scheduled by earlier versions carry
        /daily, and they have to land somewhere — but it is not a destination any
        more. Declared explicitly with href: null so the router's automatic tab
        discovery cannot put a sixth item back in the bar; the file itself redirects
        to Body → Weight.
      */}
      <Tabs.Screen name="daily" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  marker: { position: 'absolute', top: -7, width: 18, height: 2, borderRadius: radius.pill, backgroundColor: 'transparent' },
  markerOn: { backgroundColor: color.text },
  live: { position: 'absolute', top: 2, right: -5, width: 7, height: 7, borderRadius: radius.pill, backgroundColor: color.accent },
});
