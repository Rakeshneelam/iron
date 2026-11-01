import { router, useFocusEffect } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, font, layout, material, motion, space } from '@/theme/tokens';

import { IconButton } from './IconButton';
import { setToastObstruction } from './Toast';

/**
 * Reduced-motion flag, read from the OS accessibility setting.
 *
 * It lives in `Screen.tsx` rather than its own module purely because of file
 * ownership in this build; every animated primitive imports it from here.
 * When true, components jump straight to their end state instead of animating
 * (docs/05 — "Respect prefers-reduced-motion").
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (alive) setReduced(enabled);
      })
      .catch(() => {
        /* the setting is unavailable on this platform — assume motion is fine */
      });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduced(enabled);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}

export interface ScreenProps {
  title?: string;
  subtitle?: string;
  /**
   * A pushed screen: a back arrow before a smaller title. `true` goes back (or
   * home when there is nothing to go back to); a function does its own thing.
   */
  back?: boolean | (() => void);
  backLabel?: string;
  /** Wrap children in a ScrollView. Default true. */
  scroll?: boolean;
  /** Apply the standard screen padding to the body. Default true. */
  padded?: boolean;
  /** Trailing header slot — secondary only; nothing critical lives in the top corners. */
  right?: ReactNode;
  /** A strip pinned under the header (section tabs), above the scroll. */
  strip?: ReactNode;
  /**
   * The screen's primary action, pinned to the bottom third. Measured, so the
   * scroll clears it exactly and Undo lands above it rather than on it (UX-11).
   */
  dock?: ReactNode;
  /** Sits above the tab bar, which already owns the bottom inset. */
  tab?: boolean;
  /**
   * The body rises in as the screen opens. On by default; off where the screen
   * sequences its own entrance (Today) or must be still (the logging screen).
   */
  enter?: boolean;
  children?: ReactNode;
}

/**
 * The frame every surface sits in: safe-area aware, dark ground, optional title
 * block. No spinner, no skeleton — local SQLite reads are synchronous, so a
 * screen either has its data or the query is wrong (docs/05).
 */
export function Screen({ title, subtitle, back, backLabel = 'Back', scroll = true, padded = true, right, strip, dock, tab = false, enter = true, children }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const rise = enter && !reduced ? FadeInDown.duration(motion.slow + 100) : undefined;
  const [dockHeight, setDockHeight] = useState(0);
  /**
   * How far the content has moved under the chrome.
   *
   * The header and the dock each draw a hairline, and each one fades in only once
   * there is something behind it to separate from. A screen whose content fits has
   * no rules on it at all; a long one gets them the moment it starts scrolling.
   * The alternative — drawing them always — puts a line under the title of every
   * short screen in the app, which is a line that means nothing.
   *
   * Deliberately NOT a collapsing header. Shrinking the title on scroll needs the
   * header box to have a fixed height, and every height here is set by text that
   * the user may have scaled to 200% (WCAG 1.4.4). A hairline costs no layout and
   * cannot clip anybody's text.
   */
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  const hasHeader = title !== undefined || right !== undefined || back !== undefined;
  const bottomInset = tab ? 0 : insets.bottom;

  // Tab scenes stay mounted side by side: the dock of the one on screen is the one
  // a toast has to clear, so the reservation follows focus.
  const reserve = dock ? dockHeight : 0;
  useFocusEffect(
    useCallback(() => {
      setToastObstruction(reserve);
      return () => setToastObstruction(0);
    }, [reserve]),
  );

  const body = padded ? styles.padded : undefined;
  /** Whatever this screen actually puts at the bottom, plus a little air. */
  const bottomPad = (dock ? dockHeight : bottomInset) + layout.scrollTail;
  const goBack = typeof back === 'function' ? back : () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {hasHeader ? (
        <View style={[styles.header, back ? styles.headerBack : null]}>
          {back ? <IconButton icon="chevronLeft" accessibilityLabel={backLabel} onPress={goBack} /> : null}
          <View style={[styles.headerText, back ? styles.headerTextBack : null]}>
            {title !== undefined ? (
              <Text style={back ? styles.titleSm : styles.title} numberOfLines={1} accessibilityRole="header">
                {title}
              </Text>
            ) : null}
            {subtitle !== undefined ? (
              <Text style={back ? styles.subtitleSm : styles.subtitle} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right !== undefined ? <View style={styles.headerRight}>{right}</View> : back ? <View style={styles.balance} /> : null}
        </View>
      ) : null}

      {strip ? <View style={styles.strip}>{strip}</View> : null}

      {scroll ? (
        <Animated.ScrollView
          style={styles.flex}
          contentContainerStyle={[body, strip ? styles.afterStrip : null, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          <Animated.View entering={rise}>{children}</Animated.View>
        </Animated.ScrollView>
      ) : (
        <Animated.View entering={rise} style={[styles.flex, body]}>
          {children}
        </Animated.View>
      )}

      {dock ? (
        <View style={[styles.dock, { paddingBottom: space.md + bottomInset }]} onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}>
          {/* Content scrolls up under the dock and fades into the stage, not behind a rule. */}
          <View style={styles.fade} pointerEvents="none" />
          {dock}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  padded: { paddingHorizontal: layout.screenPadding },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  headerBack: { paddingTop: space.sm, paddingBottom: space.sm },
  headerText: { flex: 1 },
  headerTextBack: { alignItems: 'center' },
  headerRight: { flexShrink: 0, flexDirection: 'row', gap: space.sm },
  /** Keeps a pushed screen's title centred when nothing sits on its right. */
  balance: { width: 46 },
  title: { ...font.title, color: color.text },
  titleSm: { ...font.titleSm, color: color.text, textAlign: 'center' },
  subtitle: { ...font.label, fontSize: 14, color: color.textMuted, marginTop: 2 },
  subtitleSm: { ...font.caption, fontSize: 12, color: color.textMuted, marginTop: 1, textAlign: 'center' },
  strip: { paddingHorizontal: layout.screenPadding, paddingBottom: space.sm },
  afterStrip: { paddingTop: space.sm },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.lg,
  },
  fade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    experimental_backgroundImage: material.dockFade,
  },
});
