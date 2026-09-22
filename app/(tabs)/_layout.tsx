import { Tabs } from 'expo-router/js-tabs';

import { Icon, type IconName } from '@/components/Icon';
import { color, font } from '@/theme/tokens';

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
 */
const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Today', icon: 'dumbbell' },
  { name: 'food', title: 'Food', icon: 'food' },
  { name: 'body', title: 'Body', icon: 'body' },
  { name: 'program', title: 'Plans', icon: 'plans' },
  { name: 'review', title: 'Progress', icon: 'progress' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.textMuted,
        tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.border },
        tabBarLabelStyle: { ...font.caption, fontSize: 11, lineHeight: 14, fontWeight: '600' },
        sceneStyle: { backgroundColor: color.bg },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color: tint }) => <Icon name={t.icon} size={22} color={tint} />,
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
