import { useEffect, useState } from 'react';
import { AccessibilityInfo, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
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
 * How much of the bottom of the screen is already spoken for: a fixed dock, the
 * tab bar, whatever the current screen puts there.
 *
 * Undo has to be reachable by the thumb that just did the thing, and it must
 * never land on top of Log set. Screens with a dock report its measured height —
 * guessing it is how you end up covering a primary action on the one screen where
 * that matters most (UX-11).
 */
const useObstruction = create<{ height: number }>(() => ({ height: 0 }));

/** Call from a fixed dock's onLayout; pass 0 (or unmount cleanup) to clear it. */
export function setToastObstruction(height: number): void {
  useObstruction.setState({ height: Math.max(0, Math.round(height)) });
}

/**
 * Transient confirmation with an optional Undo. The preferred alternative to an
 * "are you sure?" dialog: the action happens at once and is reversible for a few
 * seconds.
 */
export function toast(message: string, action?: { label: string; onPress: () => void }): void {
  useToastStore.setState({ current: { id: ++seq, message, actionLabel: action?.label, onAction: action?.onPress } });
  // A toast is the only confirmation a committed action gets. Unannounced, a
  // screen-reader user has no idea whether the tap did anything.
  AccessibilityInfo.announceForAccessibility(action ? `${message}. ${action.label} available.` : message);
}

export function dismissToast(): void {
  useToastStore.setState({ current: null });
}

/**
 * Only the most recently mounted host draws.
 *
 * A Modal covers the root host, so Sheet mounts its own — which meant that with a
 * sheet open BOTH existed and both rendered the same toast, one of them behind the
 * modal backdrop. A counter keeps exactly one live at a time (UX-11).
 */
const useHosts = create<{ top: number }>(() => ({ top: 0 }));
let hostSeq = 0;

const BASE_MS = 2500;
const ACTION_MS = 5000;

/** Mounted once in the root layout, and once per Sheet. Only the topmost renders. */
export function ToastHost() {
  const current = useToastStore((s) => s.current);
  const obstruction = useObstruction((s) => s.height);
  const top = useHosts((s) => s.top);
  const insets = useSafeAreaInsets();
  const [me] = useState(() => ++hostSeq);
  const [keyboard, setKeyboard] = useState(0);

  useEffect(() => {
    useHosts.setState({ top: me });
    return () => {
      // Back to whoever was under us, so closing a sheet restores the root host.
      useHosts.setState((s) => (s.top === me ? { top: me - 1 } : s));
    };
  }, [me]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const base = current.onAction ? ACTION_MS : BASE_MS;
    // Someone who needs longer to reach Undo has told the OS so; honour it.
    void AccessibilityInfo.getRecommendedTimeoutMillis(base)
      .catch(() => base)
      .then((ms) => {
        if (cancelled) return;
        timer = setTimeout(() => useToastStore.setState((s) => (s.current?.id === current.id ? { current: null } : s)), ms);
      });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [current]);

  if (!current || top !== me) return null;

  // Above the keyboard when it is up, above the dock otherwise. Never both, and
  // never under either.
  const lift = keyboard > 0 ? keyboard : insets.bottom + obstruction;

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: lift + space.sm }]}>
      <Animated.View key={current.id} entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(150)} style={styles.toast}>
        <Text style={styles.message} numberOfLines={3}>
          {current.message}
        </Text>
        {current.onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={current.actionLabel ?? 'Undo'}
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
  action: { minHeight: hit.default, minWidth: hit.default, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center' },
  actionText: { ...font.body, color: color.accent, fontWeight: '700' },
});
