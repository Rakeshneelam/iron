import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { brand, font, hit, radius, space } from '@/theme/tokens';

import { Press } from './Press';

/** Google's four-colour G, as published for sign-in buttons. */
function GoogleMark({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path fill={brand.googleRed} d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill={brand.googleBlue} d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill={brand.googleYellow} d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill={brand.googleGreen} d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

/** "Continue with Google": Google's white button, the G at the left, in the app's pill shape. */
export function GoogleButton({ label = 'Continue with Google', busy = false, onPress }: { label?: string; busy?: boolean; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, busy }}
      style={[styles.button, busy && styles.busy]}
      pressedStyle={styles.pressed}
    >
      <View style={styles.mark}>
        <GoogleMark />
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {busy ? 'Signing in…' : label}
      </Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, minHeight: hit.gym + 8, paddingHorizontal: space.xl, borderRadius: radius.pill, backgroundColor: brand.googleSurface },
  pressed: { backgroundColor: brand.googleSurfacePressed },
  busy: { opacity: 0.7 },
  mark: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  label: { ...font.label, fontSize: 17, fontWeight: '800', color: brand.googleInk },
});
