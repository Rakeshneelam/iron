import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, font, radius, space } from '@/theme/tokens';

import { ToastHost } from './Toast';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
}

/**
 * Bottom sheet. Dismiss by tapping the backdrop or the handle — there is no
 * confirm button, and this is never used as an "are you sure" (AGENTS.md §1.4).
 * The rest timer keeps running underneath: its truth is a timestamp, not this view.
 */
export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <Pressable onPress={onClose} style={styles.handleHit} accessibilityLabel="Close">
            <View style={styles.handle} />
          </Pressable>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      {/* A Modal covers the root toast host; Undo must stay reachable from inside a sheet. */}
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
  title: { ...font.heading, color: color.text, marginBottom: space.md },
});
