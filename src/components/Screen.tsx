import { type ReactNode, useEffect, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, font, layout, space } from '@/theme/tokens';

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
  /** Wrap children in a ScrollView. Default true. */
  scroll?: boolean;
  /** Apply the standard screen padding to the body. Default true. */
  padded?: boolean;
  /** Trailing header slot — secondary only; nothing critical lives in the top corners. */
  right?: ReactNode;
  /**
   * Height of a fixed dock this screen renders over the scroll, in dp.
   *
   * Screen used to reserve `layout.actionBarHeight` (96) unconditionally, so
   * screens with no dock ended in 96dp of nothing while screens with a taller one
   * still had their last row clipped. Measure the dock and pass it (UX-11).
   */
  footer?: number;
  children?: ReactNode;
}

/**
 * The frame every surface sits in: safe-area aware, dark ground, optional title
 * block. No spinner, no skeleton — local SQLite reads are synchronous, so a
 * screen either has its data or the query is wrong (docs/05).
 */
export function Screen({
  title,
  subtitle,
  scroll = true,
  padded = true,
  right,
  footer = 0,
  children,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const hasHeader = title !== undefined || right !== undefined;

  const body = padded ? styles.padded : undefined;
  /** Whatever this screen actually puts at the bottom, plus a little air. */
  const bottomPad = insets.bottom + footer + layout.scrollTail;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {hasHeader ? (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {title !== undefined ? (
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            ) : null}
            {subtitle !== undefined ? (
              <Text style={styles.subtitle} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right !== undefined ? <View style={styles.headerRight}>{right}</View> : null}
        </View>
      ) : null}

      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[body, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, body]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bg,
  },
  flex: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: layout.screenPadding,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
  headerText: {
    flex: 1,
  },
  headerRight: {
    flexShrink: 0,
  },
  title: {
    ...font.title,
    color: color.text,
  },
  subtitle: {
    ...font.label,
    color: color.textMuted,
    marginTop: space.xs,
  },
});
