import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

/**
 * Text allowed to shrink to fit, without collapsing to nothing on Android.
 *
 * Two React Native facts meet badly here. `minimumFontScale` is iOS-only, so
 * Android has no floor at all. And Android's auto-shrink reduces `fontSize`
 * while leaving an explicit `lineHeight` exactly where it was — so a style
 * carrying both can never satisfy the height constraint however small the
 * glyphs get, and the search runs all the way to the bottom. That is why the
 * session's 60pt weight rendered at roughly 10pt: not a style choice, a
 * measurement that could not converge.
 *
 * Every type role in `tokens.ts` sets a lineHeight, so every auto-shrinking
 * text in this app was one layout change away from the same collapse. Dropping
 * the leading here fixes the whole class at once, and costs nothing: leading is
 * the space *between* lines, and shrink-to-fit text is nearly always one line.
 */
export function FitText({ style, adjustsFontSizeToFit = true, minimumFontScale = 0.75, ...rest }: TextProps) {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const safe = adjustsFontSizeToFit && flat?.lineHeight !== undefined ? { ...flat, lineHeight: undefined } : flat;
  return <Text {...rest} style={safe} adjustsFontSizeToFit={adjustsFontSizeToFit} minimumFontScale={minimumFontScale} />;
}
