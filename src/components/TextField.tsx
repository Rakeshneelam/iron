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
import { TextInput, type TextInputProps } from 'react-native';

import { color } from '@/theme/tokens';

export interface TextFieldProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  /** The stored value. The field follows it except while you are editing. */
  value: string;
  /** Called with the finished text (trimmed unless `trim` is false). */
  onCommit: (text: string) => void;
  trim?: boolean;
}

export function TextField({ value, onCommit, trim = true, onFocus, onBlur, ...rest }: TextFieldProps) {
  const [draft, setDraft] = useState(value);
  const editing = useRef(false);
  /** Typed but not yet written; null once written. */
  const pending = useRef<string | null>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;

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
      placeholderTextColor={rest.placeholderTextColor ?? color.textFaint}
      onChangeText={(t) => {
        setDraft(t);
        pending.current = trim ? t.trim() : t;
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
