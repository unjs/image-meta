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
      // Report the largest image when the file holds several (e.g. icons)
      if (size.images && size.images.length > 1) {
        for (const image of size.images) {
          if (
            (image.width ?? 0) * (image.height ?? 0) >
            (size.width ?? 0) * (size.height ?? 0)
          ) {
            size.width = image.width;
            size.height = image.height;
          }
        }
      }

      // Reading past the end of a truncated input yields NaN or undefined
      if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) {
        throw new TypeError(`Invalid ${type}, truncated or corrupt input`);
      }
      // A zero height is allowed for one-dimensional textures (ktx)
      if (size.width! <= 0 || size.height! < 0) {
        throw new TypeError(`Invalid ${type}, zero or negative size`);
      }
      size.type = type;
      return size;
    }
  }

  // Throw up, if we don't understand the file
  throw new TypeError(`Unsupported file type: ${type}`);
}
