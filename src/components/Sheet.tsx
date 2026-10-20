import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { impact } from '@/lib/haptics';
import { color, font, hit, material, motion, radius, space } from '@/theme/tokens';

import { Icon } from './Icon';
import { useReducedMotion } from './Screen';
import { ToastHost } from './Toast';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** One muted line under the title: "2 of 6 done · 21:05". */
  subtitle?: ReactNode;
  children?: ReactNode;
}

/**
 * Where a flick would come to rest if it kept decelerating. Apple's exponential
 * decay, not the v²/2a from physics class — it is what makes a short fast swipe
 * dismiss and a long slow drag not.
 */
function project(velocity: number, decelerationRate = 0.998): number {
  'worklet';
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** The further past the top edge, the less the sheet follows the finger. */
function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  'worklet';
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Past this much of the sheet's own height — travelled or projected — it closes. */
const DISMISS_FRACTION = 0.4;

/**
 * Bottom sheet. Dismiss by dragging the handle down, tapping the backdrop, the
 * handle, or the Close button — there is no confirm here, and this is never used
 * as an "are you sure" (AGENTS.md §1.4). The rest timer keeps running underneath:
 * its truth is a timestamp, not this view.
 *
 * The handle was the only visible way out and it announced nothing; a labelled
 * Close sits beside the title now, at a full touch target, and the title is a
 * header so a screen reader lands on it rather than on the first stepper (UX-11).
 *
 * It used to open and close on `Modal animationType="slide"` — the OS's own
 * transition, which cannot be grabbed, cannot be reversed, and cannot hand a
 * flick's momentum to anything. Now the position is a shared value on the UI
 * thread: the drag follows the finger exactly, the backdrop's opacity is derived
 * from the same number so the two can never disagree, and releasing hands the
 * gesture's velocity straight to the spring, which is the detail that removes the
 * seam between finger and animation.
 *
 * The pan sits on the handle and title, not the whole sheet. A pan over the
 * scrolling content would have to arbitrate with it on every drag, and losing
 * that arbitration looks like a broken list rather than a missed gesture — a
 * trade the skill's own recipe warns about.
 */
export function Sheet({ visible, onClose, title, subtitle, children }: SheetProps) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const reduced = useReducedMotion();

  /**
   * A `Modal` whose `visible` follows the prop exactly cannot animate out at all —
   * it is gone on the frame the prop changes. So it stays mounted through the exit
   * and unmounts when the spring reports it has finished.
   *
   * `closing` is adjusted during render rather than in an effect. Reacting to a
   * changed prop by calling setState inside useEffect costs an extra render pass
   * and is what react.dev's "You Might Not Need an Effect" is about; comparing
   * against the previous prop here settles it before the first paint.
   */
  const [previous, setPrevious] = useState(visible);
  const [closing, setClosing] = useState(false);
  if (previous !== visible) {
    setPrevious(visible);
    // Reduced motion gets no exit animation, so it needs no extra frame mounted.
    if (!visible && !reduced) setClosing(true);
  }
  const rendered = visible || closing;

  /** Offscreen is the resting state, so the first frame after mount is already down. */
  const y = useSharedValue(screenH);
  const grabbed = useSharedValue(0);
  /** Measured, and only used for the dismiss threshold: a short sheet needs a short drag. */
  const sheetH = useSharedValue(screenH);

  useEffect(() => {
    if (!rendered) return;
    if (visible) {
      y.set(reduced ? 0 : withSpring(0, motion.spring.sheet));
      return;
    }
    y.set(
      withSpring(screenH, { ...motion.spring.sheet, overshootClamping: true }, (finished) => {
        if (finished) scheduleOnRN(setClosing, false);
      }),
    );
  }, [visible, rendered, reduced, screenH, y]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Declare the axis, or this steals the horizontal swipes inside the sheet.
        .activeOffsetY([-10, 10])
        .onStart(() => {
          // From where the sheet actually is, so grabbing one mid-flight continues
          // from there instead of teleporting to the top.
          grabbed.set(y.get());
        })
        .onUpdate((e) => {
          const next = grabbed.get() + e.translationY;
          // Down is free; up past the top resists rather than stopping dead.
          y.set(next >= 0 ? next : rubberband(next, screenH));
        })
        .onEnd((e) => {
          const travel = sheetH.get() * DISMISS_FRACTION;
          if (y.get() + project(e.velocityY) > travel) {
            y.set(
              withSpring(
                screenH,
                {
                  ...motion.spring.sheet,
                  velocity: e.velocityY,
                  overshootClamping: true,
                },
                (finished) => {
                  if (finished) scheduleOnRN(onClose);
                },
              ),
            );
            return;
          }
          y.set(withSpring(0, { ...motion.spring.sheet, velocity: e.velocityY }));
          // It snapped home — the one haptic in this gesture, at the moment of the
          // decision rather than when the spring finishes settling.
          scheduleOnRN(impact);
        }),
    [onClose, screenH, y, grabbed, sheetH],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.get() }],
  }));
  // Derived from the same number as the sheet, so the two can never disagree.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.get(), [0, screenH], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <Modal visible={rendered} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/*
        A Modal renders into its own view hierarchy, outside the root
        GestureHandlerRootView in `app/_layout`. Without a root of its own here the
        pan below is silently dead on Android — no gesture, no error, which is the
        worst way for this to fail and the reason it is wrapped rather than
        assumed. Nesting one is the documented fix, and it costs a single view.
      */}
      <GestureHandlerRootView style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents="auto">
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
          </Animated.View>
          <Animated.View
            style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }, sheetStyle]}
            onLayout={(e) => sheetH.set(e.nativeEvent.layout.height)}
          >
            <View style={styles.edge} pointerEvents="none" />
            <GestureDetector gesture={pan}>
              {/* The grab zone: handle and title. Generous on purpose — it is the
                only part of the sheet a thumb can drag. */}
              <View>
                <Pressable onPress={onClose} style={styles.handleHit} accessibilityLabel="Close" accessibilityRole="button">
                  <View style={styles.handle} />
                </Pressable>
                <View style={styles.titleRow}>
                  {title ? (
                    <View style={styles.flex1}>
                      <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
                        {title}
                      </Text>
                      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                    </View>
                  ) : (
                    <View style={styles.flex} />
                  )}
                  <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.close} hitSlop={space.xs}>
                    <Icon name="close" size={22} color={color.textMuted} />
                  </Pressable>
                </View>
              </View>
            </GestureDetector>
            {/*
            keyboardShouldPersistTaps so the first tap on a primary action commits
            instead of being spent dismissing the keyboard, and the content can
            always scroll clear of it.
          */}
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
      {/* A Modal covers the root toast host; Undo must stay reachable from inside a
          sheet. ToastHost itself makes sure only the topmost one draws. */}
      <ToastHost />
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.lg,
  },
  /** A sheet sits nearest the light, so its edge is the strong one. */
  edge: {
    position: 'absolute',
    top: 0,
    left: radius.xl,
    right: radius.xl,
    height: StyleSheet.hairlineWidth,
    backgroundColor: material.edgeStrong,
  },
  handleHit: { alignItems: 'center', paddingVertical: space.md },
  handle: {
    width: space.xxxl,
    height: space.xs,
    borderRadius: radius.pill,
    backgroundColor: color.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.md,
  },
  flex1: { flex: 1 },
  title: { ...font.titleSm, color: color.text },
  subtitle: {
    ...font.caption,
    ...font.numeric,
    color: color.textMuted,
    marginTop: 2,
  },
  close: {
    width: hit.default,
    height: hit.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
