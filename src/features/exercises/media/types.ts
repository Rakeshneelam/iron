import type { ImageSourcePropType } from 'react-native';

export interface MediaEntry {
  /** A `require()`d local asset. Never a remote URL: Iron makes no network calls. */
  source: ImageSourcePropType;
  /** The dataset's own name for the movement, for the accessibility label. */
  name: string;
  /** Native pixel size of the artwork. Never upscaled past it. */
  size: number;
}
