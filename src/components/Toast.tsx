import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { color, font, hit, radius, space } from '@/theme/tokens';

interface ToastData {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

const useToastStore = create<{ current: ToastData | null }>(() => ({ current: null }));
let seq = 0;

/**
 * Transient confirmation with an optional Undo. The preferred alternative to an
 * "are you sure?" dialog: the action happens at once and is reversible for a few seconds.
 */
export function toast(message: string, action?: { label: string; onPress: () => void }): void {
  useToastStore.setState({ current: { id: ++seq, message, actionLabel: action?.label, onAction: action?.onPress } });
}

export function dismissToast(): void {
  useToastStore.setState({ current: null });
}

/** Mounted once in the root layout, above every screen. */
export function ToastHost() {
  const current = useToastStore((s) => s.current);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => useToastStore.setState((s) => (s.current?.id === current.id ? { current: null } : s)), current.onAction ? 5000 : 2500);
    return () => clearTimeout(t);
  }, [current]);

  if (!current) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + space.sm }]}>
      <Animated.View key={current.id} entering={FadeInUp.duration(180)} exiting={FadeOutUp.duration(150)} style={styles.toast}>
        <Text style={styles.message} numberOfLines={2}>
          {current.message}
        </Text>
        {current.onAction ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={space.sm}
            onPress={() => {
              current.onAction?.();
              dismissToast();
            }}
            style={styles.action}
          >
            <Text style={styles.actionText}>{current.actionLabel ?? 'Undo'}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.lg, right: space.lg },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.surfaceHigh,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    minHeight: hit.gym,
  },
  message: { ...font.label, color: color.text, flex: 1, paddingVertical: space.sm },
  action: { minHeight: hit.default, paddingHorizontal: space.md, justifyContent: 'center' },
  actionText: { ...font.label, color: color.accent, fontWeight: '700' },
});
