import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, font, hit, radius, space } from '@/theme/tokens';

import { Icon } from './Icon';
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
 * Bottom sheet. Dismiss by tapping the backdrop, the handle, or the Close button —
 * there is no confirm here, and this is never used as an "are you sure"
 * (AGENTS.md §1.4). The rest timer keeps running underneath: its truth is a
 * timestamp, not this view.
 *
 * The handle was the only visible way out and it announced nothing; a labelled
 * Close sits beside the title now, at a full touch target, and the title is a
 * header so a screen reader lands on it rather than on the first stepper (UX-11).
 */
export function Sheet({ visible, onClose, title, subtitle, children }: SheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
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
          {/*
            keyboardShouldPersistTaps so the first tap on a primary action commits
            instead of being spent dismissing the keyboard, and the content can
            always scroll clear of it.
          */}
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      {/* A Modal covers the root toast host; Undo must stay reachable from inside a
          sheet. ToastHost itself makes sure only the topmost one draws. */}
      <ToastHost />
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.lg,
  },
  handleHit: { alignItems: 'center', paddingVertical: space.md },
  handle: { width: space.xxxl, height: space.xs, borderRadius: radius.pill, backgroundColor: color.border },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  flex1: { flex: 1 },
  title: { ...font.titleSm, color: color.text },
  subtitle: { ...font.caption, ...font.numeric, color: color.textMuted, marginTop: 2 },
  close: { width: hit.default, height: hit.default, alignItems: 'center', justifyContent: 'center' },
});
