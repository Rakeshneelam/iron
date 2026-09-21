import type { ImageSourcePropType } from 'react-native';

export interface MediaEntry {
  /** A `require()`d local asset. Never a remote URL: Iron makes no network calls. */
  source: ImageSourcePropType;
  /**
   * The end position, when the source provides one.
   *
   * wger and everkinetic supply stills in start/end pairs rather than animations,
   * which is the same idiom the drawn figure already uses — two poses, moved
   * between. Given both, the demo cross-fades; given one, it shows it.
   */
  end?: ImageSourcePropType;
  /** The source's own name for the movement, for the accessibility label. */
  name: string;
  /** Native pixel size of the artwork. Never upscaled past it. */
  size: number;
  /**
   * Per-entry attribution, e.g. "Everkinetic · CC BY-SA 4.0".
   *
   * Required by CC-BY and CC-BY-SA, and per-entry rather than global because a
   * community set has a different author and licence on every image. An entry
   * whose author is unknown cannot be attributed, so it is not imported at all.
   */
  credit?: string;
}
