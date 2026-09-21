/**
 * A text input that actually saves what you typed.
 *
 * `onEndEditing` alone loses edits: on Android it does not fire when the field loses
 * focus to a button tap, and it never fires when the screen is closed while the
 * keyboard is still open — which is exactly how people leave a settings screen.
 * This commits on blur AND on unmount, and re-syncs from the stored value whenever
 * that changes while you are not typing in it.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { color, font, hit, radius, space } from '@/theme/tokens';

export interface TextFieldProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  /** The stored value. The field follows it except while you are editing. */
  value: string;
  /** Called with the finished text (trimmed unless `trim` is false). */
  onCommit: (text: string) => void;
  /**
   * Called on every keystroke. `onCommit` fires on blur, which is right for a
   * settings field but useless to a form whose submit button depends on the value —
   * without this the button stays disabled while you type into it.
   */
  onType?: (text: string) => void;
  trim?: boolean;
}

export function TextField({ value, onCommit, onType, trim = true, onFocus, onBlur, style, ...rest }: TextFieldProps) {
  const [draft, setDraft] = useState(value);
  const editing = useRef(false);
  /** Typed but not yet written; null once written. */
  const pending = useRef<string | null>(null);
  const commit = useRef(onCommit);
  useEffect(() => {
    commit.current = onCommit;
  });

  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);

  useEffect(
    () => () => {
      if (pending.current !== null) commit.current(pending.current);
    },
    [],
  );

  const flush = () => {
    const text = pending.current;
    pending.current = null;
    if (text !== null) commit.current(text);
  };

  return (
    <TextInput
      {...rest}
      value={draft}
      // A default that is legible on this app's dark surfaces. Without it a caller
      // who passes only spacing gets the platform default — black text on near-black.
      style={[styles.field, style]}
      placeholderTextColor={rest.placeholderTextColor ?? color.textFaint}
      onChangeText={(t) => {
        setDraft(t);
        pending.current = trim ? t.trim() : t;
        onType?.(t);
      }}
      onFocus={(e) => {
        editing.current = true;
        onFocus?.(e);
      }}
      onBlur={(e) => {
        editing.current = false;
        flush();
        // An empty field means the write was refused (e.g. a plan needs a name):
        // show what is actually stored rather than a blank line.
        setDraft(draft.trim() ? (trim ? draft.trim() : draft) : value);
        onBlur?.(e);
      }}
      onEndEditing={flush}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    ...font.body,
    color: color.text,
    backgroundColor: color.surfaceHigh,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: hit.default,
  },
});
