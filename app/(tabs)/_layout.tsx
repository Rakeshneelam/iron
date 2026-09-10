import { Tabs } from 'expo-router/js-tabs';
import { Text } from 'react-native';

import { color, font } from '@/theme/tokens';

/** PRD priority order. Glyphs are plain Unicode — no icon package. */
const TABS = [
  { name: 'index', title: 'Today', glyph: '●' },
  { name: 'program', title: 'Program', glyph: '☰' },
  { name: 'body', title: 'Body', glyph: '◒' },
  { name: 'food', title: 'Food', glyph: '◍' },
  { name: 'water', title: 'Water', glyph: '◌' },
  { name: 'review', title: 'Review', glyph: '▦' },
] as const;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.textMuted,
        tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.border },
        tabBarLabelStyle: font.caption,
        sceneStyle: { backgroundColor: color.bg },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color: tint }) => <Text style={{ color: tint, fontSize: font.heading.fontSize }}>{t.glyph}</Text>,
          }}
        />
      ))}
    </Tabs>
  );
}
