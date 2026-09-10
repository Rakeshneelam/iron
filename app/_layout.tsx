import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { initDatabase } from '@/db/client';
import {
  ensureChannels,
  registerCategories,
  requestPermissions,
  rescheduleAll,
  useNotificationResponses,
} from '@/services/notifications';
import { color, font, space } from '@/theme/tokens';

export const unstable_settings = { initialRouteName: '(tabs)' };

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

type Boot = { state: 'loading' } | { state: 'ready' } | { state: 'error'; message: string };

/** No onboarding, no login: straight into Today once the database is open (AGENTS.md §1.2). */
export default function RootLayout() {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });

  const start = useCallback(() => {
    setBoot({ state: 'loading' });
    initDatabase().then(
      () => setBoot({ state: 'ready' }),
      (e: unknown) => setBoot({ state: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
  }, []);

  useEffect(() => {
    start();
  }, [start]);

  useEffect(() => {
    if (boot.state !== 'loading') void SplashScreen.hideAsync().catch(() => undefined);
  }, [boot.state]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {boot.state === 'ready' ? (
          <>
            <AppServices />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg }, animation: 'fade' }} />
          </>
        ) : boot.state === 'error' ? (
          <View style={styles.center}>
            <Text style={styles.title}>Iron couldn't open its database.</Text>
            <Text style={styles.body}>Your data has not been touched. {boot.message}</Text>
            <PrimaryButton label="Try again" onPress={start} />
          </View>
        ) : (
          <View style={styles.root} />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Notification plumbing. Failures here must never block the app. */
function AppServices() {
  useNotificationResponses();
  useEffect(() => {
    void (async () => {
      try {
        await ensureChannels();
        await registerCategories();
        await requestPermissions();
        await rescheduleAll();
      } catch {
        /* reminders are optional */
      }
    })();
  }, []);
  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  center: { flex: 1, backgroundColor: color.bg, justifyContent: 'center', padding: space.xl, gap: space.lg },
  title: { ...font.heading, color: color.text },
  body: { ...font.body, color: color.textMuted },
});
