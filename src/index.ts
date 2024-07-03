import { typeHandlers } from "./types";
import { detector } from "./detector";
import type { ImageMeta } from "./types/interface";

export type { ImageMeta } from "./types/interface";

/**
 * @param {Uint8Array|string} input - Uint8Array or relative/absolute path of the image file
 * @param {Function=} [callback] - optional function for async detection
 */
export function imageMeta(input: Uint8Array): ImageMeta {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError("Input should be a Uint8Array");
  }

  // Detect the file type.. don't rely on the extension
  const type = detector(input);

  // Find an appropriate handler for this file type
  if (type !== undefined && type in typeHandlers) {
    const size = typeHandlers[type].calculate(input);
    if (size !== undefined) {
      size.type = type;
      return size;
    }
  }

  // Throw up, if we don't understand the file
  throw new TypeError(`Unsupported file type: ${type}`);
}
