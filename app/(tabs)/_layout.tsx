import { Tabs } from 'expo-router/js-tabs';

import { Icon, type IconName } from '@/components/Icon';
import { color, font } from '@/theme/tokens';

/** Route names are kept from v1 (deep links and notifications point at them); titles are what users see. */
const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Today', icon: 'dumbbell' },
  { name: 'program', title: 'Plans', icon: 'plans' },
  { name: 'review', title: 'Progress', icon: 'progress' },
  { name: 'body', title: 'Body', icon: 'body' },
  { name: 'water', title: 'Water', icon: 'water' },
  { name: 'food', title: 'Food', icon: 'food' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.textMuted,
        tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.border },
        tabBarLabelStyle: { ...font.caption, fontWeight: '600' },
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
    </Tabs>
  );
}
